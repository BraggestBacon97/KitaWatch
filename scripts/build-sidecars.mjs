#!/usr/bin/env node
/**
 * Build standalone sidecar binaries (Option B).
 *
 *   npm run build:sidecars     (then `npm run tauri build`)
 *
 * Produces, in src-tauri/binaries/ (triple-suffixed for Tauri externalBin):
 *   kitawatch-kuhi-api-<triple>[.exe]   (PyInstaller onefile)
 *   kitawatch-proxy-<triple>[.exe]      (PyInstaller onefile)
 *   kitawatch-anivexa-<triple>[.exe]    (@yao-pkg/pkg)
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const triple = process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : 'x86_64-unknown-linux-gnu';
const ext = process.platform === 'win32' ? '.exe' : '';
const outDir = path.join(root, 'src-tauri', 'binaries');
mkdirSync(outDir, { recursive: true });
const py = process.env.KITAWATCH_PYTHON || 'python';

const entries = [
  { dir: path.join(root, 'api', 'anime-api'), module: 'api:app', port: 8000, name: 'kitawatch-kuhi-api' },
  { dir: path.join(root, 'proxy'), module: 'server:app', port: 8001, name: 'kitawatch-proxy' },
];

for (const e of entries) {
  if (!existsSync(e.dir)) {
    console.log(`[sidecars] skipping ${e.name} — ${path.relative(root, e.dir)} not found`);
    continue;
  }
  const entryFile = path.join(e.dir, '_kitawatch_entry.py');
  const [mod, attr] = e.module.split(':');
  // Static import + app OBJECT (not "module:attr" string) — the string form
  // makes uvicorn import from CWD, which breaks outside the source dir.
  writeFileSync(
    entryFile,
    `import os\nimport sys\nimport multiprocessing\n\nif __name__ == "__main__":\n    multiprocessing.freeze_support()\n    # windowed (--noconsole) apps have no stdout on Windows; uvicorn's log\n    # formatter calls sys.stdout.isatty() and crashes without one\n    if sys.stdout is None:\n        sys.stdout = open(os.devnull, "w")\n        sys.stderr = open(os.devnull, "w")\n    import uvicorn\n    import ${mod}\n    uvicorn.run(${mod}.${attr}, host="127.0.0.1", port=int(os.environ.get("PORT", "${e.port}")), log_level="warning")\n`,
  );
  console.log(`[sidecars] pyinstaller: ${e.name} ...`);
  execSync(
    `"${py}" -m PyInstaller --onefile --noconsole --noconfirm --clean --name ${e.name} ` +
      `--collect-submodules api --collect-all uvicorn --collect-all fastapi --collect-all httpx --hidden-import multipart "${entryFile}"`,
    { cwd: e.dir, stdio: 'inherit' },
  );
  const target = path.join(outDir, `${e.name}-${triple}${ext}`);
  copyFileSync(path.join(e.dir, 'dist', `${e.name}${ext}`), target);
  console.log(`[sidecars] -> ${path.relative(root, target)}`);
}

const anivexa = path.join(root, 'api', 'anivexa');
if (existsSync(anivexa)) {
  const target = path.join(outDir, `kitawatch-anivexa-${triple}${ext}`);
  console.log('[sidecars] pkg: anivexa (node20, no-bytecode) ...');
  try {
    execSync(
      `npx -y @yao-pkg/pkg server.js --no-bytecode --targets node20-${process.platform === 'win32' ? 'win' : 'linux'}-x64 --output "${target}"`,
      { cwd: anivexa, stdio: 'inherit', shell: true },
    );
  } catch {
    console.log('[sidecars] node20 cache miss — trying node22 ...');
    execSync(
      `npx -y @yao-pkg/pkg server.js --no-bytecode --targets node22-${process.platform === 'win32' ? 'win' : 'linux'}-x64 --output "${target}"`,
      { cwd: anivexa, stdio: 'inherit', shell: true },
    );
  }
} else {
  console.log('[sidecars] skipping anivexa — api/anivexa not found');
}
console.log('[sidecars] done. Next: npm run tauri build');
