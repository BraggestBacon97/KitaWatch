import { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { redeemCode } from '@/services/gate';

/** Full-screen lock: site is invite-only until a Discord-approved code is entered. */
export default function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await redeemCode(code.trim());
      onUnlock();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-ink-950 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-600 shadow-lg shadow-accent-600/30">
        <ShieldCheck className="h-7 w-7 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">
          Kita<span className="text-accent-400">Watch</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Private access — invite only</p>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-zinc-600">
        This instance is personal. Ask the owner on Discord for a one-time
        code, then enter it here. Codes expire after 15 minutes and work once.
      </p>
      <div className="flex w-full max-w-xs gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="XXXX-XXXX-XXXX"
          spellCheck={false}
          className="w-full rounded-lg bg-ink-800 px-3 py-2 text-center font-mono text-sm tracking-widest text-zinc-200 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-accent-500/60"
        />
        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Enter
        </button>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
