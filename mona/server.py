"""Serveur local de Mona : l'interface (mona/web) et l'API d'analyse, sur 127.0.0.1 uniquement.

    GET  /api/hardware       PC, plan choisi, réglages, état des modèles
    POST /api/settings       change un réglage (Chrome visible, nombre d'écrans, mode)
    POST /api/analyze        {"url": ...}   -> flux d'événements JSON (une ligne par événement)
    POST /api/analyze-image  image brute    -> flux d'événements JSON
    GET  /api/ping           battement de cœur : l'application s'arrête quand sa fenêtre est fermée
"""
import asyncio
import json
import time
import traceback
from urllib.parse import unquote
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .ai import registry
from .capture import CaptureError
from .pipeline import Analyzer

state = {"analyzer": None, "port": 8765, "last_ping": None}


@asynccontextmanager
async def lifespan(app):
    state["analyzer"] = Analyzer()
    yield
    await state["analyzer"].close()


app = FastAPI(title="Mona", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def only_this_app(request: Request, call_next):
    """Refuse les requêtes qui ne viennent pas de cette application (autre site web, attaque par rebond DNS)."""
    ok = {f"127.0.0.1:{state['port']}", f"localhost:{state['port']}"}
    if request.headers.get("host", "") not in ok:
        return JSONResponse({"detail": "Hôte refusé."}, status_code=403)
    origin = request.headers.get("origin")
    if origin and origin.split("://", 1)[-1] not in ok:
        return JSONResponse({"detail": "Origine refusée."}, status_code=403)
    return await call_next(request)


@app.get("/api/ping")
async def ping():
    state["last_ping"] = time.time()
    return {"ok": True}


@app.get("/api/hardware")
async def hardware_info():
    a = state["analyzer"]
    a.refresh()
    return {"hardware": a.hw, "plan": a.plan, "settings": a.settings, "models": [
        {"file": f, "etat": e, "detail": d} for f, e, d in registry.check()]}


@app.post("/api/settings")
async def settings(request: Request):
    new = await request.json()
    s = config.save_settings(new if isinstance(new, dict) else {})
    state["analyzer"].refresh()
    return {"settings": s, "plan": state["analyzer"].plan}


def _stream(work):
    """Exécute work(emit) et renvoie les événements au fur et à mesure (une ligne JSON chacun)."""
    async def gen():
        loop = asyncio.get_running_loop()
        q = asyncio.Queue()
        emit = lambda ev: loop.call_soon_threadsafe(q.put_nowait, ev)

        async def run():
            try:
                rapport = await work(emit)
                await q.put({"t": "termine", "rapport": rapport})
            except CaptureError as e:
                await q.put({"t": "erreur", "message": str(e)})
            except asyncio.CancelledError:
                raise
            except Exception as e:
                traceback.print_exc()
                await q.put({"t": "erreur", "message": f"L'analyse a échoué ({e.__class__.__name__}: {e})."})
            await q.put(None)

        task = asyncio.create_task(run())
        try:
            while (ev := await q.get()) is not None:
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        finally:
            task.cancel()
    return StreamingResponse(gen(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})


@app.post("/api/analyze")
async def analyze(request: Request):
    body = await request.json()
    return _stream(lambda emit: state["analyzer"].analyse_url(str(body.get("url", "")), emit))


@app.post("/api/analyze-image")
async def analyze_image(request: Request):
    data = await request.body()
    name = unquote(request.headers.get("x-name", "Image"))[:80]
    if len(data) > 40_000_000:
        return JSONResponse({"detail": "Image trop lourde (40 Mo au plus)."}, status_code=413)
    return _stream(lambda emit: state["analyzer"].analyse_image(data, name, emit))


app.mount("/", StaticFiles(directory=str(config.WEB_DIR), html=True), name="web")
