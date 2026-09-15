#!/usr/bin/env node
/**
 * Build standalone sidecar binaries (Option B).
 *
 *   npm run setup:api && npm run setup:anivexa     (one time)
 *   npm run build:sidecars                          (before `tauri build`)
 *
 * Produces, in src-tauri/binaries/ (triple-suffixed for Tauri externalBin):
 *   kuhi-api-<triple>.exe     (PyInstaller onefile)
 *   proxy-<triple>.exe        (PyInstaller onefile)
 *   anivexa-<triple>.exe      (@yao-pkg/pkg)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const triple =
  process.platform === 'win32'
    ? 'x86_64-pc-windows-msvc'
    : process.platform === 'linux'
      ? 'x86_64-unknown-linux-gnu'
      : 'x86_64-apple-darwin';
const ext = process.platform === 'win32' ? '.exe' : '';
const outDir = path.join(root, 'src-tauri', 'binaries');
mkdirSync(outDir, { recursive: true });

const py = process.env.KITAWATCH_PYTHON || 'python';

// -- PyInstaller entry points (generated next to each app) -------------------
const entries = [
  { dir: path.join(root, 'api', 'anime-api'), module: 'api:app', port: 8000, name: 'kuhi-api' },
  { dir: path.join(root, 'proxy'), module: 'server:app', port: 8001, name: 'proxy' },
];

for (const e of entries) {
  if (!existsSync(e.dir)) {
    console.log(`[sidecars] skipping ${e.name} — ${path.relative(root, e.dir)} not found`);
    continue;
  }
  const entryFile = path.join(e.dir, '_kitawatch_entry.py');
  writeFileSync(
    entryFile,
    `import os\nimport multiprocessing\n\nif __name__ == "__main__":\n    multiprocessing.freeze_support()\n    import uvicorn\n    uvicorn.run("${e.module}", host="127.0.0.1", port=int(os.environ.get("PORT", "${e.port}")), log_level="warning")\n`,
  );
  console.log(`[sidecars] pyinstaller: ${e.name} …`);
  execSync(
    `"${py}" -m PyInstaller --onefile --noconfirm --clean --name ${e.name} ` +
      `--collect-submodules api --collect-all uvicorn --collect-all fastapi --collect-all httpx ` +
      `"${entryFile}"`,
    { cwd: e.dir, stdio: 'inherit' },
  );
  const built = path.join(e.dir, 'dist', `${e.name}${ext}`);
  const target = path.join(outDir, `${e.name}-${triple}${ext}`);
  execSync(`copy /Y "${built}" "${target}"`.replaceAll('/', '\\'), { stdio: 'inherit', shell: 'cmd.exe' });
  console.log(`[sidecars] ${path.relative(root, target)}`);
}

// -- Anivexa via @yao-pkg/pkg ------------------------------------------------
const anivexa = path.join(root, 'api', 'anivexa');
if (existsSync(anivexa)) {
  console.log('[sidecars] pkg: anivexa …');
  const target = path.join(outDir, `anivexa-${triple}${ext}`);
  execSync(
    `npx -y @yao-pkg/pkg . --targets node18-${process.platform === 'win32' ? 'win' : 'linux'}-x64 --output "${target}"`,
    { cwd: anivexa, stdio: 'inherit', shell: true },
  );
} else {
  console.log('[sidecars] skipping anivexa — api/anivexa not found');
}

console.log('[sidecars] done. Now run: npm run tauri build');
