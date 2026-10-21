"""Mona en ligne de commande : regard prédit, réaction du cerveau prédite, éléments d'interface repérés.

    python cli/mona_cli.py capture.png            # écrit les résultats dans ./mona_out/
    python cli/mona_cli.py capture.png --out dossier

Dépendances : pip install onnxruntime numpy pillow
Les modèles sont les mêmes que sur le site (dossier web/models/).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

MODELS = Path(__file__).parent.parent / "web" / "models"
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)
GAZE = [("gaze_a.onnx", 256, 320), ("gaze_b.onnx", 384, 480)]      # (fichier, hauteur, largeur)
GROUPS = {
    "Vision de base": ["V1", "V2", "V3", "V4"], "Mouvement": ["MT"], "Visages": ["FFA_visages", "OFA_visages"],
    "Corps": ["EBA_corps"], "Lieux / scènes": ["PPA_lieux", "RSC_lieux", "TOS_lieux"],
    "Objets": ["LOC_objets", "IT_objets"], "Social": ["STS_social"], "Attention": ["attention_FEF_IPS"],
}
CLASSES = {1: "texte", 2: "bouton", 3: "image", 4: "champ", 5: "icône"}
W, H, MAX_SCREENS = 1440, 900, 6                                  # le détecteur lit des écrans de 1440 x 900


def session(name):
    return ort.InferenceSession(str(MODELS / name), providers=["CPUExecutionProvider"])


def tensor(img, h, w):
    x = np.asarray(img.convert("RGB").resize((w, h), Image.BOX), np.float32) / 255
    return ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


def gaze_map(img):
    """Carte d'attention 0..1 à la taille de l'image : moyenne de deux modèles."""
    acc = 0
    for name, h, w in GAZE:
        m = np.exp(session(name).run(None, {"image": tensor(img, h, w)})[0][0, 0])
        m = np.asarray(Image.fromarray(m).resize(img.size, Image.BILINEAR))
        acc = acc + m / m.sum()
    acc = acc / len(GAZE)
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-8)


def brain_profile(img):
    """Réaction prédite par groupe de zones, en percentile par rapport à ~500 pages web (0..100)."""
    ref = json.loads((MODELS / "brain_reference.json").read_text())
    z = session("brain.onnx").run(None, {"image": tensor(img, 224, 224)})[0][0]
    pct = {r: float(np.searchsorted(ref["values"][j], z[j]) / len(ref["values"][j]) * 100) for j, r in enumerate(ref["rois"])}
    return {g: round(float(np.mean([pct[r] for r in zs]))) for g, zs in GROUPS.items()}


def screens(img):
    """Image -> écrans de 1440 x 900 (comme sur le site)."""
    h = max(1, round(img.height * W / img.width))
    big = Image.new("RGB", (W, max(h, H)), "white")
    big.paste(img.convert("RGB").resize((W, h), Image.LANCZOS))
    tops = [0] if h <= H else sorted({*range(0, h - H + 1, H), h - H})
    return [big.crop((0, y, W, y + H)) for y in tops[:MAX_SCREENS]]


def detect(img, min_score=0.3):
    """Éléments d'interface : [{classe, score, boite [x0, y0, x1, y1]}] par écran de 1440 x 900."""
    s, out = session("detector.onnx"), []
    for i, e in enumerate(screens(img)):
        x = (np.asarray(e, np.float32) / 255).transpose(2, 0, 1)
        boxes, labels, scores = s.run(None, {"image": x})
        out.append([{"classe": CLASSES[int(l)], "score": round(float(sc), 3), "boite": [round(float(v), 1) for v in b]}
                    for b, l, sc in zip(boxes, labels, scores) if sc >= min_score])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("--out", default="mona_out")
    a = ap.parse_args()
    img, out = Image.open(a.image).convert("RGB"), Path(a.out)
    out.mkdir(exist_ok=True)

    m = gaze_map(img)
    heat = np.zeros((*m.shape, 4), np.uint8)
    heat[..., 0], heat[..., 1], heat[..., 3] = 255, (255 * (1 - m)).astype(np.uint8), (180 * m).astype(np.uint8)
    Image.alpha_composite(img.convert("RGBA"), Image.fromarray(heat)).convert("RGB").save(out / "regard.png")

    profile, dets = brain_profile(img), detect(img)
    for i, (e, ds) in enumerate(zip(screens(img), dets), 1):
        d = ImageDraw.Draw(e)
        for x in ds:
            d.rectangle(x["boite"], outline="#d9b877", width=2)
        e.save(out / f"elements_ecran{i}.png")
    (out / "resultats.json").write_text(json.dumps({"cerveau_percentile": profile, "elements": dets}, ensure_ascii=False, indent=1), "utf-8")
    print("Réaction du cerveau (percentile vs ~500 pages web) :", json.dumps(profile, ensure_ascii=False))
    print("Éléments repérés par écran :", [len(x) for x in dets], "-> résultats dans", out.resolve())


if __name__ == "__main__":
    main()
