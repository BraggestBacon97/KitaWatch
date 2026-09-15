# KitaWatch

A cross-platform desktop anime streaming client for Windows and Linux.
**KitaWatch does not host any content** — it is a client for third-party
sources (miruro.tv via the Kuhi Anime API). All content is provided by
external services.

Built with Tauri v2 (Rust) + React 18 + TypeScript + Vite + Tailwind CSS v4

- Zustand + Framer Motion.

---

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js 18+ |  |
| Rust toolchain | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \\| sh` |
| Linux system deps | See [Tauri docs](https://v2.tauri.app/start/prerequisites/) (webkit2gtk etc.) |

## Getting started

```bash
# 1. Install JS dependencies
npm install

# 2. Setup Environment Variables
copy .env.example .env
# Open .env and fill in the required values (especially your AniList client credentials)

# 3. Run the Kuhi API locally (or point Settings → Connection at a deployed instance)
git clone https://github.com/aryaniiil/anime-api
cd anime-api
# follow its README (uvicorn, default http://localhost:8000)

# 4. Run the desktop app (frontend hot-reloads inside the native window)
npm run tauri dev
```

**IMPORTANT**: Never commit the `.env` file to version control.

For frontend-only development (no native window): `npm run dev`, then open
http://localhost:1420.

---

## Project structure

```javascript
src/
├── components/
│   ├── layout/       Sidebar, Header, PageContainer
│   ├── anime/        AnimeCard, AnimeRow            (Phase 1 preview of Phase 2 work)
│   └── ui/           Button, Badge, Skeleton, ErrorState, Disclaimer
├── pages/
│   ├── Home.tsx        Spotlight hero + trending/popular rows
│   ├── Browse.tsx      Trending / Popular / search results with pagination
│   ├── Detail.tsx      Banner, metadata, episode grid, Add to List
│   ├── Watch.tsx       Player placeholder (Phase 4)
│   ├── MyList.tsx      Favorites
│   └── Settings.tsx    API URL, playback prefs, data management
├── services/
│   ├── api.ts        Kuhi API client (typed, timeout, ApiError, configurable base URL)
│   └── storage.ts    typed localStorage wrapper
├── stores/
│   ├── settingsStore.ts   persisted settings (zustand/persist)
│   └── animeStore.ts      favorites (localStorage now, SQLite in Phase 3)
├── hooks/
│   ├── useApi.ts         data fetching with loading/error/retry
│   └── useDebounce.ts    search input debounce
├── types/index.ts    API response interfaces
└── styles/globals.css    Tailwind v4 theme tokens (deep charcoal #0a0a0f + violet accent)

src-tauri/            Tauri v2 Rust shell (window config, capabilities)
```

## Phase status

- [x] **Phase 1 — Foundation.** Scaffold, routing (React Router), Zustand stores,
dark layout shell (sidebar/header/pages), base theme, typed API client stub.
- [ ] **Phase 2 — API layer polish.** Anime grid, virtualized lists, memoized cards.
- [ ] **Phase 3 — Detail & episodes.** SQLite watch history via `tauri-plugin-sql`.
- [ ] **Phase 4 — Player.** HLS.js + ArtPlayer, proxied m3u8/segments, custom controls.
- [ ] **Phase 5 — Health & fallback.** Pre-flight m3u8 checks, runtime fallback,
server selector sheet, optional Kuhi API sidecar.
- [ ] **Phase 6 — Polish.** Hero carousel auto-rotate, keyboard shortcuts, PiP,
bundle optimization.

## Notes

- The **API base URL is configurable** (Settings → Connection) because the Kuhi
API is experimental. Default: `http://localhost:8000`.
- The sidebar collapses away below `md` — mobile/narrow layouts land in Phase 6.
- App icon: drop a 1024px PNG at `src-tauri/icons/icon.png`, then
`npm run tauri icon`.