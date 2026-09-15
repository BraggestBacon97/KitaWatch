import { useSettingsStore } from '@/stores/settingsStore';

export interface ConsumetSearchResult {
  id: string;
  title?: string;
  name?: string;
  image?: string;
  img?: string;
  releaseDate?: string;
  releasedYear?: string;
}

export interface ConsumetEpisode {
  id: string;
  number: number;
  title?: string;
  image?: string;
  img?: string;
}

export interface ConsumetInfo {
  id: string;
  title?: string;
  name?: string;
  episodes?: ConsumetEpisode[];
}

export interface ConsumetSource {
  url: string;
  isM3U8?: boolean;
  quality?: string;
}

function base(): string {
  return useSettingsStore.getState().consumetBaseUrl.replace(/\/$/, '');
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`);
  if (!res.ok) throw new Error(`Consumet responded ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Try route shapes in order — the API was restructured in v1 and
 *  self-hosted instances vary in which layout they serve. */
async function tryGet<T>(paths: string[]): Promise<T> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await get<T>(path);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('No route candidates responded');
}

interface SearchEnvelope {
  results?: ConsumetSearchResult[];
  animes?: ConsumetSearchResult[];
}

/** Self-hosted Consumet API (docker run -p 3000:3000 riimuru/consumet-api). */
export const consumet = {
  search: async (query: string): Promise<ConsumetSearchResult[]> => {
    const q = encodeURIComponent(query);
    const env = await tryGet<SearchEnvelope>([
      `/anime/gogoanime/search/${q}`,
      `/anime/gogoanime/${q}`,
    ]);
    return env.results ?? env.animes ?? [];
  },

  info: async (id: string): Promise<ConsumetInfo & { episodes: ConsumetEpisode[] }> => {
    const raw = await tryGet<ConsumetInfo>([
      `/anime/gogoanime/info/${encodeURIComponent(id)}`,
      `/anime/gogoanime/anime/${encodeURIComponent(id)}`,
    ]);
    return { ...raw, episodes: raw.episodes ?? [] };
  },

  watch: (episodeId: string) =>
    tryGet<{ headers?: Record<string, string>; sources?: ConsumetSource[] }>([
      `/anime/gogoanime/watch/${encodeURIComponent(episodeId)}`,
    ]),
};
