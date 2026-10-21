"""Les six règles de lisibilité et la note sur 100.

Mêmes seuils et mêmes poids que sur le site (voir benchmarks.html#methode) :
contraste du texte, taille du texte, bouton principal visible, clarté, quantité de texte, hiérarchie.
"""
import cv2
import numpy as np

from .ai.gaze import SCALE


def rnd(x):
    """Arrondi à l'entier le plus proche, moitiés vers le haut (comme le site)."""
    return int(np.floor(x + 0.5))


def luminance(rgb):
    c = [v / 255 for v in rgb]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted([luminance(a), luminance(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def pixel_bg(img, box, text_rgb=None):
    """Couleur de fond la plus probable derrière un texte, lue sur la capture (les pixels proches du texte sont exclus)."""
    x, y, w, h = [int(round(v)) for v in box]
    x, y = max(x, 0), max(y, 0)
    px = img[y:y + h, x:x + w].reshape(-1, 3).astype(np.float32)
    if px.size == 0:
        return None
    if text_rgb is not None:
        far = np.linalg.norm(px - np.array(text_rgb, np.float32), axis=1) > 60
        if far.sum() > 0.2 * len(px):
            px = px[far]
    return [float(v) for v in np.median(px, axis=0)]


def box_max(att, box):
    """Valeur maximale de la carte du regard sous une boîte [x, y, w, h] (coordonnées d'écran)."""
    x, y, w, h = [int(round(v * SCALE)) for v in box]
    x0, y0 = max(0, x), max(0, y)
    roi = att[y0:y + max(1, h), x0:x + max(1, w)]
    return float(roi.max()) if roi.size else 0.0


def check_screen(img, dom, att, first):
    """Retourne (note de l'écran sur 100, [{nom, score, conseil}])."""
    checks = []
    where = "au premier écran" if first else "sur cet écran"
    texts = dom.get("texts") or []

    if texts:
        for t in texts:
            t["bg_px"] = pixel_bg(img, t["box"], t["color"]) or t["bg"]
        bad = [t for t in texts if contrast(t["color"], t["bg_px"]) < (3 if t["size"] >= 24 or (t["size"] >= 18.66 and t["weight"] >= 700) else 4.5)]
        s = 1 - sum(t["words"] for t in bad) / max(1, sum(t["words"] for t in texts))   # pondéré par les mots
        ex = "" if any(t.get("detecte") for t in bad) else ", ex. " + ", ".join(f"« {t['text'][:25]} »" for t in bad[:3])
        tip = f"{len(bad)} texte(s) avec un contraste trop faible{ex}. Assombris le texte ou éclaircis le fond." if bad else None
        checks.append(("Contraste du texte", s, 2.0, tip))

        small = [t for t in texts if t["size"] < 14]
        checks.append(("Taille du texte", 1 - len(small) / len(texts), 1.0,
                       f"{len(small)} texte(s) en dessous de 14 px : difficile à lire, surtout sur mobile." if len(small) > 2 else None))

    ctas = [c for c in (dom.get("ctas") or []) if c["filled"] and c["text"] and contrast(c["bg"], c["parentBg"]) > 1.6]
    if not first:
        ctas = [c for c in ctas if not c.get("fixed")]
    if ctas:
        pool = [c for c in ctas if not c.get("fixed")] or ctas
        main = max(pool, key=lambda c: c["area"] * contrast(c["bg"], c["parentBg"]))
        ratio = box_max(att, main["box"]) / (float(np.percentile(att, 95)) + 1e-8)
        s = float(np.clip(np.sqrt(ratio) / 0.9, 0, 1))
        if s < 0.6:
            tip = ("Le bouton principal repéré sur l’image attire peu le regard. Plus gros, plus contrasté, ou mieux placé." if main.get("detecte")
                   else f"Le bouton « {main['text']} » attire peu le regard. Plus gros, plus contrasté, ou mieux placé.")
        else:
            tip = None
        checks.append(("Bouton principal visible", s, 2.5, tip))
    elif first:
        checks.append(("Bouton principal visible", 0.2, 2.5, "Aucun bouton d'action clair au premier écran. Ajoute un bouton coloré (ex. « Commencer »)."))

    density = cv2.Canny(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), 80, 200).mean() / 255
    s = float(np.clip(1 - (density - 0.04) / 0.10, 0, 1))
    checks.append(("Clarté / pas de surcharge", s, 1.5,
                   "Écran chargé : trop d'éléments en même temps. Ajoute de l'espace vide, retire du superflu." if s < 0.6 else None))

    words = sum(t["words"] for t in texts)
    if words > 120:
        s = float(np.clip(1 - (words - 120) / 280, 0, 1))
    elif words < 5:
        s = 0.5 if first else 1.0
    else:
        s = 1.0
    tip = None
    if words > 200:
        tip = f"{words} mots {where} : trop dense. Découpe en blocs courts avec des intertitres."
    elif words < 5 and first:
        tip = "Presque aucun texte au premier écran : le visiteur ne sait pas ce que tu proposes."
    checks.append(("Quantité de texte", s, 1.0, tip))

    if len(texts) >= 3:
        sizes = sorted((t["size"] for t in texts), reverse=True)
        s = float(np.clip((sizes[0] / float(np.median(sizes)) - 1.3) / 1.2, 0, 1))
        checks.append(("Hiérarchie visuelle", s, 1.5,
                       f"Pas de titre qui domine {where} : rends le titre nettement plus gros (2× le texte normal)." if s < 0.5 else None))

    total = sum(c[2] for c in checks)
    score = rnd(100 * sum(c[1] * c[2] for c in checks) / total)
    return score, [{"nom": n, "score": rnd(s * 100), "conseil": t} for n, s, _, t in checks]


def global_score(scores):
    """Le premier écran compte pour moitié : tout le monde le voit, peu descendent jusqu'en bas."""
    rest = scores[1:]
    return rnd(0.5 * scores[0] + 0.5 * float(np.mean(rest))) if rest else scores[0]
