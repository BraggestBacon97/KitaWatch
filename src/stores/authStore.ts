import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Viewer {
  id: number;
  name: string;
  avatar?: string;
}

export const DEFAULT_REDIRECT = 'kitawatch://auth';
/** Pin flow: register this on anilist.co, paste the shown token in Settings. */
export const PIN_REDIRECT = 'https://anilist.co/api/v2/oauth/pin';

interface AuthState {
  /** AniList OAuth client ID (from anilist.co/settings/developer). */
  clientId: string;
  /** Only if you set a secret on the AniList client; most users leave it blank. */
  clientSecret: string;
  /** Must EXACTLY match the redirect URL registered on the AniList client. */
  anilistRedirect: string;
  accessToken: string | null;
  viewer: Viewer | null;
  setClientId: (id: string) => void;
  setClientSecret: (secret: string) => void;
  setAnilistRedirect: (url: string) => void;
  setSession: (token: string, viewer: Viewer) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clientId: '',
      clientSecret: '',
      anilistRedirect: DEFAULT_REDIRECT,
      accessToken: null,
      viewer: null,
      setClientId: (clientId) => set({ clientId }),
      setClientSecret: (clientSecret) => set({ clientSecret }),
      setAnilistRedirect: (anilistRedirect) => set({ anilistRedirect }),
      setSession: (accessToken, viewer) => set({ accessToken, viewer }),
      clear: () => set({ accessToken: null, viewer: null }),
    }),
    { name: 'kitawatch-auth' },
  ),
);
