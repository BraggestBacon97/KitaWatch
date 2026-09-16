import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';

type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing' }
  | { kind: 'installed' };

/** Checks GitHub Releases for a newer version on launch (silent if none). */
export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    check()
      .then((update) => {
        if (!cancelled && update?.available) {
          setState({ kind: 'available', update });
        }
      })
      .catch(() => {
        // updater not configured (no pubkey yet), offline, etc. — stay silent
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    if (state.kind !== 'available') return;
    setState({ kind: 'installing' });
    try {
      await state.update.downloadAndInstall();
      setState({ kind: 'installed' });
    } catch {
      setState({ kind: 'available', update: state.update });
    }
  };

  const dismiss = () => setState({ kind: 'idle' });

  return { state, install, dismiss };
}
