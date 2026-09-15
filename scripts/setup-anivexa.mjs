#!/usr/bin/env node
/** One-time setup: clone Anivexa-API and install its dependencies. */
import { existsSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'api', 'anivexa');

if (existsSync(dir)) {
  console.log('[setup:anivexa] already present at api/anivexa - pulling latest...');
  execSync('git pull', { cwd: dir, stdio: 'inherit' });
} else {
  console.log('[setup:anivexa] cloning walterwhite-69/Anivexa-API...');
  execSync('git clone https://github.com/walterwhite-69/Anivexa-API "' + dir + '"', {
    stdio: 'inherit',
  });
}

if (!existsSync(path.join(dir, '.env')) && existsSync(path.join(dir, '.env.example'))) {
  copyFileSync(path.join(dir, '.env.example'), path.join(dir, '.env'));
}

console.log('[setup:anivexa] npm install...');
execSync('npm install', { cwd: dir, stdio: 'inherit' });
console.log('[setup:anivexa] done. Default port 4000; the app auto-starts it.');
