import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AnimeSummary } from '@/types';

interface AnimeState {
  favorites: AnimeSummary[];
  toggleFavorite: (anime: AnimeSummary) => void;
  removeFavorite: (id: number) => void;
  isFavorite: (id: number) => boolean;
  /** Merge remote (AniList) favorites without duplicating local ones. */
  mergeFavorites: (list: AnimeSummary[]) => void;
}

export const useAnimeStore = create<AnimeState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggleFavorite: (anime) =>
        set((s) =>
          s.favorites.some((f) => f.id === anime.id)
            ? { favorites: s.favorites.filter((f) => f.id !== anime.id) }
            : { favorites: [anime, ...s.favorites] },
        ),
      removeFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),
      isFavorite: (id) => get().favorites.some((f) => f.id === id),
      mergeFavorites: (list) =>
        set((s) => {
          const existing = new Set(s.favorites.map((f) => f.id));
          return { favorites: [...s.favorites, ...list.filter((a) => !existing.has(a.id))] };
        }),
    }),
    { name: 'kitawatch-favorites' },
  ),
);
