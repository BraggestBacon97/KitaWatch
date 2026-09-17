import { useState, useEffect } from 'react';

export function useIntroSkip(malId: number | string, episode: number) {
  const [skipTime, setSkipTime] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!malId || !episode) return;

    fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=mixed-op`)
      .then((res) => res.json())
      .then((data) => {
        if (data.found && data.results.length > 0) {
          const intro = data.results[0]; // Assuming first result is the intro
          setSkipTime({ start: intro.interval.startTime, end: intro.interval.endTime });
        }
      })
      .catch(() => {});
  }, [malId, episode]);

  return skipTime;
}
