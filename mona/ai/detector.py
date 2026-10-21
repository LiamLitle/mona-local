"""Détecteur d'éléments d'interface : texte, bouton, image, champ, icône (Faster R-CNN MobileNetV3)."""
import numpy as np

CLASSES = {1: "texte", 2: "bouton", 3: "image", 4: "champ", 5: "icône"}


def detect(runtime, rgb, score_min=0.3):
    """rgb : écran 1440 x 900 (uint8, RGB). Retourne [{cls, score, box: [x0, y0, x1, y1]}]."""
    x = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)
    boxes, labels, scores = runtime.session("detector").run(None, {"image": x})
    return [{"cls": CLASSES[int(l)], "score": float(s), "box": [float(v) for v in b]}
            for b, l, s in zip(boxes, labels, scores) if s >= score_min and int(l) in CLASSES]
