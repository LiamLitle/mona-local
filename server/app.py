"""Mona en local : sert la page de Mona et ouvre les adresses dans un vrai Chrome (Playwright).

Le serveur ouvre l'URL, defile la page et renvoie les ecrans (JPEG) + le code de la page (textes,
tailles, couleurs, boutons). L'analyse (regard, cerveau, regles, note) se fait dans le navigateur
de la personne, avec les modeles de web/models. Rien n'est envoye hors de cet ordinateur,
sauf la visite du site analyse.

Ecoute uniquement sur 127.0.0.1. Les requetes venant d'une autre page web (en-tete Origin etranger)
sont refusees, pour qu'un site ne puisse pas utiliser ce serveur a ton insu.
"""
import asyncio
import base64
import ipaddress
import os
import socket
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from playwright.async_api import async_playwright

from capture_js import DOM_FULL_JS, SCROLLER_JS

VIEW = {"width": 1440, "height": 900}
MAX_SCREENS = int(os.environ.get("MONA_MAX_SCREENS", "12"))
TOTAL_TIMEOUT = float(os.environ.get("MONA_TIMEOUT", "75"))
CONCURRENCY = int(os.environ.get("MONA_CONCURRENCY", "2"))
QUEUE_MAX = int(os.environ.get("MONA_QUEUE_MAX", "6"))
RATE_MAX = int(os.environ.get("MONA_RATE_MAX", "0"))            # analyses par heure et par IP (0 = pas de limite, usage local)
ALLOW_PRIVATE = os.environ.get("MONA_PUBLIC") != "1"             # en local on peut analyser localhost ; MONA_PUBLIC=1 pour un serveur ouvert
TRUST_PROXY = os.environ.get("MONA_TRUST_PROXY") == "1"          # derriere un proxy (Hugging Face...)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0 Safari/537.36 MonaCapture/1.0")

state = {"browser": None, "pw": None}
sem = asyncio.Semaphore(CONCURRENCY)
attente = {"n": 0}
rate = defaultdict(deque)
host_cache = {}


@asynccontextmanager
async def lifespan(app):
    state["pw"] = await async_playwright().start()
    state["browser"] = await state["pw"].chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    yield
    await state["browser"].close()
    await state["pw"].stop()


app = FastAPI(title="Mona capture", lifespan=lifespan)
PORT = int(os.environ.get("MONA_PORT", "8765"))
SELF = {f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"}


@app.middleware("http")
async def meme_origine(request: Request, call_next):
    o = request.headers.get("origin")
    if o and o not in SELF:
        return JSONResponse({"detail": "Origine refusée."}, status_code=403)
    return await call_next(request)


class Demande(BaseModel):
    url: str


def ip_publique(ip):
    a = ipaddress.ip_address(ip)
    if getattr(a, "ipv4_mapped", None):
        a = a.ipv4_mapped
    return a.is_global and not a.is_multicast


async def hote_ok(host):
    """Vrai si TOUTES les adresses du nom sont publiques (resultat garde 5 minutes)."""
    if ALLOW_PRIVATE:
        return True
    hit = host_cache.get(host)
    if hit and time.time() - hit[1] < 300:
        return hit[0]
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
        ok = bool(infos) and all(ip_publique(i[4][0]) for i in infos)
    except Exception:
        ok = False
    host_cache[host] = (ok, time.time())
    return ok


async def url_ok(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        return False
    if p.port not in (None, 80, 443) and not ALLOW_PRIVATE:
        return False
    return await hote_ok(p.hostname)


def ip_client(request: Request):
    if TRUST_PROXY and request.headers.get("x-forwarded-for"):
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    return request.client.host if request.client else "?"


def dom_at(dom, y, vh):
    """Textes et boutons visibles a la position y (coordonnees d'ecran), comme capture._dom_at."""
    def visible(items):
        out = []
        for it in items:
            x0, top, w, h = it["box"]
            vy = top if it["fixed"] else top - y
            if vy + h < 0 or vy > vh:
                continue
            out.append({**it, "box": [x0, vy, w, h]})
        return out
    return {"texts": visible(dom["texts"]), "ctas": visible(dom["ctas"]), "pageHeight": dom["pageHeight"]}


async def capturer(url):
    ctx = await state["browser"].new_context(viewport=VIEW, locale="fr-FR", user_agent=UA, accept_downloads=False,
                                             service_workers="block", permissions=[])
    try:
        async def garde(route):
            req = route.request
            u = req.url
            if u.startswith(("data:", "blob:", "about:")):
                return await route.continue_()
            if req.resource_type in ("media", "websocket", "eventsource") or not await url_ok(u):
                return await route.abort()
            await route.continue_()

        await ctx.route("**/*", garde)
        page = await ctx.new_page()
        t0 = time.time()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        except Exception as e:
            raise HTTPException(502, f"Impossible d'ouvrir la page ({e.__class__.__name__}).")
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        final = page.url
        if not await url_ok(final):
            raise HTTPException(400, "Redirection vers une adresse non autorisée.")
        mode = await page.evaluate(SCROLLER_JS)
        await page.evaluate("() => window.__mona.scrollTo({top: 0, behavior: 'instant'})")
        await page.wait_for_timeout(2500)                         # animations d'entree
        title = await page.title()
        screens, last_y, page_h = [], -100, 0
        for k in range(MAX_SCREENS):
            if k:
                await page.evaluate(f"() => window.__mona.scrollTo({{top: {k * VIEW['height']}, behavior: 'instant'}})")
                await page.wait_for_timeout(1100)                  # apparitions au defilement, images paresseuses
            y = await page.evaluate("() => window.__mona.scrollTop")
            if y <= last_y + 1:
                break                                              # le defilement n'avance plus : fond de page
            last_y = y
            jpg = await page.screenshot(type="jpeg", quality=80)
            dom = await page.evaluate(DOM_FULL_JS)
            page_h = dom["pageHeight"]
            screens.append({"n": len(screens) + 1, "y": round(y),
                            "image": "data:image/jpeg;base64," + base64.b64encode(jpg).decode(),
                            "dom": dom_at(dom, y, VIEW["height"])})
            if y + VIEW["height"] >= page_h - 5:
                break
        return {"url": url, "final_url": final, "title": title, "scroll_mode": mode, "page_height": page_h,
                "viewport": VIEW, "screens": screens, "complete": last_y + VIEW["height"] >= page_h - 5,
                "seconds": round(time.time() - t0, 1)}
    finally:
        await ctx.close()


@app.get("/health")
async def health():
    return {"ok": True, "waiting": attente["n"], "limits": {"screens": MAX_SCREENS, "per_hour": RATE_MAX}}


@app.post("/api/capture")
async def capture(d: Demande, request: Request):
    url = d.url.strip()
    if len(url) > 2000:
        raise HTTPException(400, "Adresse trop longue.")
    if "://" not in url:
        url = "https://" + url
    if not await url_ok(url):
        raise HTTPException(400, "Adresse non autorisée (http/https public seulement).")
    ip = ip_client(request)
    now = time.time()
    q = rate[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if RATE_MAX and len(q) >= RATE_MAX:
        raise HTTPException(429, f"Limite atteinte : {RATE_MAX} analyses par heure. Reviens un peu plus tard.")
    if attente["n"] >= QUEUE_MAX:
        raise HTTPException(503, "Le serveur est occupé, réessaie dans une minute.")
    q.append(now)
    attente["n"] += 1
    try:
        async with sem:
            attente["n"] -= 1
            try:
                return await asyncio.wait_for(capturer(url), TOTAL_TIMEOUT)
            except asyncio.TimeoutError:
                raise HTTPException(504, "La page met trop de temps à se charger.")
    except BaseException:
        raise


app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "web"), html=True), name="web")


if __name__ == "__main__":
    import threading
    import webbrowser

    import uvicorn
    if os.environ.get("MONA_NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}/")).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
