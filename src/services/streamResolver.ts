import { api } from './api';
import { consumet } from './consumet';
import { animepahe } from './animepahe';
import { anivexa } from './anivexa';
import { anikage } from './anikage';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioType, StreamSource, SubtitleTrack } from '@/types';

export interface ResolvedStreams {
  streams: StreamSource[];
  subtitles?: SubtitleTrack[];
}

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
 *  2) Consumet (self-hosted Gogoanime)
 *  3) animepahe (via local proxy — kwik streams are referer-locked) */
export async function resolveStreams(
  animeId: number | string,
  episode: number,
  audio: AudioType = 'sub',
  title?: string,
): Promise<ResolvedStreams> {
  const titleQ = title?.trim() || String(animeId);

  // 1) Kuhi
  try {
    const r = await api.extract(animeId, episode, audio);
    if (r.streams?.length) {
      return { streams: prioritize(r.streams), subtitles: r.subtitles };
    }
  } catch {
    // fall through
  }

  const settings = useSettingsStore.getState();

  // 2) Anivexa — maintained provider aggregator, no title needed
  if (settings.enableAnivexa) {
    try {
      const r = await anivexa.watchAll(animeId, episode, audio);
      if (r.streams.length) return { streams: prioritize(r.streams), subtitles: r.subtitles };
    } catch {
      // fall through
    }
  }

  // 3) AniKage — documented JSON API, slug-based, referer-locked CDN
  try {
    const results = await anikage.search(titleQ);
    const best =
      results.find((r) => r.anilistId === Number(animeId)) ?? results[0];
    if (best) {
      const r = await anikage.sources(best.slug, episode, audio);
      if (r.streams.length) {
        return { streams: prioritize(r.streams), subtitles: r.subtitles };
      }
    }
  } catch {
    // fall through
  }

  // 4) Consumet
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
          if (streams.length) return { streams };
        }
      }
    } catch {
      // fall through
    }
  }

  // 3) animepahe
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
          return { streams: filtered.length > 0 ? filtered : streams };
        }
      }
    }
  } catch {
    // fall through
  }

  return { streams: [] };
}
