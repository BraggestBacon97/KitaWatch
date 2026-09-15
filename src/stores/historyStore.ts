import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HistoryEntry {
  animeId: number;
  episode: number;
  title: string;
  cover?: string;
  updatedAt: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  upsert: (e: Omit<HistoryEntry, 'updatedAt'>) => void;
  remove: (animeId: number) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      upsert: (e) =>
        set((s) => ({
          entries: [
            { ...e, updatedAt: Date.now() },
            ...s.entries.filter((x) => x.animeId !== e.animeId),
          ].slice(0, 50),
        })),
      remove: (animeId) =>
        set((s) => ({ entries: s.entries.filter((x) => x.animeId !== animeId) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'kitawatch-history' },
  ),
);
