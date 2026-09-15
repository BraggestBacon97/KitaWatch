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
  /** Public OAuth client ID — used only for the authorize URL.
   *  The token exchange happens in Rust and reads the secret from .env. */
  clientId: string;
  /** Must EXACTLY match the AniList client's registered redirect URL,
   *  and must equal ANILIST_REDIRECT_URI in .env (both sides of the flow). */
  anilistRedirect: string;
  accessToken: string | null;
  viewer: Viewer | null;
  setClientId: (id: string) => void;
  setAnilistRedirect: (url: string) => void;
  setSession: (token: string, viewer: Viewer) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clientId: '',
      anilistRedirect: DEFAULT_REDIRECT,
      accessToken: null,
      viewer: null,
      setClientId: (clientId) => set({ clientId }),
      setAnilistRedirect: (anilistRedirect) => set({ anilistRedirect }),
      setSession: (accessToken, viewer) => set({ accessToken, viewer }),
      clear: () => set({ accessToken: null, viewer: null }),
    }),
    { name: 'kitawatch-auth' },
  ),
);
