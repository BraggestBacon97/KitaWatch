#!/usr/bin/env node
/** One-time setup: clone the Kuhi API and install its Python dependencies. */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'api', 'anime-api');
const FORK_URL = 'https://github.com/F0xyN0xy/anime-api';

if (existsSync(apiDir) && existsSync(path.join(apiDir, '.git'))) {
  // Real clone: pull only on explicit request.
  if (process.env.KITAWATCH_API_UPDATE) {
    console.log('[setup:api] KITAWATCH_API_UPDATE set — pulling latest...');
    execSync('git pull', { cwd: apiDir, stdio: 'inherit' });
  } else {
    console.log('[setup:api] Kuhi API already present — skipping pull (set KITAWATCH_API_UPDATE=1 to update).');
  }
} else if (existsSync(apiDir) && existsSync(path.join(apiDir, 'requirements.txt'))) {
  // Vendored copy (checkout where the folder is tracked): use as-is.
  console.log('[setup:api] api/anime-api exists but is not a git clone — using as-is.');
} else {
  // Missing entirely, OR a stale husk left over when an untracked-folder
  // checkout deleted the tracked files but kept the dir + untracked junk.
  if (existsSync(apiDir)) {
    console.log('[setup:api] api/anime-api is incomplete (no requirements.txt) — recloning...');
    rmSync(apiDir, { recursive: true, force: true });
  }
  console.log('[setup:api] Cloning anime-api fork...');
  mkdirSync(path.dirname(apiDir), { recursive: true });
  execSync(`git clone ${FORK_URL} "${apiDir}"`, { stdio: 'inherit' });
}

const venvPython = path.join(
  apiDir,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3',
);
const python =
  process.env.KITAWATCH_PYTHON ||
  (existsSync(venvPython) ? venvPython : '') ||
  (process.platform === 'win32' ? 'python' : 'python3');

console.log(`[setup:api] Installing Python dependencies (${python} -m pip)...`);
execSync(`${python} -m pip install -r requirements.txt`, { cwd: apiDir, stdio: 'inherit' });

console.log('[setup:api] Done. Start the API with: npm run api');
console.log('[setup:api] (The Tauri app also auto-starts it when the port is free.)');