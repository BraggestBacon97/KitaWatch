import { useSettingsStore } from '@/stores/settingsStore';
import type { StreamSource } from '@/types';

function proxyBase(): string {
  return useSettingsStore.getState().proxyBaseUrl.replace(/\/$/, '');
}

async function ap<T>(params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${proxyBase()}/ap?${qs.toString()}`);
  if (!res.ok) throw new Error(`animepahe proxy responded ${res.status}`);
  return (await res.json()) as T;
}

export interface PaheAnime {
  id: number;
  session: string;
  title: string;
  episodes: number;
}

/** animepahe via the local proxy (handles CORS + kwik referer). */
export const animepahe = {
  search: (q: string) =>
    ap<{ data?: PaheAnime[] }>({ m: 'search', q }).then((r) => r.data ?? []),

  /** Walk episode pages until the target episode's session is found. */
  async findEpisode(animeSession: string, episode: number): Promise<string | null> {
    let page = 1;
    for (let i = 0; i < 60; i++) {
      const r = await ap<{
        data?: { episode: number; session: string }[];
        last_page?: number;
      }>({ m: 'release', id: animeSession, sort: 'episode_asc', page });
      const hit = r.data?.find((e) => e.episode === episode);
      if (hit) return hit.session;
      const last = r.last_page ?? page;
      if (page >= last) return null;
      page++;
    }
    return null;
  },

  /** Resolve kwik links to proxied HLS streams. */
  async streams(episodeSession: string): Promise<StreamSource[]> {
    const r = await ap<{
      data?: { link: string; audio?: string; quality?: string }[];
    }>({ m: 'links', id: episodeSession, p: 'kwik' });

    const streams: StreamSource[] = [];
    for (const l of r.data ?? []) {
      try {
        const res = await fetch(
          `${proxyBase()}/kwik?u=${encodeURIComponent(l.link)}`,
        );
        const j = (await res.json()) as { url?: string };
        if (j.url) {
          streams.push({
            type: 'hls',
            url: j.url,
            server: 'animepahe',
            audio: l.audio === 'dubbed' ? 'dub' : 'sub',
            quality: l.quality,
            referer: 'https://kwik.si/',
            viaProxy: true,
          });
        }
      } catch {
        // try next link
      }
    }
    return streams;
  },
};
