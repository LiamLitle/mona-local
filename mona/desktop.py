"""Lance Mona comme une application : serveur local + fenêtre dédiée (sans barre d'adresse ni onglets).

Fenêtre : pywebview si installé (fenêtre native), sinon Chrome ou Edge en « mode application »,
sinon le navigateur par défaut. L'application s'arrête quand la fenêtre est fermée.
"""
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser

import uvicorn

from . import config, server


def free_port(start=8765):
    for p in range(start, start + 40):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    raise RuntimeError("Aucun port libre trouvé.")


def _browser_exe():
    """Chrome, Edge ou Chromium déjà installés (utilisés seulement pour la fenêtre de l'interface)."""
    cands = []
    if sys.platform == "win32":
        for base in (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")):
            if base:
                cands += [os.path.join(base, r"Google\Chrome\Application\chrome.exe"), os.path.join(base, r"Microsoft\Edge\Application\msedge.exe")]
    elif sys.platform == "darwin":
        cands += ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
    for n in ("google-chrome", "chrome", "chromium", "chromium-browser", "microsoft-edge"):
        cands.append(shutil.which(n))
    return next((c for c in cands if c and os.path.exists(c)), None)


def _watchdog(stop):
    """Arrête le serveur quand l'interface ne donne plus signe de vie (fenêtre fermée)."""
    while not stop.is_set():
        time.sleep(2)
        lp = server.state["last_ping"]
        if lp and time.time() - lp > 20:
            stop.set()


def run(port=None, window=True, serve_only=False):
    port = port or int(os.environ.get("MONA_PORT", "0")) or free_port()
    server.state["port"] = port
    srv = uvicorn.Server(uvicorn.Config(server.app, host="127.0.0.1", port=port, log_level="warning"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    while not srv.started:
        time.sleep(0.05)
    url = f"http://127.0.0.1:{port}/"
    print(f"Mona tourne sur {url}  (Ctrl+C pour arrêter)")
    stop = threading.Event()
    try:
        if serve_only or not window:
            if not serve_only:
                webbrowser.open(url)
            while not stop.is_set():
                time.sleep(0.5)
        else:
            threading.Thread(target=_watchdog, args=(stop,), daemon=True).start()
            _open_window(url, stop)
    except KeyboardInterrupt:
        pass
    finally:
        srv.should_exit = True
        t.join(timeout=8)


def _open_window(url, stop):
    try:
        if os.environ.get("MONA_NO_WEBVIEW") == "1":
            raise ImportError
        import webview
        w = webview.create_window("Mona", url, width=1280, height=860, min_size=(900, 600), background_color="#0D0D0C")
        threading.Thread(target=lambda: (stop.wait(), w.destroy()), daemon=True).start()
        webview.start()
        return
    except ImportError:
        pass
    except Exception as e:
        print(f"Fenêtre native indisponible ({e.__class__.__name__}), on essaie Chrome ou Edge.")
    exe = _browser_exe()
    if exe:
        profile = config.HOME / "app-profile"
        profile.mkdir(parents=True, exist_ok=True)
        subprocess.Popen([exe, f"--app={url}", f"--user-data-dir={profile}", "--window-size=1280,860", "--no-first-run", "--no-default-browser-check"])
    else:
        webbrowser.open(url)
    stop.wait()
