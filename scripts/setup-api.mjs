#!/usr/bin/env node
/** One-time setup: clone the Kuhi API and install its Python dependencies. */
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api', 'anime-api');

if (existsSync(apiDir)) {
  console.log('[setup:api] Kuhi API already present at api/anime-api — pulling latest...');
  execSync('git pull', { cwd: apiDir, stdio: 'inherit' });
} else {
  console.log('[setup:api] Cloning kuhi-anime-api...');
  mkdirSync(path.dirname(apiDir), { recursive: true });
  execSync('git clone https://github.com/F0xyN0xy/anime-api "' + apiDir + '"', {
    stdio: 'inherit',
  });
}

const python = process.env.KITAWATCH_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

console.log(`[setup:api] Installing Python dependencies (${python} -m pip)...`);
execSync(`${python} -m pip install -r requirements.txt`, { cwd: apiDir, stdio: 'inherit' });

console.log('[setup:api] Done. Start the API with: npm run api');
console.log('[setup:api] (The Tauri app also auto-starts it when the port is free.)');
