# Hosting KitaWatch as a website

One codebase, two targets. The desktop app spawns sidecars locally; the
website build points at sidecars hosted on a server. This guide assumes
your domain is `kitawatch.nx.kg`.

## 1. Build the frontend

```powershell
# .env.production — baked into the build, never committed values you fear leaking
VITE_API_BASE_URL=https://api.kitawatch.nx.kg
VITE_PROXY_BASE_URL=https://proxy.kitawatch.nx.kg
VITE_ANIVEXA_BASE_URL=https://api.kitawatch.nx.kg/anivexa
VITE_CONSUMET_BASE_URL=https://api.kitawatch.nx.kg/consumet

npm run build      # outputs dist/
```

## 2. Host dist/ — free

- **Cloudflare Pages** (recommended): connect the GitHub repo, framework = Vite,
  output dir = `dist`. Add `kitawatch.nx.kg` as a custom domain (it gives you
  DNS instructions: two Cloudflare nameservers, or a CNAME if you keep DNS elsewhere).
- GitHub Pages / Netlify / Vercel work identically.

## 3. Host the sidecars — free-ish

The sidecars are plain Python (Kuhi, proxy) + Node (Anivexa, Consumet if used).

- **Oracle Cloud free tier** (4 ARM cores / 24 GB — the best $0 option):
  one VM runs everything behind Caddy or nginx with TLS.
- **Railway / Render** free tiers work but *sleep* on inactivity (first request
  ~30 s). Set a cron ping if you accept that.

Example Caddyfile on the VM:

```
api.kitawatch.nx.kg {
    reverse_proxy 127.0.0.1:8000     # Kuhi
}
proxy.kitawatch.nx.kg {
    reverse_proxy 127.0.0.1:8001     # proxy (allowlist already enforced)
}
api2.kitawatch.nx.kg {
    reverse_proxy 127.0.0.1:4000     # Anivexa
}
```

Run the sidecars with systemd units (or `npm run api`-style scripts under pm2).

## 4. Secrets on the server (NOT in the frontend)

```bash
# /etc/kitawatch.env — root-only
ANILIST_CLIENT_ID=51128
ANILIST_CLIENT_SECRET=
ANILIST_REDIRECT_URI=https://kitawatch.nx.kg/auth
PROXY_ALLOWLIST=anikage.cc,kwik.si,animepahe.ru,anilist.co,og.bakayaro.live
```

The proxy serves the web build's OAuth exchange at `POST /auth/token` using
these vars; the desktop app uses the Rust command instead.

## 5. AniList client for the web

Register `https://kitawatch.nx.kg/auth` as the client's Redirect URL. The
frontend exchanges the code against `{VITE_PROXY_BASE_URL}/auth/token`.

## 6. Checklist

- [ ] `dist/` deployed, site loads at kitawatch.nx.kg
- [ ] sidecars reachable at the VITE_* URLs (try `/anime/spotlight`)
- [ ] proxy denies a random host: `curl "https://proxy.../cors?u=https://evil.com"` → 403
- [ ] OAuth round-trip works in a browser
- [ ] an episode plays (watch the Sources strip)
