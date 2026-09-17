import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'auto' | '1080p' | '720p' | '480p';

/** Native Kuhi providers (fastest-wins race; manual override order). */
export const PROVIDER_PRIORITY = [
  'anineko',
  'anizone',
  'anikoto',
  'reanime',
  'aniwaves',
  'kaa',
  'anibd',
  'animegg',
  'mkissa',
  'animeonsen',
] as const;

interface SettingsState {
  defaultQuality: Quality;
  autoplayNext: boolean;
  providerPriority: string[];
  consumetBaseUrl: string;
  enableConsumetFallback: boolean;
  /** Local proxy sidecar (CORS + referer + m3u8 rewrite). */
  proxyBaseUrl: string;
  /** Self-hosted Anivexa-API (Node, by-AniList-ID provider aggregator). */
  anivexaBaseUrl: string;
  enableAnivexa: boolean;
  setDefaultQuality: (q: Quality) => void;
  setAutoplayNext: (v: boolean) => void;
  setProviderPriority: (order: string[]) => void;
  setConsumetBaseUrl: (url: string) => void;
  setEnableConsumetFallback: (v: boolean) => void;
  setProxyBaseUrl: (url: string) => void;
  setAnivexaBaseUrl: (url: string) => void;
  setEnableAnivexa: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Hosted builds override via VITE_* env at build time.
      defaultQuality: 'auto',
      autoplayNext: true,
      providerPriority: [...PROVIDER_PRIORITY],
      consumetBaseUrl: import.meta.env.VITE_CONSUMET_BASE_URL ?? 'http://localhost:3000',
      enableConsumetFallback: true,
      proxyBaseUrl: import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:8001',
      anivexaBaseUrl: import.meta.env.VITE_ANIVEXA_BASE_URL ?? 'http://localhost:4000',
      enableAnivexa: true,
      setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setProviderPriority: (providerPriority) => set({ providerPriority }),
      setConsumetBaseUrl: (consumetBaseUrl) => set({ consumetBaseUrl }),
      setEnableConsumetFallback: (enableConsumetFallback) =>
        set({ enableConsumetFallback }),
      setProxyBaseUrl: (proxyBaseUrl) => set({ proxyBaseUrl }),
      setAnivexaBaseUrl: (anivexaBaseUrl) => set({ anivexaBaseUrl }),
      setEnableAnivexa: (enableAnivexa) => set({ enableAnivexa }),
    }),
    { name: 'kitawatch-settings' },
  ),
);
