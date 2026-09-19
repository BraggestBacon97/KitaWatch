import { api } from './api';
import { consumet } from './consumet';
import { animepahe } from './animepahe';
import { anivexa } from './anivexa';
import { anikage } from './anikage';
import { oneanime } from './oneanime';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioType, StreamSource, SubtitleTrack } from '@/types';

// Session cache: skipping through a season must not re-fire every
// backend per episode. 10-minute TTL.
const streamCache = new Map<string, { at: number; value: ResolvedStreams }>();
const CACHE_TTL_MS = 10 * 60_000;

export interface ResolvedStreams {
  streams: StreamSource[];
  subtitles?: SubtitleTrack[];
  /** Why each provider failed, in the order they were tried. Surfaced in the
   *  "No playable stream found" screen so failures are diagnosable instead
   *  of silent. */
  errors: string[];
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Order streams by the user's provider preference list. */
function prioritize(streams: StreamSource[]): StreamSource[] {
  const order = useSettingsStore.getState().providerPriority;
  const rank = (s: StreamSource) => {
    const i = s.server ? order.indexOf(s.server) : -1;
    return i === -1 ? 99 : i;
  };
  return [...streams].sort((a, b) => rank(a) - rank(b));
}

/** Resolve playable streams for an episode, best source first:
 *  1) Kuhi extraction (by AniList ID) — races native providers
 *  2) Anivexa — maintained provider aggregator
 *  3) 1anime — captured aggregator API (by AniList ID)
 *  4) AniKage — documented JSON API, slug-based, referer-locked CDN
 *  5) Consumet (self-hosted Gogoanime)
 *  6) animepahe (via local proxy — kwik streams are referer-locked) */
async function resolveStreamsInner(
  animeId: number | string,
  episode: number,
  audio: AudioType = 'sub',
  title?: string,
): Promise<ResolvedStreams> {
  const titleQ = title?.trim() || String(animeId);
  const errors: string[] = [];

  // 1) Kuhi
  try {
    const r = await api.extract(animeId, episode, audio);
    if (r.streams?.length) {
      return { streams: prioritize(r.streams), subtitles: r.subtitles, errors };
    }
    errors.push('Kuhi: no streams for this episode');
  } catch (e) {
    errors.push(`Kuhi: ${errMsg(e)}`);
  }

  const settings = useSettingsStore.getState();

  // 2) Anivexa — maintained provider aggregator, no title needed
  if (settings.enableAnivexa) {
    try {
      const r = await anivexa.watchAll(animeId, episode, audio);
      if (r.streams.length) return { streams: prioritize(r.streams), subtitles: r.subtitles, errors };
      errors.push('Anivexa: no streams for this episode');
    } catch (e) {
      errors.push(`Anivexa: ${errMsg(e)}`);
    }
  } else {
    errors.push('Anivexa: disabled in Settings');
  }

  // 3) 1anime — captured aggregator API (by AniList ID)
  try {
    const r = await oneanime.streams(animeId, episode, audio);
    if (r.streams.length) {
      return { streams: prioritize(r.streams), subtitles: r.subtitles, errors };
    }
    errors.push('1anime: no streams for this episode');
  } catch (e) {
    errors.push(`1anime: ${errMsg(e)}`);
  }

  // 4) AniKage — documented JSON API, slug-based, referer-locked CDN
  try {
    const results = await anikage.search(titleQ);
    const best =
      results.find((r) => r.anilistId === Number(animeId)) ?? results[0];
    if (best) {
      const r = await anikage.sources(best.slug, episode, audio);
      if (r.streams.length) {
        return { streams: prioritize(r.streams), subtitles: r.subtitles, errors };
      }
      errors.push('AniKage: no streams for this episode');
    } else {
      errors.push('AniKage: anime not found');
    }
  } catch (e) {
    errors.push(`AniKage: ${errMsg(e)}`);
  }

  // 5) Consumet
  if (settings.enableConsumetFallback) {
    try {
      const results = await consumet.search(titleQ);
      const best = results[0];
      if (best) {
        const detail = await consumet.info(best.id);
        const ep =
          detail.episodes.find((e) => e.number === episode) ??
          detail.episodes[episode - 1];
        if (ep) {
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
          if (streams.length) return { streams, errors };
          errors.push('Consumet: no stream URLs returned');
        } else {
          errors.push('Consumet: episode not found');
        }
      } else {
        errors.push('Consumet: anime not found');
      }
    } catch (e) {
      errors.push(`Consumet: ${errMsg(e)}`);
    }
  } else {
    errors.push('Consumet: disabled in Settings');
  }

  // 6) animepahe
  try {
    const results = await animepahe.search(titleQ);
    const best = results[0];
    if (best) {
      const epSession = await animepahe.findEpisode(best.session, episode);
      if (epSession) {
        const streams = await animepahe.streams(epSession);
        const filtered =
          audio === 'dub' ? streams.filter((s) => s.audio === 'dub') : streams;
        if ((filtered.length > 0 ? filtered : streams).length > 0) {
          return { streams: filtered.length > 0 ? filtered : streams, errors };
        }
        errors.push('animepahe: no streams for this episode');
      } else {
        errors.push('animepahe: episode not found');
      }
    } else {
      errors.push('animepahe: anime not found');
    }
  } catch (e) {
    errors.push(`animepahe: ${errMsg(e)}`);
  }

  return { streams: [], errors };
}

export async function resolveStreams(
  animeId: number | string,
  episode: number,
  audio: AudioType = 'sub',
  title?: string,
): Promise<ResolvedStreams> {
  const key = `${animeId}|${episode}|${audio}`;
  const hit = streamCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await resolveStreamsInner(animeId, episode, audio, title);
  streamCache.set(key, { at: Date.now(), value });
  return value;
}