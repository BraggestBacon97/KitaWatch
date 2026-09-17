import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

interface SkipInterval {
  start: number;
  end: number;
}

const cache = new Map<string, SkipInterval | null>();

async function fetchSkipTimes(anilistId: number | string, episode: number): Promise<SkipInterval | null> {
  const path = `/api/v2/skip-times/${anilistId}/${episode}?types[]=op&types[]=ed`;
  const targets = [
    `https://api.aniskip.com${path}`,
    `${useSettingsStore.getState().proxyBaseUrl}/cors?u=${encodeURIComponent(`https://api.aniskip.com${path}`)}`,
  ];
  for (const url of targets) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        found?: boolean;
        results?: { skip_type?: string; interval?: { start_time?: number; end_time?: number } }[];
      };
      const hit = data.results?.find((r) => r.interval && (r.skip_type === 'op' || r.skip_type === 'mixed-op'));
      if (hit?.interval?.start_time != null && hit.interval.end_time != null) {
        return { start: hit.interval.start_time, end: hit.interval.end_time };
      }
      if (data.found === false) return null; // definitively no skip times
    } catch {
      // try next route
    }
  }
  return null;
}

/** AniSkip.tv intro/outro timestamps for an episode (null while loading/none). */
export function useIntroSkip(anilistId: number | string, episode: number) {
  const [skip, setSkip] = useState<SkipInterval | null>(null);

  useEffect(() => {
    if (!anilistId || !episode) return;
    const key = `${anilistId}|${episode}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      setSkip(cached);
      return;
    }
    let cancelled = false;
    setSkip(null);
    fetchSkipTimes(anilistId, episode).then((result) => {
      cache.set(key, result);
      if (!cancelled) setSkip(result);
    });
    return () => {
      cancelled = true;
    };
  }, [anilistId, episode]);

  return skip;
}
