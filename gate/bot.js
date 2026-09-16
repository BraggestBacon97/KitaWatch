/**
 * KitaWatch Gate — Discord-approval access system.
 *
 * Flow: a friend asks you (in your Discord server). You run /approve @friend.
 * The bot DMs them a ONE-TIME code (15 min validity). They enter it on the
 * site; the site swaps it for a long-lived signed token (180 days, revocable
 * via /revoke). Every API subdomain refuses traffic without a valid token
 * (Caddy forward_auth -> GET /validate).
 *
 * Env vars:
 *   DISCORD_TOKEN        bot token (discord.dev)
 *   DISCORD_CLIENT_ID    application id
 *   GUILD_ID             your server id
 *   OWNER_ID             YOUR discord user id (only you can approve)
 *   GATE_SECRET          long random string (HMAC key for tokens)
 *   GATE_PORT            default 8787
 *   GATE_ORIGINS         comma-separated site origins allowed to call /redeem
 *   GATE_DB              json db path, default ./gate-db.json
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

const {
  DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID, OWNER_ID, GATE_SECRET,
} = process.env;
const PORT = Number(process.env.GATE_PORT ?? 8787);
const ORIGINS = (process.env.GATE_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TOKEN_TTL_MS = 180 * 24 * 3600_000; // 180 days
const CODE_TTL_MS = 15 * 60_000;          // 15 minutes
const DB_PATH = process.env.GATE_DB ?? fileURLToPath(new URL('./gate-db.json', import.meta.url));

for (const v of ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GUILD_ID', 'OWNER_ID', 'GATE_SECRET']) {
  if (!process.env[v]) { console.error(`Missing env var ${v}`); process.exit(1); }
}

// ── storage (JSON is fine at friends-scale) ──────────────────
let db = { codes: [], tokens: {} };
try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { /* fresh */ }
const save = () => fs.writeFileSync(DB_PATH, JSON.stringify(db));

// ── crypto helpers ───────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(payloadObj) {
  const payload = b64u(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', GATE_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verify(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', GATE_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!obj.exp || Date.now() > obj.exp) return null;
    return obj;
  } catch { return null; }
}
function makeCode() {
  // 18 hex chars = 72 bits of entropy, grouped for readability
  const raw = crypto.randomBytes(9).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g).join('-'); // XXXX-XXXX-XXXX-XXXX-XX
}

// ── redeem rate limit (in-memory, per IP) ────────────────────
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 300_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10; // 10 tries / 5 min
}

// ── HTTP: /redeem and /validate ──────────────────────────────
const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress ?? '?';
  const origin = req.headers.origin ?? '';
  if (origin && ORIGINS.length && !ORIGINS.includes(origin)) {
    res.writeHead(403); res.end(); return;
  }
  const cors = {
    'Access-Control-Allow-Origin': origin || ORIGINS[0] || '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  if (req.method === 'POST' && req.url === '/redeem') {
    if (rateLimited(ip)) { res.writeHead(429, cors); res.end('{"error":"too many attempts"}'); return; }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let code = '';
      try { code = String(JSON.parse(body).code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); } catch { /* bad body */ }
      const entry = db.codes.find((c) => c.code.replace(/-/g, '') === code);
      if (!entry || entry.used) { res.writeHead(403, cors); res.end('{"error":"invalid code"}'); return; }
      if (Date.now() > entry.expiresAt) { res.writeHead(403, cors); res.end('{"error":"code expired"}'); return; }
      entry.used = true;
      const token = sign({ sub: entry.for, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS });
      db.tokens[token] = { for: entry.for, createdAt: Date.now() };
      save();
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, expiresInDays: 180 }));
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/validate') {
    // Caddy forward_auth: 200 = let the request through, anything else = deny
    const token = req.headers['x-access-token']
      ?? (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('kw_gate='))?.slice(8);
    const valid = verify(token);
    res.writeHead(valid ? 200 : 403, { 'Content-Type': 'application/json' });
    res.end(valid ? '{"ok":true}' : '{"ok":false}');
    return;
  }

  res.writeHead(404, cors); res.end('{"error":"not found"}');
});
server.listen(PORT, '127.0.0.1', () => console.log(`[gate] validate/redeem on 127.0.0.1:${PORT}`));

// ── Discord side ─────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName('approve')
    .setDescription('Approve a friend: DMs them a one-time site code')
    .addUserOption((o) => o.setName('user').setDescription('who gets access').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('revoke')
    .setDescription('Revoke a friend\'s access (all their tokens)')
    .addUserOption((o) => o.setName('user').setDescription('who loses access').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

client.once('ready', async () => {
  const rest = new REST().setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body: commands.map((c) => c.toJSON()) });
  console.log(`[gate] discord bot logged in as ${client.user.tag}; commands registered`);
});

client.on('interactionCreate', async (ix) => {
  if (!ix.isChatInputCommand()) return;
  if (ix.user.id !== OWNER_ID) { await ix.reply({ content: 'Only the owner can do that.', ephemeral: true }); return; }

  if (ix.commandName === 'approve') {
    const target = ix.options.getUser('user');
    const code = makeCode();
    db.codes.push({ code, for: target.id, by: ix.user.id, used: false, expiresAt: Date.now() + CODE_TTL_MS });
    save();
    try {
      await target.send(
        `You\'ve been approved for KitaWatch! Your one-time code (valid 15 min):

**${code}**

` +
        `Enter it at the site when asked. Don\'t share it — it only works once.`
      );
      await ix.reply({ content: `Code sent to ${target.username}.`, ephemeral: true });
    } catch {
      await ix.reply({ content: `Could not DM ${target.username} — they must share a server with the bot and allow DMs.`, ephemeral: true });
    }
  }

  if (ix.commandName === 'revoke') {
    const target = ix.options.getUser('user');
    let n = 0;
    for (const [tok, meta] of Object.entries(db.tokens)) {
      if (meta.for === target.id) { delete db.tokens[tok]; n++; }
    }
    save();
    await ix.reply({ content: `Revoked ${n} token(s) for ${target.username}. They\'ll be blocked on next check.`, ephemeral: true });
  }
});

client.login(DISCORD_TOKEN);
