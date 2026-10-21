"""Chemins et réglages de Mona."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("MONA_MODELS", ROOT / "models"))
WEB_DIR = Path(__file__).resolve().parent / "web"
HOME = Path(os.environ.get("MONA_HOME", Path.home() / ".mona"))

VIEW = {"width": 1440, "height": 900}      # taille d'un écran analysé
DEFAULTS = {
    "show_browser": True,    # montrer le Chrome de test pendant la capture
    "max_screens": 12,       # écrans analysés au plus par page
    "mode": "auto",          # auto, eco, standard ou turbo : voir hardware.py
}


def load_settings():
    s = dict(DEFAULTS)
    f = HOME / "settings.json"
    try:
        s.update(json.loads(f.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    if os.environ.get("MONA_MAX_SCREENS", "").isdigit():
        s["max_screens"] = int(os.environ["MONA_MAX_SCREENS"])
    if os.environ.get("MONA_HEADLESS") == "1":
        s["show_browser"] = False
    return s


def save_settings(new):
    s = load_settings()
    for k, v in new.items():
        if k in DEFAULTS and type(v) is type(DEFAULTS[k]):
            s[k] = v
    s["max_screens"] = max(1, min(30, int(s["max_screens"])))
    if s["mode"] not in ("auto", "eco", "standard", "turbo"):
        s["mode"] = "auto"
    HOME.mkdir(parents=True, exist_ok=True)
    (HOME / "settings.json").write_text(json.dumps(s, indent=2), encoding="utf-8")
    return s
