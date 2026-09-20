#!/usr/bin/env node
/** One-time setup: clone the Kuhi API and install its Python dependencies. */
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api', 'anime-api');

if (!existsSync(apiDir)) {
  console.log('[setup:api] Cloning kuhi-anime-api fork...');
  mkdirSync(path.dirname(apiDir), { recursive: true });
  execSync('git clone https://github.com/F0xyN0xy/anime-api "' + apiDir + '"', {
    stdio: 'inherit',
  });
} else if (existsSync(path.join(apiDir, '.git'))) {
  // Only a real clone (own .git) may pull. A plain vendored folder would
  // walk up to the PARENT repo and pull the wrong thing — this exact bug
  // broke CI checkouts, which are in detached HEAD and make pull fail.
  if (process.env.KITAWATCH_API_UPDATE) {
    console.log('[setup:api] KITAWATCH_API_UPDATE set — pulling latest...');
    execSync('git pull', { cwd: apiDir, stdio: 'inherit' });
  } else {
    console.log('[setup:api] Kuhi API already present — skipping pull (set KITAWATCH_API_UPDATE=1 to update).');
  }
} else {
  console.log('[setup:api] api/anime-api exists but is not a git clone — using as-is.');
}

const python = process.env.KITAWATCH_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

console.log(`[setup:api] Installing Python dependencies (${python} -m pip)...`);
execSync(`${python} -m pip install -r requirements.txt`, { cwd: apiDir, stdio: 'inherit' });

console.log('[setup:api] Done. Start the API with: npm run api');
console.log('[setup:api] (The Tauri app also auto-starts it when the port is free.)');