import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ENTRIES = 50;

export interface HistoryEntry {
  animeId: number;
  episode: number;
  title: string;
  cover?: string;
  /** Last playback position / total duration in seconds (resume support). */
  position?: number;
  duration?: number;
  updatedAt: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  upsert: (e: Omit<HistoryEntry, 'position' | 'duration' | 'updatedAt'>) => void;
  updatePosition: (animeId: number, episode: number, position: number, duration: number) => void;
  remove: (animeId: number) => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      upsert: (e) =>
        set((s) => {
          const prev = s.entries.find((x) => x.animeId === e.animeId);
          // Resume data is per-episode — only carry it over when this upsert
          // is for the same episode the user actually watched. Episode 1's
          // progress must not leak into the entry after they jump to ep 5.
          const keep =
            prev && prev.episode === e.episode
              ? { position: prev.position, duration: prev.duration }
              : {};
          const entry: HistoryEntry = { ...e, ...keep, updatedAt: Date.now() };
          return {
            entries: [entry, ...s.entries.filter((x) => x.animeId !== e.animeId)].slice(0, MAX_ENTRIES),
          };
        }),
      updatePosition: (animeId, episode, position, duration) =>
        set((s) => ({
          entries: s.entries.map((x) =>
            x.animeId === animeId && x.episode === episode
              ? { ...x, position, duration, updatedAt: Date.now() }
              : x,
          ),
        })),
      remove: (animeId) => set((s) => ({ entries: s.entries.filter((e) => e.animeId !== animeId) })),
    }),
    { name: 'kitawatch-history' },
  ),
);