import { useSettingsStore } from '@/stores/settingsStore';
import type { AudioType, StreamSource, SubtitleTrack } from '@/types';

/**
 * AniKage JSON API (https://anikage.cc/api/media/anime).
 * Docs courtesy of the user's friend. Search is slug-based; stream tokens
 * expand to og.bakayaro.live URLs; the CDN enforces Referer anikage.cc,
 * so everything plays viaProxy through the local sidecar.
 */
const API = 'https://anikage.cc/api/media/anime';
const ORIGIN = 'https://anikage.cc/';
const CDN = 'https://og.bakayaro.live';

function proxyBase(): string {
  return useSettingsStore.getState().proxyBaseUrl.replace(/\/$/, '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get<T>(path: string): Promise<T> {
  const url = `${API}${path}`;
  // anikage.cc sends no CORS headers, so a direct fetch from the WebView is
  // ALWAYS blocked — and still counts against their rate limiter. Go
  // straight through the local proxy instead of wasting a doomed request.
  let res = await fetch(
    `${proxyBase()}/cors?u=${encodeURIComponent(url)}&ref=${encodeURIComponent(ORIGIN)}`,
  );
  if (res.status === 429) {
    await sleep(2500); // rate-limited — back off and try once more
    res = await fetch(
      `${proxyBase()}/cors?u=${encodeURIComponent(url)}&ref=${encodeURIComponent(ORIGIN)}`,
    );
  }
  if (!res.ok) throw new Error(`AniKage responded ${res.status}`);
  return (await res.json()) as T;
}

export interface AniKageSearchResult {
  slug: string;
  anilistId?: number;
  title?: { english?: string; romaji?: string; native?: string };
  coverImage?: { large?: string; medium?: string };
  episodes?: number | null;
}

interface ServerInfo {
  id: string;
  subTypes?: string[];
}

interface SourcesResponse {
  sources?: { url?: string; isM3U8?: boolean; quality?: string; label?: string }[];
  subtitles?: { label?: string; file?: string }[];
}

export interface AniKageStreams {
  streams: StreamSource[];
  subtitles: SubtitleTrack[];
}

export const anikage = {
  search: (q: string) =>
    get<{ data?: AniKageSearchResult[] }>(`/search?q=${encodeURIComponent(q)}`).then(
      (r) => r.data ?? [],
    ),

  /** Enumerate servers for the episode and resolve every available stream. */
  async sources(slug: string, episode: number, audio: AudioType): Promise<AniKageStreams> {
    const info = await get<{ servers?: ServerInfo[] }>(
      `/${encodeURIComponent(slug)}/episodes/${episode}/servers`,
    );

    const streams: StreamSource[] = [];
    const subtitles: SubtitleTrack[] = [];

    let i = 0;
    // Probe at most 3 servers: AniKage rate-limits per IP, and every probe is
    // a request the resolver may re-fire on the next episode.
    for (const srv of (info.servers ?? []).slice(0, 3)) {
      // Stagger probes: firing all servers at once trips AniKage's rate limiter (429)
      if (i++ > 0) await sleep(400);
      const langs = srv.subTypes?.length ? srv.subTypes : ['sub'];
      const lang = langs.includes(audio) ? audio : langs[0];
      try {
        const r = await get<SourcesResponse>(
          `/${encodeURIComponent(slug)}/episodes/${episode}/sources?provider=${encodeURIComponent(srv.id)}&lang=${lang}&server=${encodeURIComponent(srv.id)}`,
        );
        for (const s of r.sources ?? []) {
          if (!s.url) continue;
          streams.push({
            type: s.isM3U8 ? 'hls' : 'mp4',
            url: s.isM3U8 ? `${CDN}/m3u8/${s.url}` : `${CDN}/stream/${s.url}`,
            server: `anikage:${srv.id}`,
            audio: lang as AudioType,
            quality: s.quality ?? s.label,
            referer: ORIGIN,
            viaProxy: true,
          });
        }
        if (subtitles.length === 0) {
          for (const sub of r.subtitles ?? []) {
            if (!sub.file) continue;
            const fmt = sub.file.split('.').pop()?.toLowerCase() ?? '';
            if (fmt !== 'vtt' && fmt !== 'srt') continue;
            subtitles.push({ url: sub.file, lang: sub.label ?? 'sub' });
          }
        }
      } catch {
        // next server
      }
    }

    return { streams, subtitles };
  },
};