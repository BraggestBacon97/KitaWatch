import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioType, StreamSource, SubtitleTrack } from '@/types';

/**
 * Anify (https://anify.tv) — entry #17 on the community list. Public JSON
 * API keyed by AniList ID, no key required:
 *
 *   GET /anime/{anilistId}
 *     -> { episodes: { data: [ { providerId, episodes: [...] } ] } }
 *   GET /sources?episodeId={ep.id}&providerId={pid}&watchId={ep.watchId ?? ep.id}&subType=sub
 *     -> { sources: [{ url, isM3U8, quality }], subtitles: [{ url, lang }] }
 *
 * CORS varies by deployment, so all calls go through the local proxy
 * (api.anify.tv must stay in the proxy allowlist).
 *
 * NOTE: the API shapes above are normalized defensively below — if Anify
 * changes its schema, adjust the two normalize helpers, nothing else.
 */
const API = 'https://api.anify.tv';

/** Provider preference within Anify (self-hosted first, then big backends). */
const PREFERRED_PROVIDERS = ['anify', 'zoro', 'gogoanime', 'animepahe'];

function proxyBase(): string {
  return useSettingsStore.getState().proxyBaseUrl.replace(/\/$/, '');
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${API}${path}`;
  const res = await fetch(`${proxyBase()}/cors?u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Anify responded ${res.status}`);
  return (await res.json()) as T;
}

interface AnifyEpisodeBundle {
  providerId?: string;
  episodes?: {
    id?: string;
    watchId?: string;
    number?: number;
    title?: string;
  }[];
}

interface AnifySources {
  sources?: { url?: string; isM3U8?: boolean; quality?: string }[];
  subtitles?: { url?: string; lang?: string }[];
}

export const anify = {
  async streams(
    anilistId: number | string,
    episode: number,
    audio: AudioType,
  ): Promise<{ streams: StreamSource[]; subtitles: SubtitleTrack[] }> {
    const info = await getJson<{ episodes?: { data?: AnifyEpisodeBundle[] } }>(
      `/anime/${anilistId}`,
    );

    const bundles = info.episodes?.data ?? [];
    // Pick the best provider bundle that actually has this episode.
    const sorted = [...bundles].sort(
      (a, b) =>
        PREFERRED_PROVIDERS.indexOf(a.providerId ?? '') -
        PREFERRED_PROVIDERS.indexOf(b.providerId ?? ''),
    );
    let lastError: unknown = null;
    for (const bundle of sorted) {
      const pid = bundle.providerId;
      if (!pid) continue;
      const ep = (bundle.episodes ?? []).find((e) => e.number === episode);
      if (!ep?.id) continue;
      const watchId = ep.watchId ?? ep.id;
      try {
        const src = await getJson<AnifySources>(
          `/sources?episodeId=${encodeURIComponent(ep.id)}&providerId=${encodeURIComponent(pid)}&watchId=${encodeURIComponent(watchId)}&subType=${audio === 'dub' ? 'dub' : 'sub'}`,
        );
        const streams: StreamSource[] = (src.sources ?? [])
          .filter((s) => s.url)
          .map((s) => ({
            type: s.isM3U8 || s.url!.includes('.m3u8') ? 'hls' : 'mp4',
            url: s.url!,
            server: `anify:${pid}`,
            audio,
            quality: s.quality,
          }));
        if (streams.length > 0) {
          const subtitles: SubtitleTrack[] = (src.subtitles ?? [])
            .filter((s) => s.url)
            .map((s) => ({ url: s.url!, lang: s.lang ?? 'sub' }));
          return { streams, subtitles };
        }
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Anify: no streams for this episode');
  },
};