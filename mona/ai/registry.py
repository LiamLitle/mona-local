"""Registre des modèles : lit models/MODELS.json et vérifie que les fichiers sont là et intacts."""
import hashlib
import json

from .. import config


def load():
    return json.loads((config.MODELS_DIR / "MODELS.json").read_text(encoding="utf-8"))["files"]


def path(name):
    return config.MODELS_DIR / name


def check(deep=False):
    """Retourne [(fichier, état, détail)]. deep=True recalcule l'empreinte SHA-256 (quelques secondes)."""
    out = []
    for f in load():
        p = path(f["file"])
        if not p.exists():
            out.append((f["file"], "absent", "fichier manquant : retélécharge le dépôt"))
        elif p.stat().st_size != f["bytes"]:
            out.append((f["file"], "abîmé", f"taille {p.stat().st_size} au lieu de {f['bytes']}"))
        elif deep and hashlib.sha256(p.read_bytes()).hexdigest() != f["sha256"]:
            out.append((f["file"], "abîmé", "empreinte SHA-256 différente"))
        else:
            out.append((f["file"], "ok", f"{f['bytes'] / 1e6:.1f} Mo"))
    return out
