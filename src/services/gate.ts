/** Discord-gate integration: token storage, redeem, validation. */

const TOKEN_KEY = 'kitawatch-gate-token';

export function getGateToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setGateToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearGateToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function gateUrl(): string {
  const env = import.meta.env.VITE_GATE_URL;
  if (env) return env.replace(/\/$/, '');
  return `${window.location.protocol}//gate.${window.location.hostname.split('.').slice(-2).join('.')}`;
}

/** Swap a one-time Discord code for a long-lived access token. */
export async function redeemCode(code: string): Promise<string> {
  const res = await fetch(`${gateUrl()}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const json = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !json.token) {
    throw new Error(json.error ?? `Redeem failed (${res.status})`);
  }
  setGateToken(json.token);
  return json.token;
}

/** Check the stored token against the gate. */
export async function validateGateToken(): Promise<boolean> {
  const token = getGateToken();
  if (!token) return false;
  try {
    const res = await fetch(`${gateUrl()}/validate`, {
      headers: { 'X-Access-Token': token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch wrapper that attaches the gate token (used by API clients). */
export function gateHeaders(): Record<string, string> {
  const token = getGateToken();
  return token ? { 'X-Access-Token': token } : {};
}
