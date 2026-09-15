import { useState } from 'react';
import { Activity, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { checkProviders, type ProviderStatus } from '@/services/providerCheck';

interface Props {
  animeId: number | string;
  title: string;
  episode?: number;
}

/** Probe every backend for this anime — shows which sources actually carry it. */
export default function ProviderCheck({ animeId, title, episode = 1 }: Props) {
  const [results, setResults] = useState<ProviderStatus[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResults(null);
    setResults(await checkProviders(animeId, title, episode));
    setRunning(false);
  };

  return (
    <div className="space-y-3 rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Provider availability</h2>
        <Button variant="outline" size="sm" onClick={run} disabled={running}>
          <Activity className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Checking…' : 'Check all'}
        </Button>
      </div>
      {!results && !running && (
        <p className="text-xs text-zinc-600">
          Probe every backend for this anime — see who actually carries it.
        </p>
      )}
      {results && (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-xs">
              {r.status === 'ok' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : r.status === 'empty' ? (
                <MinusCircle className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              )}
              <span className="w-44 shrink-0 text-zinc-300">{r.name}</span>
              <span className="truncate text-zinc-500">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
