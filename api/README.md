# api/ — vendored sidecar sources

These are the local backends KitaWatch bundles and spawns on the user's
machine. They are **vendored** (committed here) so every build — yours, your
friends', CI's — compiles the exact same code, including local patches.

| Folder | Upstream | Runtime | Port |
|---|---|---|---|
| `anime-api/` | [aryaniiil/kuhi-anime-api](https://github.com/aryaniiil/kuhi-anime-api) | Python 3.12 + FastAPI/uvicorn | 8000 |
| `anivexa/` | [walterwhite-69/Anivexa-API](https://github.com/walterwhite-69/Anivexa-API) | Node 18+ | 4000 |
| `../proxy/` | (this repo) | Python 3.12 + FastAPI/httpx | 8001 |

## Local patches applied

- `anime-api/src/extractor.py` — AniList queries retry 3× with backoff
  (upstream has none; transient `httpx.ReadError` crashed `/anime/info`).
- `anime-api/src/config.py` — removed dead `miruro.online` mirror
  (DNS-fails on every episode lookup).
- `anivexa/core/smartcache.js` — converted ESM→CJS (pkg cannot
  transform top-level await; required for the bundled exe).

## Refreshing from upstream

```bash
npm run setup:api       # or setup:anivexa
```

then re-apply the patches above (diff against this folder) and commit.

## Bundled binaries

`npm run build:sidecars` compiles each into a standalone, windowless
executable (`kitawatch-kuhi-api`, `kitawatch-proxy`, `kitawatch-anivexa`),
placed in `src-tauri/binaries/` and embedded into installers via Tauri
`externalBin`. Nothing here needs to be installed on end-user machines.
