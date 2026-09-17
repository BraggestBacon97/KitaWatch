# Kuhi API (sidecar)

KitaWatch embeds no content — it talks to a local **Kuhi API v3** instance
(FastAPI, https://github.com/aryaniiil/kuhi-anime-api) that searches AniList
and extracts streams from native providers.

## How it runs

1. **One-time setup** — from the project root:
   ```bash
   npm run setup:api   # clones into api/anime-api + pip install -r requirements.txt
   ```
   Requires Python 3.8+ on PATH. Non-Windows Python can be forced with the
   `KITAWATCH_PYTHON` env var.

2. **Automatic (default)** — the Tauri app probes `127.0.0.1:8000` on startup.
   If nothing answers **and** `api/anime-api` exists, it spawns
   `python -m uvicorn api:app --port 8000` itself and kills the process when
   the app exits. Override the repo location with `KITAWATCH_API_DIR`.

3. **Manual** — `npm run api` runs the server in your terminal.

4. **Deployed instance** — point Settings → Connection at any reachable URL;
   if the port probe succeeds the sidecar stays off.

## v3 vs the original spec

The API drifted since the spec was written. Phase 2 targets v3:

- List endpoints return `{ page, perPage, total, hasNextPage, results }`
- `/anime/episodes/{id}` returns per-provider sub/dub lists — the client
  flattens and merges them (see `adaptEpisodes` in `src/services/api.ts`)
- Providers are native Python scrapers: anineko, anizone, anikoto, reanime,
  aniwaves, kaa, anibd, animegg, mkissa, animeonsen (fastest-wins race;
  live ranking at `/anime/providers/status`)
- New endpoints wired: `/anime/filter`, `/anime/genres`, `/anime/recent`,
  `/anime/upcoming`, `/anime/anime/{id}/recommendations`
- Extraction supports `?type=sub|dub` and provider forcing
