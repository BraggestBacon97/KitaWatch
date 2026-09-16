# KitaWatch Gate (Discord-approval access)

Invite-only access for the web build. You approve friends via a Discord
slash command; the bot DMs them a one-time code; the site swaps it for a
long-lived token. All API subdomains reject traffic without a valid token.

## 1. Create the bot
1. discord.com/developers → New Application → **Bot** → copy the token
2. OAuth2 → URL Generator: scope `bot` + `applications.commands`,
   permission **Administrator** (or Send Messages/DM perms) → open the URL to
   invite it to YOUR server only
3. Copy: bot token, application id, your server id, your user id
   (enable Developer Mode in Discord → right-click server/yourself → Copy ID)

## 2. Configure + run (on the same box as the sidecars)
```bash
cd gate
npm install
cat > .env <<'EOF'
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
GUILD_ID=...
OWNER_ID=your_user_id
GATE_SECRET=$(openssl rand -hex 32)
GATE_PORT=8787
GATE_ORIGINS=https://kitawatch.nx.kg,https://kitawatch.free.nf
EOF
pm2 start bot.js --name gate
pm2 save
```

## 3. Caddy: enforce the gate on every API subdomain
```
gate.kitawatch.nx.kg {
    reverse_proxy 127.0.0.1:8787
}

(for_api) {
    forward_auth 127.0.0.1:8787 {
        uri /validate
        copy_headers
    }
}

api.kitawatch.nx.kg {
    import for_api
    reverse_proxy 127.0.0.1:8000
}
proxy.kitawatch.nx.kg {
    import for_api
    reverse_proxy 127.0.0.1:8001
}
ax.kitawatch.nx.kg {
    import for_api
    reverse_proxy 127.0.0.1:4000
}
```
`forward_auth` asks the gate "is this request's X-Access-Token (or kw_gate
cookie) valid?" — 200 passes through, anything else is rejected **before**
Kuhi/proxy/Anivexa ever see the request. Nothing to patch in their code.

## 4. Frontend
Add to Cloudflare Pages environment variables (rebuild):
```
VITE_GATE_URL=https://gate.kitawatch.nx.kg
```
Without this variable the gate is completely inert — the desktop app and
unconfigured builds are unaffected.

## 5. Daily use
- Friend asks in your server → you run `/approve @friend` → bot DMs them a
  code (15 min, one use)
- They open the site → lock screen → enter code → 180-day token stored on
  their device
- `/revoke @user` kills all their tokens instantly
- Rate limiting: 10 redeem attempts / 5 min / IP; codes are ~72-bit random,
  compared in constant time; tokens are HMAC-signed (forging needs GATE_SECRET)
- The bot stores NO IPs and NO emails — Discord user ID ↔ token mapping only

## 6. kitawatch.free.nf (InfinityFree)
Deploy the same `dist/` there, add the same VITE_* + VITE_GATE_URL envs.
⚠️ InfinityFree's ToS prohibits proxies/streaming backends — keep the site
static-only there (all API calls go to your nx.kg subdomains), or they may
suspend the account. The gate cookie/token is per-site (localStorage), so
visitors unlock once per domain.
