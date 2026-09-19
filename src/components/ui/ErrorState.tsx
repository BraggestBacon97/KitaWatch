import { WifiOff, RotateCcw } from 'lucide-react';
import Button from './Button';

interface Props {
  title?: string;
  message?: string;
  /** Optional per-step failure reasons (e.g. one per provider). */
  details?: string[];
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Something went wrong',
  message,
  details,
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-ink-900 p-10 text-center ring-1 ring-white/5">
      <WifiOff className="h-10 w-10 text-zinc-600" />
      <p className="font-semibold text-zinc-200">{title}</p>
      {message && <p className="max-w-sm text-sm text-zinc-500">{message}</p>}
      {details && details.length > 0 && (
        <div className="max-h-40 w-full max-w-md overflow-y-auto rounded-lg bg-ink-800/80 p-3 text-left ring-1 ring-white/5">
          {details.map((d, i) => (
            <p key={i} className="font-mono text-[11px] leading-relaxed text-zinc-500">
              {d}
            </p>
          ))}
        </div>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}