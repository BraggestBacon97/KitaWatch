"""KitaWatch proxy sidecar - CORS relay, referer injection, m3u8 rewriting.
  GET /ap?m=...             -> animepahe internal API relay (Referer + CORS)
  GET /kwik?u=<kwik link>   -> kwik token dance -> real m3u8 URL
  GET /cors?u=<url>         -> generic JSON/text passthrough with CORS
  GET /proxy_m3u8?url&referer  -> playlist with segments rewritten through us
  GET /proxy_segment?url&referer -> bytes streamed with spoofed Referer
Run: python -m uvicorn server:app --host 127.0.0.1 --port 8001  (from proxy/)
"""
import os
import re
from urllib.parse import urlencode, urljoin, urlparse

import httpx
from fastapi import FastAPI, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

AP_BASE = "https://animepahe.ru"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
}

client = httpx.AsyncClient(timeout=30.0, follow_redirects=False)

# Public-internet lockdown: only these hosts may be fetched through /cors,
# /proxy_m3u8 and /proxy_segment. Override with PROXY_ALLOWLIST="a.com,b.com".
DEFAULT_ALLOWLIST = {
    "anikage.cc", "www.anikage.cc",
    "kwik.si",
    "animepahe.ru", "www.animepahe.ru",
    "anilist.co", "api.anilist.co", "graphql.anilist.co", "s4.anilist.co",
    "og.bakayaro.live",
    "api.aniskip.com",
    "1anime.app", "www.1anime.app",
    "localhost", "127.0.0.1",
}
ALLOWED_HOSTS = {
    h.strip().lower()
    for h in os.environ.get("PROXY_ALLOWLIST", "").split(",")
    if h.strip()
} or DEFAULT_ALLOWLIST


def host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host in ALLOWED_HOSTS or any(host.endswith("." + a) for a in ALLOWED_HOSTS)


def _headers(referer: str = "") -> dict:
    h = dict(UA)
    if referer:
        h["Referer"] = referer
    return h


# ── animepahe ────────────────────────────────────────────────
@app.get("/ap")
async def ap(
    m: str = Query(...),
    q: str = Query(default=""),
    id: str = Query(default=""),
    sort: str = Query(default="episode_asc"),
    page: int = Query(default=1),
):
    params: dict = {"m": m}
    if q:
        params["q"] = q
    if id:
        params["id"] = id
    if m == "release":
        params.update({"sort": sort, "page": page})
    try:
        r = await client.get(f"{AP_BASE}/api?{urlencode(params)}", headers=_headers(AP_BASE + "/"), timeout=15.0)
    except Exception as e:
        return JSONResponse({"error": f"upstream failed: {type(e).__name__}"}, status_code=502)
    try:
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception:
        return JSONResponse({"error": "bad upstream response", "body": r.text[:300]}, status_code=502)


@app.get("/kwik")
async def kwik(u: str = Query(...)):
    r = await client.get(u, headers=_headers())
    m = re.search(r'name="_token"\s+value="([^"]+)"', r.text)
    if not m:
        return JSONResponse({"error": "kwik token not found"}, status_code=502)
    r2 = await client.post(u, data={"_token": m.group(1)}, headers=_headers(u))
    if r2.status_code in (301, 302, 303, 307, 308):
        return {"url": r2.headers["location"]}
    m3 = re.search(r'"(https?://[^"]+\.m3u8[^"]*)"', r2.text)
    if m3:
        return {"url": m3.group(1)}
    return JSONResponse({"error": "no stream in kwik response"}, status_code=502)


# ── generic CORS passthrough ─────────────────────────────────
@app.get("/cors")
async def cors(u: str = Query(...), ref: str = Query(default="")):
    if not host_allowed(u):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    try:
        r = await client.get(u, headers=_headers(ref), timeout=15.0)
    except Exception as e:
        return JSONResponse({"error": f"upstream failed: {type(e).__name__}"}, status_code=502)
    content_type = r.headers.get("content-type", "application/json")
    if "json" in content_type:
        try:
            return JSONResponse(r.json(), status_code=r.status_code)
        except Exception:
            pass
    return PlainTextResponse(r.text, status_code=r.status_code, media_type=content_type)


# ── m3u8 proxy ───────────────────────────────────────────────
@app.get("/proxy_m3u8")
async def proxy_m3u8(url: str = Query(...), referer: str = Query(default="")):
    if not host_allowed(url):
        return PlainTextResponse("host not allowed", status_code=403)
    r = await client.get(url, headers=_headers(referer))
    if r.status_code != 200:
        return PlainTextResponse("upstream error", status_code=r.status_code)
    base = url.rsplit("/", 1)[0] + "/"
    out = []
    for line in r.text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            out.append(line)
            continue
        abs_url = urljoin(base, s)
        out.append(f"/proxy_segment?{urlencode({'url': abs_url, 'referer': referer})}")
    return PlainTextResponse(
        "\n".join(out), media_type="application/vnd.apple.mpegurl"
    )


@app.get("/proxy_segment")
async def proxy_segment(url: str = Query(...), referer: str = Query(default="")):
    if not host_allowed(url):
        return PlainTextResponse("host not allowed", status_code=403)
    req = client.build_request("GET", url, headers=_headers(referer))
    r = await client.send(req, stream=True)
    return StreamingResponse(
        r.aiter_bytes(),
        media_type=r.headers.get("content-type", "application/octet-stream"),
        status_code=r.status_code,
    )

# ── Website build: OAuth token exchange (desktop uses the Rust command) ──
ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token"


@app.post("/auth/token")
async def auth_token(code: str = Form(...)):
    client_id = os.environ.get("ANILIST_CLIENT_ID", "")
    client_secret = os.environ.get("ANILIST_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("ANILIST_REDIRECT_URI", "")
    r = await client.post(
        ANILIST_TOKEN_URL,
        json={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        },
        timeout=20.0,
    )
    try:
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception:
        return JSONResponse({"error": "bad upstream response"}, status_code=502)
