"""Registre des modèles : lit models/MODELS.json et vérifie que les fichiers sont là et intacts."""
import hashlib
import json

from .. import config

CRLF, LF = b"\r\n", b"\n"


def load():
    return json.loads((config.MODELS_DIR / "MODELS.json").read_text(encoding="utf-8"))["files"]


def path(name):
    return config.MODELS_DIR / name


def content(name):
    """Octets d'un fichier ; les fichiers texte sont comparés avec des fins de ligne normalisées (Windows ou Git les changent parfois)."""
    b = path(name).read_bytes()
    return b.replace(CRLF, LF) if name.endswith(".json") else b


def check(deep=False):
    """Retourne [(fichier, état, détail)]. deep=True recalcule l'empreinte SHA-256 (quelques secondes)."""
    out = []
    for f in load():
        if not path(f["file"]).exists():
            out.append((f["file"], "absent", "fichier manquant : retélécharge le dépôt"))
            continue
        b = content(f["file"])
        if len(b) != f["bytes"]:
            out.append((f["file"], "abîmé", f"taille {len(b)} au lieu de {f['bytes']}"))
        elif deep and hashlib.sha256(b).hexdigest() != f["sha256"]:
            out.append((f["file"], "abîmé", "empreinte SHA-256 différente"))
        else:
            out.append((f["file"], "ok", f"{f['bytes'] / 1e6:.1f} Mo"))
    return out
