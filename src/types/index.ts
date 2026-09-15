// NOTE: Kuhi API v3.0 shapes. The API is experimental — keep these
// interfaces defensive and adjust if the deployed instance drifts.

/** v3 list endpoints return a paginated envelope. */
export interface Paged<T> {
  page: number;
  perPage: number;
  total: number;
  hasNextPage: boolean;
  results: T[];
}

export interface AnimeSummary {
  id: number;
  title: string;
  cover?: string;
  banner?: string;
  rating?: number;
  type?: string;
  subCount?: number;
  dubCount?: number;
  totalEpisodes?: number;
  genres?: string[];
  season?: string;
  year?: number;
  status?: string;
  isAdult?: boolean;
}

export interface SpotlightAnime extends AnimeSummary {
  description?: string;
}

export interface AnimeInfo extends AnimeSummary {
  synopsis?: string;
  releaseDate?: string;
  studios?: string[];
}

export interface EpisodeSummary {
  number: number;
  title?: string;
  thumbnail?: string;
  hasSub?: boolean;
  hasDub?: boolean;
}

export interface StreamSource {
  type: 'hls' | 'mp4' | 'dash' | 'embed';
  url: string;
  referer?: string;
  server?: string;
  audio?: 'sub' | 'dub';
  quality?: string;
  /** Route playback through the local proxy (referer-locked hosts). */
  viaProxy?: boolean;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
}

export interface ExtractResponse {
  anilistId?: number;
  episode?: number;
  provider?: string;
  defaultProvider?: string;
  streams: StreamSource[];
  subtitles?: SubtitleTrack[];
}

/** GET /anime/providers/status */
export interface ProviderStatus {
  defaultProvider?: string;
  ranking?: string[];
  available?: string[];
  latency?: Record<string, { avg_seconds?: number; failures?: number }>;
}

export type AudioType = 'sub' | 'dub';

export type FilterSort =
  | 'TRENDING_DESC'
  | 'POPULARITY_DESC'
  | 'SCORE_DESC'
  | 'START_DATE_DESC'
  | 'FAVOURITES_DESC'
  | 'UPDATED_AT_DESC';
