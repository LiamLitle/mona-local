"""Cerveau : réaction estimée de 20 zones visuelles du cortex, en percentile par rapport à ~500 pages web."""
import json
from functools import lru_cache

import numpy as np

from . import registry
from .gaze import to_tensor

GROUPS = {
    "Vision de base": ["V1", "V2", "V3", "V4"], "Mouvement": ["MT"], "Visages": ["FFA_visages", "OFA_visages"],
    "Corps": ["EBA_corps"], "Lieux / scènes": ["PPA_lieux", "RSC_lieux", "TOS_lieux"], "Objets": ["LOC_objets", "IT_objets"],
    "Social": ["STS_social"], "Attention": ["attention_FEF_IPS"],
}


@lru_cache(maxsize=1)
def _reference():
    return json.loads(registry.path("brain_reference.json").read_text(encoding="utf-8"))


def profile(runtime, rgb):
    ref = _reference()
    z = runtime.session("brain").run(None, {"image": to_tensor(rgb, 224, 224)})[0][0]
    pct = {r: float(np.searchsorted(ref["values"][j], z[j], side="left")) / len(ref["values"][j]) * 100 for j, r in enumerate(ref["rois"])}
    return {g: int(round(float(np.mean([pct[r] for r in zones])))) for g, zones in GROUPS.items()}


def notes(prof):
    out = []
    for g, p in prof.items():
        if p >= 80:
            out.append(f"{g} : réaction plus forte que {p} % des sites.")
        elif p <= 20:
            out.append(f"{g} : réaction plus faible que {100 - p} % des sites.")
    return out
