import { useCallback, useState } from 'react';
import { storage } from '@/services/storage';

const KEY = 'kitawatch-recent-searches';
const MAX = 8;

export function useRecentSearches() {
  const [recents, setRecents] = useState<string[]>(() => storage.get<string[]>(KEY, []));

  const add = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setRecents((prev) => {
      const next = [q, ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
      storage.set(KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    storage.remove(KEY);
    setRecents([]);
  }, []);

  return { recents, add, clear };
}
