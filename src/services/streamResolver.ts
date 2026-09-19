import { api } from './api';
import { consumet } from './consumet';
import { animepahe } from './animepahe';
import { anivexa } from './anivexa';
import { anikage } from './anikage';
import { oneanime } from './oneanime';
import { anify } from './anify';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioType, StreamSource, SubtitleTrack } from '@/types';

// Session cache: skipping through a season must not re-fire every
// backend per episode. 10-minute TTL.
const streamCache = new Map<string, { at: number; value: ResolvedStreams }>();
const CACHE_TTL_MS = 10 * 60_000;

/** Fired (with the cache key as detail) when a background merge adds late
 *  provider streams to an already-returned result — pages re-render via
 *  their useApi reload and pick up the grown source list. */
export const streamUpdates = new EventTarget();

export interface ResolvedStreams {
  streams: StreamSource[];
  subtitles?: SubtitleTrack[];
  /** Why each provider failed, in the order they were tried. Surfaced in the
   *  "No playable stream found" screen so failures are diagnosable instead
   *  of silent. Grows as slow providers fail in the background. */
  errors: string[];
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Order streams by the user's provider preference list (prefix match on
 *  "server" so e.g. "anikage:koto" follows "anikage"). */
function prioritize(streams: StreamSource[]): StreamSource[] {
  const order = useSettingsStore.getState().providerPriority;
  const rank = (s: StreamSource) => {
    const i = order.findIndex((o) => s.server === o || s.server?.startsWith(`${o}:`));
    return i === -1 ? 99 : i;
  };
  return [...streams].sort((a, b) => rank(a) - rank(b));
}

/** Family key of a stream source ("anify:zoro" -> "anify"). */
function familyOf(s: StreamSource): string {
  return (s.server ?? '').split(':')[0].toLowerCase();
}

type ProviderResult = { streams: StreamSource[]; subtitles?: SubtitleTrack[] };

interface TaggedResult {
  /** Lowercase family tag the streams carry in "server" ("anify", "anikage",
   *  "consumet", ...). Kuhi/Anivexa native streams carry bare provider names,
   *  so their tag never matches a family and falls back gracefully. */
  tag: string;
  result: ProviderResult;
}

/**
 * Resolve playable streams for an episode.
 *
 * All providers run IN PARALLEL. The first non-empty result is returned
 * IMMEDIATELY (playback starts, nothing waits). Slower providers merge in
 * the BACKGROUND: their streams (deduped by URL) are appended to the live
 * result and `streamUpdates` fires so the page re-renders with the fuller
 * source list. Adding a provider adds redundancy, not latency.
 *
 * Subtitles follow the provider family of the top-prioritized stream —
 * mixing e.g. AniZone video with MKissa subtitles puts timings off by
 * miles — and are re-checked after every merge.
 */
async function resolveStreamsInner(
  animeId: number | string,
  episode: number,
  audio: AudioType = 'sub',
  title?: string,
): Promise<ResolvedStreams> {
  const titleQ = title?.trim() || String(animeId);
  const errors: string[] = [];
  const settings = useSettingsStore.getState();

  interface Attempt {
    tag: string;
    name: string;
    run: () => Promise<ProviderResult>;
  }

  const nonEmpty = (name: string, r: ProviderResult): ProviderResult => {
    if (!r.streams.length) throw new Error(`${name}: no streams for this episode`);
    return r;
  };

  const attempts: Attempt[] = [
    {
      tag: 'kuhi',
      name: 'Kuhi',
      run: async () => {
        const r = await api.extract(animeId, episode, audio);
        return nonEmpty('Kuhi', { streams: r.streams ?? [], subtitles: r.subtitles });
      },
    },
    {
      tag: 'anivexa',
      name: 'Anivexa',
      run: async () => {
        if (!settings.enableAnivexa) throw new Error('Anivexa: disabled in Settings');
        return nonEmpty('Anivexa', await anivexa.watchAll(animeId, episode, audio));
      },
    },
    { tag: 'anify', name: 'Anify', run: () => anify.streams(animeId, episode, audio) },
    { tag: '1anime', name: '1anime', run: () => oneanime.streams(animeId, episode, audio) },
    {
      tag: 'anikage',
      name: 'AniKage',
      run: async () => {
        const results = await anikage.search(titleQ);
        const best = results.find((r) => r.anilistId === Number(animeId)) ?? results[0];
        if (!best) throw new Error('AniKage: anime not found');
        return nonEmpty('AniKage', await anikage.sources(best.slug, episode, audio));
      },
    },
    {
      tag: 'consumet',
      name: 'Consumet',
      run: async () => {
        if (!settings.enableConsumetFallback) throw new Error('Consumet: disabled in Settings');
        const results = await consumet.search(titleQ);
        const best = results[0];
        if (!best) throw new Error('Consumet: anime not found');
        const detail = await consumet.info(best.id);
        const ep =
          detail.episodes.find((e) => e.number === episode) ??
          detail.episodes[episode - 1];
        if (!ep) throw new Error('Consumet: episode not found');
        const watch = await consumet.watch(ep.id);
        const streams: StreamSource[] = (watch.sources ?? [])
          .filter((s) => s?.url)
          .map((s) => ({
            type: s.isM3U8 || s.url.includes('.m3u8') ? 'hls' : 'mp4',
            url: s.url,
            server: 'consumet:gogoanime',
            audio,
            quality: s.quality,
            referer: watch.headers?.Referer,
          }));
        return nonEmpty('Consumet', { streams });
      },
    },
    {
      tag: 'animepahe',
      name: 'animepahe',
      run: async () => {
        const results = await animepahe.search(titleQ);
        const best = results[0];
        if (!best) throw new Error('animepahe: anime not found');
        const epSession = await animepahe.findEpisode(best.session, episode);
        if (!epSession) throw new Error('animepahe: episode not found');
        const streams = await animepahe.streams(epSession);
        const filtered =
          audio === 'dub' ? streams.filter((s) => s.audio === 'dub') : streams;
        return nonEmpty('animepahe', { streams: filtered.length > 0 ? filtered : streams });
      },
    },
  ];

  // Run every attempt concurrently; each failure is recorded (live array,
  // visible even to callers who already received the result) and re-thrown.
  const pending = attempts.map((a) =>
    a
      .run()
      .then((result): TaggedResult => ({ tag: a.tag, result }))
      .catch((e: unknown) => {
        errors.push(errMsg(e));
        throw e;
      }),
  );

  const allSettled = Promise.allSettled(pending);

  let first: TaggedResult;
  try {
    first = await Promise.any(pending);
  } catch (e) {
    if (e instanceof AggregateError) return { streams: [], errors };
    throw e;
  }

  // Immediate result — playback starts from this, no merge waiting.
  const value: ResolvedStreams = {
    streams: prioritize(first.result.streams),
    subtitles: first.result.subtitles,
    errors,
  };

  // Background merge: late providers append streams (deduped) to the LIVE
  // result and fire an update event so pages re-render with the fuller list.
  void (async () => {
    const settled = await Promise.race([
      allSettled,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]);
    if (!settled) return;

    const ok: TaggedResult[] = (
      settled.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<TaggedResult>[]
    ).map((r) => r.value);

    const seen = new Set(value.streams.map((s) => s.url));
    let added = 0;
    for (const { result } of ok) {
      for (const s of result.streams) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        value.streams.push(s);
        added++;
      }
    }
    if (added > 0) value.streams = prioritize(value.streams);

    // Subtitles follow the provider family of the top-prioritized stream.
    if (value.streams.length > 0) {
      const topFamily = familyOf(value.streams[0]);
      const better = ok.find(
        (t) => t.tag === topFamily && t.result.subtitles && t.result.subtitles.length > 0,
      );
      if (better) value.subtitles = better.result.subtitles;
    }

    if (added > 0) {
      streamUpdates.dispatchEvent(
        new CustomEvent('update', { detail: `${animeId}|${episode}|${audio}` }),
      );
    }
  })();

  return value;
}

export async function resolveStreams(
  animeId: number | string,
  episode: number,
  audio: AudioType = 'sub',
  title?: string,
): Promise<ResolvedStreams> {
  const key = `${animeId}|${episode}|${audio}`;
  const hit = streamCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    // Fresh wrapper so React sees new state on reload; the streams array may
    // have grown via a background merge since the last read.
    const v = hit.value;
    return { streams: [...v.streams], subtitles: v.subtitles, errors: v.errors };
  }
  const value = await resolveStreamsInner(animeId, episode, audio, title);
  streamCache.set(key, { at: Date.now(), value });
  return value;
}