"""Regard : carte de l'endroit où l'œil se pose. Moyenne de deux modèles appris sur UEyes."""
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
MODELS = (("gaze_a", 256, 320), ("gaze_b", 384, 480))        # (modèle, hauteur d'entrée, largeur d'entrée)
MAP_W, MAP_H = 360, 225                                       # carte rendue : 1/4 d'un écran de 1440 x 900
SCALE = 0.25


def to_tensor(rgb, h, w):
    x = cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    return ((x - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


def _one(runtime, name, h, w, rgb):
    out = runtime.session(name).run(None, {"image": to_tensor(rgb, h, w)})[0][0, 0]
    p = cv2.resize(np.exp(out), (MAP_W, MAP_H), interpolation=cv2.INTER_LINEAR)
    return p / p.sum()


def attention_map(runtime, rgb):
    """rgb : écran 1440 x 900 (uint8, RGB). Retourne une carte float32 [225, 360] entre 0 et 1."""
    if runtime.plan["parallel_gaze"]:
        with ThreadPoolExecutor(2) as ex:
            maps = list(ex.map(lambda m: _one(runtime, m[0], m[1], m[2], rgb), MODELS))
    else:
        maps = [_one(runtime, n, h, w, rgb) for n, h, w in MODELS]
    acc = sum(maps) / len(maps)
    return ((acc - acc.min()) / (acc.max() - acc.min() + 1e-8)).astype(np.float32)
