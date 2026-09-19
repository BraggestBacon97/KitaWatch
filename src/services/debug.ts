import { invoke } from '@tauri-apps/api/core';

/** One-click diagnostics: sidecar presence, port/HTTP probes, startup notes,
 *  recent sidecar logs. Paste the result into a bug report. */
export async function getDebugReport(): Promise<string> {
  return invoke<string>('collect_debug_report');
}