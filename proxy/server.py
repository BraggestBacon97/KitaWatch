from urllib.parse import urlparse

from curl_cffi.requests import AsyncSession
from fastapi import FastAPI, Query
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
# NOTE: playback routes (proxy_m3u8/proxy_segment) need every CDN host a
# provider chain touches — providers rotate CDNs constantly, so this list
# grows. The planned fix is a launcher-generated token header that lets us
# drop the playback allowlist entirely.
DEFAULT_ALLOWLIST = {
    # metadata / community APIs
    "anikage.cc",
    "kwik.si",
    "animepahe.ru",
    "anilist.co",
    "api.aniskip.com",
    "graphql.anilist.co",
    "ltn.hitomi.la",
    "nyaa.si",
    # providers
    "1anime.app",
    "anify.tv",       # Anify public API (api.anify.tv)
    # local sidecars
    "localhost",
    "127.0.0.1",
    # Provider CDNs (m3u8/subtitle hosts the watch endpoints return; these are
    # referer-locked and CORS-locked, so they only play through us)
    "vid-cdn.xyz",      # anizone (seiryuu.vid-cdn.xyz)
    "bcdn2.se",         # senshi / kickasscdn (s-95.bcdn2.se)
    "bcdn1.se",         # senshi mirrors (s-90.bcdn1.se)
    "animeapps.top",    # anidbapp (playeng.animeapps.top)
    "bakayaro.live",    # anikage (og.bakayaro.live)
    "flixcloud.cc",     # anikage / anikoto mirrors (fetch*.flixcloud.cc)
    "nexabloom.top",    # megaplay family (fetch.nexabloom.top)
    "tyrionx.top",      # megaplay nested segment hosts (tx-*.tyrionx.top)
    "krussdomi.com",    # krussdomi (hls.krussdomi.com)
    "roburnt10.store",  # echovideo (st3.roburnt10.store)
    "r66nv9ed.com",     # gn1r5n / anikage servers (edge*.r66nv9ed.com)
}

# Optional operator override: comma-separated extra hosts.
import os

ALLOWLIST = DEFAULT_ALLOWLIST | {
    h.strip().lower() for h in os.environ.get("PROXY_ALLOWLIST", "").split(",") if h.strip()
}

# Browser impersonation target (TLS/JA3/HTTP2 fingerprint). Plain clients get
# Cloudflare-403'd by nyaa/animepahe and half the provider CDNs.
BROWSER = "chrome124"


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


async def _get(url: str, referer: str | None, timeout: float):
    """One browser-impersonated GET. Raises on network errors."""
    async with AsyncSession(impersonate=BROWSER, timeout=timeout) as client:
        return await client.get(url, headers=_headers(referer))


@app.get("/cors")
async def cors(u: str = Query(...), ref: str | None = None):
    """Generic CORS-safe fetch: returns the body, streams binary."""
    if not host_allowed(u):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    try:
        r = await _get(u, ref, 30.0)
    except Exception as e:
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
    try:
        r = await _get(url, referer, 30.0)
    except Exception as e:
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
    """Stream a video segment through us (avoids CDN referer checks).

    Providers chain playlists across hosts (master -> variant -> segments,
    e.g. fetch.nexabloom.top -> tx-05.tyrionx.top). A nested m3u8 variant
    fetched here would otherwise hand hls.js absolute segment URLs that it
    then loads DIRECTLY — and gets referer-403'd. So when the response is a
    playlist, rewrite its segment lines through /proxy_segment as well.
    """
    if not host_allowed(url):
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    try:
        r = await _get(url, referer, 60.0)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)

    ctype = r.headers.get("content-type", "")
    looks_like_playlist = (
        "mpegurl" in ctype.lower()
        or url.split("?")[0].endswith(".m3u8")
        or r.content[:8].startswith(b"#EXTM3U")
    )
    if looks_like_playlist and r.status_code == 200:
        base = url.rsplit("/", 1)[0] + "/"

        def fix(line: str) -> str:
            line = line.strip()
            if not line or line.startswith("#"):
                return line
            seg = line if line.startswith(("http://", "https://")) else base + line
            return f"/proxy_segment?url={seg}&referer={referer or ''}"

        out = "\n".join(fix(l) for l in r.text.splitlines())
        return Response(
            content=out,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )

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
    try:
        r = await _get(u, ref, 30.0)
    except Exception as e:
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
    try:
        r = await _get(url, "https://animepahe.ru/", 30.0)
    except Exception as e:
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
    try:
        r = await _get(u, "https://kwik.si/", 30.0)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "text/html"),
        headers={"Access-Control-Allow-Origin": "*"},
    )