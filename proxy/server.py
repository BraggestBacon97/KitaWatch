from urllib.parse import urlparse, unquote

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

app = FastAPI()

# CORS: any localhost origin may call us (the desktop app). Credentials are
# never involved, so "*" is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Domains we are willing to fetch on behalf of the app. Suffix match.
DEFAULT_ALLOWLIST = {
    # metadata / community APIs
    "anikage.cc",
    "kwik.si",
    "animepahe.ru",
    "anilist.co",
    "api.aniskip.com",
    "graphql.anilist.co",
    "ltn.hitomi.la",
    # providers
    "1anime.app",
    # local sidecars
    "localhost",
    "127.0.0.1",
    # Anivexa provider CDNs (m3u8/subtitle hosts the watch endpoints return;
    # these are referer-locked and CORS-locked, so they only play through us)
    "vid-cdn.xyz",      # anizone (seiryuu.vid-cdn.xyz)
    "bcdn2.se",         # senshi / kickasscdn (s-95.bcdn2.se)
    "animeapps.top",    # anidbapp (playeng.animeapps.top)
    "vid-cdn.xyz",      # anizone (seiryuu.vid-cdn.xyz)
    "bcdn2.se",         # senshi / kickasscdn (s-95.bcdn2.se)
    "animeapps.top",    # anidbapp (playeng.animeapps.top)
    "bakayaro.live",    # anikage (og.bakayaro.live)
}

# Optional operator override: comma-separated extra hosts.
import os

ALLOWLIST = DEFAULT_ALLOWLIST | {
    h.strip().lower() for h in os.environ.get("PROXY_ALLOWLIST", "").split(",") if h.strip()
}


def host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host in ALLOWLIST or any(host.endswith("." + a) for a in ALLOWLIST)


def _headers(referer: str | None) -> dict[str, str]:
    h = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    }
    if referer:
        h["Referer"] = referer
    return h


@app.get("/cors")
async def cors(u: str = Query(...), ref: str | None = None):
    """Generic CORS-safe fetch: returns the body, streams binary."""
    if not host_allowed(u):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            r = await client.get(u, headers=_headers(ref))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/octet-stream"),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/proxy_m3u8")
async def proxy_m3u8(url: str = Query(...), referer: str | None = None):
    """Fetch an m3u8 playlist, rewrite segment URLs through /proxy_segment."""
    if not host_allowed(url):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            r = await client.get(url, headers=_headers(referer))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    if r.status_code != 200:
        return Response(
            content=r.content,
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "text/plain"),
        )
    text = r.text
    base = url.rsplit("/", 1)[0] + "/"

    def fix(line: str) -> str:
        line = line.strip()
        if not line or line.startswith("#"):
            return line
        if line.startswith("http://") or line.startswith("https://"):
            seg = line
        else:
            seg = base + line
        return f"/proxy_segment?url={seg}&referer={referer or ''}"

    out = "\n".join(fix(l) for l in text.splitlines())
    return Response(
        content=out,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/proxy_segment")
async def proxy_segment(url: str = Query(...), referer: str | None = None):
    """Stream a video segment through us (avoids CDN referer checks)."""
    if not host_allowed(url):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        try:
            r = await client.get(url, headers=_headers(referer))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/octet-stream"),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/fetch")
async def fetch_url(u: str = Query(...), ref: str | None = None):
    """Passthrough with CORS headers (HTML pages, magnets, etc.)."""
    if not host_allowed(u):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            r = await client.get(u, headers=_headers(ref))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/octet-stream"),
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/ap")
async def animepahe(m: str = Query(...), q: str = Query(default=""), id: str | None = None):
    """animepahe search & episode-list passthrough (api.animepahe.ru)."""
    base = "https://api.animepahe.ru"
    url = f"{base}/search/{q}" if m == "search" else f"{base}/episodes/{id or q}"
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            r = await client.get(url, headers=_headers("https://animepahe.ru/"))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type="application/json",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/kwik")
async def kwik(u: str = Query(...)):
    """kwik link extraction passthrough."""
    if not host_allowed(u):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
        try:
            r = await client.get(u, headers=_headers("https://kwik.si/"))
        except httpx.HTTPError as e:
            return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "text/html"),
        headers={"Access-Control-Allow-Origin": "*"},
    )