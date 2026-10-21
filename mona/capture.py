"""Capture d'une page avec un Chrome de test (Playwright) piloté depuis ce PC.

Le navigateur s'ouvre (visible ou non, selon les réglages), charge l'adresse, puis fait défiler la page
écran par écran jusqu'en bas. À chaque arrêt : une capture d'écran et le code visible de la page
(textes, tailles, couleurs, boutons), que les règles de lisibilité utilisent ensuite.
"""
import asyncio
import io
import time
from urllib.parse import urlparse

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

from . import config
from .capture_js import DOM_FULL_JS, SCROLLER_JS

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0 Safari/537.36 MonaCapture/1.0")
TOTAL_TIMEOUT = 120


class CaptureError(Exception):
    """Erreur lisible par la personne (adresse invalide, page inaccessible...)."""


def normalise_url(brut):
    u = (brut or "").strip()
    if not u:
        raise CaptureError("Colle l'adresse d'un site.")
    if "://" not in u:
        u = "https://" + u
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise CaptureError("Cette adresse n'est pas valide (http ou https seulement).")
    return u


def dom_at(dom, y, vh):
    """Textes et boutons visibles à la position y (coordonnées d'écran)."""
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


class Chrome:
    """Un Chrome de test, lancé à la demande et gardé ouvert entre deux analyses."""

    def __init__(self):
        self._pw = None
        self._browser = None
        self._visible = None

    async def _ensure(self, visible):
        if self._browser is not None and self._visible != visible:
            await self.close()
        if self._browser is None:
            self._pw = await async_playwright().start()
            args = ["--disable-dev-shm-usage", "--mute-audio"]
            if visible:
                args += ["--window-position=40,40", "--disable-infobars"]
            try:
                self._browser = await self._pw.chromium.launch(headless=not visible, args=args)
            except Exception as e:
                await self._pw.stop()
                self._pw = None
                raise CaptureError("Le Chrome de test n'est pas installé. Lance « python -m mona setup » puis réessaie.") from e
            self._visible = visible
        return self._browser

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        self._browser = self._pw = None

    async def capture(self, url, max_screens, visible, on_status=lambda t: None, on_screen=lambda s: None):
        """Retourne {url, final_url, title, page_height, screens: [{n, y, rgb, jpeg, dom}], complete, seconds}."""
        browser = await self._ensure(visible)
        ctx = await browser.new_context(viewport=config.VIEW, locale="fr-FR", user_agent=UA, accept_downloads=False, service_workers="block")
        t0 = time.time()
        try:
            async def garde(route):
                if route.request.resource_type in ("media", "websocket", "eventsource"):
                    return await route.abort()
                await route.continue_()

            await ctx.route("**/*", garde)
            page = await ctx.new_page()
            on_status("Ouverture de la page")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                raise CaptureError(f"Impossible d'ouvrir la page ({e.__class__.__name__}). Vérifie l'adresse et ta connexion.") from e
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            mode = await page.evaluate(SCROLLER_JS)
            await page.evaluate("() => window.__mona.scrollTo({top: 0, behavior: 'instant'})")
            await page.wait_for_timeout(2500)                      # animations d'entrée
            title = await page.title()
            screens, last_y, page_h = [], -100, 0
            vh = config.VIEW["height"]
            for k in range(max_screens):
                if time.time() - t0 > TOTAL_TIMEOUT:
                    break
                if k:
                    await page.evaluate(f"() => window.__mona.scrollTo({{top: {k * vh}, behavior: 'instant'}})")
                    await page.wait_for_timeout(1100)              # apparitions au défilement, images paresseuses
                y = await page.evaluate("() => window.__mona.scrollTop")
                if y <= last_y + 1:
                    break                                          # le défilement n'avance plus : fond de page
                last_y = y
                jpg = await page.screenshot(type="jpeg", quality=88)
                dom = await page.evaluate(DOM_FULL_JS)
                page_h = dom["pageHeight"]
                rgb = np.asarray(Image.open(io.BytesIO(jpg)).convert("RGB"))
                s = {"n": len(screens) + 1, "y": round(y), "rgb": rgb, "jpeg": jpg, "dom": dom_at(dom, y, vh)}
                screens.append(s)
                on_screen(s)
                if y + vh >= page_h - 5:
                    break
            return {"url": url, "final_url": page.url, "title": title, "scroll_mode": mode, "page_height": page_h, "screens": screens,
                    "complete": last_y + vh >= page_h - 5, "seconds": round(time.time() - t0, 1)}
        finally:
            await ctx.close()
