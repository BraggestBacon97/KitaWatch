# KitaWatch

[![Release](https://img.shields.io/github/v/release/F0xyN0xy/KitaWatch?style=flat-square)](https://github.com/F0xyN0xy/KitaWatch/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/F0xyN0xy/KitaWatch/release.yml?style=flat-square)](https://github.com/F0xyN0xy/KitaWatch/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0-blue?style=flat-square)](./LICENSE.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-8b5cf6?style=flat-square)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-ffc131?style=flat-square&logo=tauri)](https://v2.tauri.app)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)

A cross-platform desktop anime streaming client for Windows and Linux.
**KitaWatch does not host any content** — it is a client for third-party
sources. All content is provided by external services.

- Metadata: [AniList](https://anilist.co) GraphQL (legal, reliable)
- Streams: resolver chain over multiple independent provider backends,
  with automatic fallback
- Optional AniList login to sync your list (you always log in with
  *your own* account)

## Install

Download the latest installer from
[**Releases**](https://github.com/F0xyN0xy/KitaWatch/releases/latest):

- **Windows**: `KitaWatch_*_x64-setup.exe`
- **Linux**: `.deb`, `.rpm`, or `.AppImage`

Everything is bundled — no Python, Node, or configuration needed. The app
spawns its own local backends on first launch (give it ~15 seconds).

**Updates are automatic**: the app checks GitHub Releases on launch and
offers one-click updates (signed and verified).

## Features

- Spotlight hero, trending / popular / recently-aired rows
- Instant search with live autocomplete (AniList-direct)
- Episode grid from official AniList data — always complete
- HLS player (HLS.js + ArtPlayer): server selector, fatal-error
  auto-failover, autoplay-next, subtitles (VTT/SRT), PiP, screenshots
- Resolver chain: Kuhi → Anivexa → AniKage → Consumet → animepahe →
  optional torrent fallback (Nyaa magnets via WebTorrent)
- "Provider availability" probe — see which backends carry any anime
- Continue Watching, My List, watch history
- AniList OAuth: favorites sync both ways, optional
- Virtualized browse grid, genre filtering, dark cinematic UI

## Building from source

Prerequisites: Node 18+, Rust toolchain, Python **3.12+**.

```bash
npm install
npm run setup:api        # clones the Kuhi API sidecar + pip deps
npm run setup:anivexa    # clones the Anivexa sidecar + npm deps
npm run tauri dev        # development
```

Release builds bundle the sidecars as standalone binaries:

```bash
npm run build:sidecars   # PyInstaller (python) + pkg (node) -> src-tauri/binaries
npm run tauri build      # installers in src-tauri/target/release/bundle/
```

Tagging a version (`npm run release:tag -- X.Y.Z`) pushes a signed release
built for both platforms by GitHub Actions, with the auto-update manifest.

## Architecture

```
React 18 + TypeScript + Vite + Tailwind v4   (UI)
        │
        ├─► Kuhi API        (Python, port 8000) — search, metadata, extraction
        ├─► KitaWatch proxy (Python, port 8001) — CORS relay, referer spoofing,
        │                                            m3u8 rewrite, OAuth exchange
        └─► Anivexa API     (Node, port 4000)  — 15-provider aggregator
```

All three run locally on the user's machine; there is no central server.
The desktop shell is Tauri v2 (Rust); updates are signed with minisign.

## Legal

KitaWatch is a client application. It does not host, store, or distribute
video content. Metadata comes from the public AniList API; playback sources
are resolved from independent third-party providers at runtime. You are
responsible for complying with the laws of your jurisdiction.
See [Terms](src/pages/Legal.tsx) in-app for the full disclaimer.

## License

[PolyForm Noncommercial 1.0](./LICENSE.md) — free to use, modify, and
contribute; commercial use is not permitted.

## Acknowledgements

- [Kuhi API](https://github.com/aryaniiil/kuhi-anime-api) — extraction backend
- [Anivexa-API](https://github.com/walterwhite-69/Anivexa-API) — provider aggregator
- [AniList](https://anilist.co) — metadata & OAuth
- [AniKage](https://anikage.cc) — provider API
- [Consumet](https://github.com/consumet/consumet-api) — optional fallback
