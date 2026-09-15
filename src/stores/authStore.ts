import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_REDIRECT = 'kitawatch://auth';

interface AuthState {
  accessToken: string | null;
  viewer: Viewer | null;
  setSession: (token: string, viewer: Viewer) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      viewer: null,
      setSession: (accessToken, viewer) => set({ accessToken, viewer }),
      clear: () => set({ accessToken: null, viewer: null }),
    }),
    { name: 'kitawatch-auth' },
  ),
);
