"""« Plan B » : reconstruit ce que le code d'une page donnerait (textes, tailles, couleurs, boutons)
depuis les détections d'une IMAGE. Sert quand on part d'une capture ou d'une maquette.

Les réglages (models/plan_b_params.json) ont été calibrés sur des sites jamais vus : l'écart de note
moyen avec la lecture du vrai code est de 5,5 points sur 100.
"""
import json
from functools import lru_cache

import cv2
import numpy as np

from . import registry

DEFAULT = {"size_a": 0.8753, "size_b": 0.1723, "fg_pct": 0.03, "words_per_em": 2.8, "sc_min": 0.5, "size_shift": 0.0,
           "bold_thr": 0.5, "bold_coef": [0.0, 0.0, 0.0], "fill_thr": 8.0}


@lru_cache(maxsize=1)
def params():
    p = dict(DEFAULT)
    f = registry.path("plan_b_params.json")
    if f.exists():
        p.update(json.loads(f.read_text(encoding="utf-8")))
    return p


def _line_size(h, P):
    return float(max(6.0, np.exp(P["size_a"] * np.log(max(h, 1.0)) + P["size_b"]) + P["size_shift"]))


def _ring_color(img, box, pad=3):
    """Fond d'une boîte : médiane des pixels du pourtour (RGB)."""
    h, w = img.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)
    reg = img[Y0:Y1, X0:X1]
    if reg.size == 0:
        return [255.0, 255.0, 255.0]
    m = np.ones(reg.shape[:2], bool)
    m[pad:reg.shape[0] - pad, pad:reg.shape[1] - pad] = False
    px = reg[m] if m.any() else reg.reshape(-1, 3)
    if len(px) < 8:
        px = reg.reshape(-1, 3)
    return [float(v) for v in np.median(px, 0)]


def _text_colors(img, box, P):
    """(couleur du texte, fond, épaisseur de trait relative, part d'encre) dans une boîte de texte (RGB)."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    crop = img[y0:y1, x0:x1]
    if crop.size == 0 or crop.shape[0] < 3 or crop.shape[1] < 3:
        return [0.0, 0.0, 0.0], [255.0, 255.0, 255.0], 0.0, 0.0
    px = crop.reshape(-1, 3).astype(np.float32)
    q = (px // 16).astype(np.int32)                         # fond = couleur dominante après quantification
    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    vals, counts = np.unique(key, return_counts=True)
    bg = px[key == vals[counts.argmax()]].mean(0)
    dist = np.linalg.norm(px - bg, axis=1)
    k = max(3, int(len(px) * P["fg_pct"]))
    fg = px[np.argsort(dist)[-k:]].mean(0)                  # texte = pixels les plus éloignés du fond
    far = dist > 0.5 * max(dist.max(), 1e-6)
    mask = far.reshape(crop.shape[:2]).astype(np.uint8)
    dt = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    stroke = float(2 * dt[mask > 0].mean() / max(1.0, y1 - y0)) if mask.any() else 0.0
    return [float(v) for v in fg], [float(v) for v in bg], stroke, float(far.mean())


def dom_from_detections(img, dets):
    """img : écran RGB (uint8). dets : sortie de detector.detect. Retourne {texts, ctas} comme le code d'une page."""
    P = params()
    dets = [d for d in dets if d["score"] >= P["sc_min"]]
    texts, ctas = [], []
    for d in dets:
        if d["cls"] != "texte":
            continue
        b = d["box"]
        fg, bg, stroke, ink = _text_colors(img, b, P)
        size = _line_size(b[3] - b[1], P)
        c0, c1, c2 = P["bold_coef"]
        bold = 1 / (1 + np.exp(-(c0 + c1 * stroke + c2 * ink))) if (c1 or c2) else 0.0
        texts.append({"text": "(texte détecté)", "detecte": True, "words": max(1, round((b[2] - b[0]) / (size * P["words_per_em"]))),
                      "size": size, "weight": 700 if bold >= P["bold_thr"] else 400, "color": fg, "bg": bg, "fixed": False,
                      "box": [b[0], b[1], b[2] - b[0], b[3] - b[1]]})
    for d in dets:
        if d["cls"] != "bouton":
            continue
        x0, y0, x1, y1 = d["box"]
        ring = _ring_color(img, d["box"], pad=6)
        crop = img[max(0, int(y0)):int(y1), max(0, int(x0)):int(x1)]
        inner = [float(v) for v in np.median(crop.reshape(-1, 3), 0)] if crop.size else ring
        filled = float(np.linalg.norm(np.array(inner) - np.array(ring))) > P["fill_thr"]
        ctas.append({"text": "(bouton détecté)", "detecte": True, "fixed": False, "box": [x0, y0, x1 - x0, y1 - y0], "filled": filled,
                     "area": (x1 - x0) * (y1 - y0), "bg": inner if filled else None, "parentBg": ring})
    return {"texts": texts, "ctas": ctas}
