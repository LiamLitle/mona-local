"""Chaîne d'analyse : capture (adresse) ou découpe (image), puis regard, cerveau, règles et note.

Chaque étape envoie un événement à l'interface par la fonction `emit` (dictionnaire JSON), ce qui
permet d'afficher la progression et l'animation en temps réel.
"""
import asyncio
import base64
import io
import time

import cv2
import numpy as np
from PIL import Image

from . import config, hardware, rules
from .ai import brain, detector, gaze, planb
from .ai.runtime import Runtime
from .capture import CaptureError, Chrome, normalise_url

W, H, MAX_IMAGE_SCREENS = config.VIEW["width"], config.VIEW["height"], 6


def data_url(jpeg):
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()


def jpeg_of(rgb, quality=82):
    b = io.BytesIO()
    Image.fromarray(rgb).save(b, "JPEG", quality=quality)
    return b.getvalue()


def split_image(data):
    """Image envoyée -> écrans de 1440 x 900 (comme pour une page). Retourne (écrans [{y, rgb}], tronqué, total, hauteur)."""
    try:
        im = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise CaptureError("Impossible de lire cette image (PNG, JPG ou WebP).") from e
    h = max(1, round(im.height * W / im.width))
    big = np.asarray(im.resize((W, h), Image.LANCZOS))
    if h < H:                                                      # image plus courte qu'un écran : on prolonge avec la couleur du bas
        big = np.vstack([big, np.repeat(big[-1:], H - h, axis=0)])
    tops = [0] if h <= H else list(range(0, h - H + 1, H))
    if h > H and tops[-1] + H < h:
        tops.append(h - H)
    lot = tops[:MAX_IMAGE_SCREENS]
    return [{"y": y, "rgb": np.ascontiguousarray(big[y:y + H])} for y in lot], len(tops) > len(lot), len(tops), h


class Analyzer:
    """Une analyse à la fois sur ce PC. Garde les modèles chargés et le Chrome de test ouvert entre deux analyses."""

    def __init__(self, overrides=None):
        self.overrides = overrides or {}
        self.lock = asyncio.Lock()
        self.chrome = Chrome()
        self.hw = hardware.profile()
        self.runtime = None
        self.plan = None
        self.refresh()

    def refresh(self):
        """Relit les réglages et recalcule le plan d'après le PC."""
        self.settings = {**config.load_settings(), **self.overrides}
        plan = hardware.plan(self.hw, self.settings["mode"])
        plan["max_screens"] = min(plan["max_screens"], self.settings["max_screens"])
        if self.plan is None or {k: self.plan[k] for k in ("mode", "threads", "parallel_gaze", "providers")} != {k: plan[k] for k in ("mode", "threads", "parallel_gaze", "providers")}:
            self.runtime = Runtime(plan)               # nouveaux réglages : les sessions sont recréées à la demande
        self.plan = plan
        self.runtime.plan = plan

    async def close(self):
        await self.chrome.close()

    # ------------------------------------------------------------ un écran
    def _screen(self, rgb, dom, first, i, n, emit, jpeg=None, use_detector=False):
        rt = self.runtime
        emit({"t": "step", "etape": "lecture", "i": i, "n": n, "image": data_url(jpeg or jpeg_of(rgb))})
        if use_detector:
            emit({"t": "step", "etape": "detecteur", "i": i, "n": n})
            dom = planb.dom_from_detections(rgb, detector.detect(rt, rgb))
        emit({"t": "step", "etape": "regard", "i": i, "n": n})
        att = gaze.attention_map(rt, rgb)
        att8 = np.round(att * 255).astype(np.uint8)
        emit({"t": "step", "etape": "cerveau", "i": i, "n": n,
              "att": {"w": gaze.MAP_W, "h": gaze.MAP_H, "k": gaze.SCALE, "data": base64.b64encode(att8.tobytes()).decode()}})
        prof = brain.profile(rt, rgb)
        emit({"t": "step", "etape": "regles", "i": i, "n": n})
        score, checks = rules.check_screen(rgb, dom, att, first)
        emit({"t": "step", "etape": "fin", "i": i, "n": n, "score": score})
        return {"score": score, "checks": checks, "brain": prof, "brainNotes": brain.notes(prof),
                "att": {"w": gaze.MAP_W, "h": gaze.MAP_H, "k": gaze.SCALE, "data": base64.b64encode(att8.tobytes()).decode()}}

    def _warm(self, names, emit):
        emit({"t": "etat", "etape": "modeles", "marque": "cours", "texte": f"Chargement des modèles sur ton PC (mode {self.plan['mode']}, {self.plan['threads']} cœurs)"})
        self.runtime.warm_up(names)
        emit({"t": "etat", "etape": "modeles", "marque": "fait", "texte": "Modèles prêts"})

    def _report_meta(self, t0):
        return {"calcul": {"secondes": round(time.time() - t0, 1), "mode": self.plan["mode"], "coeurs": self.plan["threads"]}}

    # ------------------------------------------------------------ une adresse
    async def analyse_url(self, brut, emit):
        url = normalise_url(brut)
        self.refresh()
        loop = asyncio.get_running_loop()
        t0 = time.time()
        async with self.lock:
            emit({"t": "etat", "etape": "ouverture", "marque": "cours", "texte": "Ouverture du Chrome de test"})
            warm = loop.run_in_executor(None, self._warm, ["gaze_a", "gaze_b", "brain"], emit)
            visible = self.settings["show_browser"]

            def status(txt):
                emit({"t": "etat", "texte": txt})

            def screen(s):
                emit({"t": "etat", "texte": f"Capture : écran {s['n']}"})

            cap = await self.chrome.capture(url, self.plan["max_screens"], visible, status, screen)
            await warm
            emit({"t": "etat", "etape": "ouverture", "marque": "fait", "texte": f"{len(cap['screens'])} écran(s) capturé(s)"})
            n = len(cap["screens"])
            screens = []
            for i, s in enumerate(cap["screens"]):
                r = await loop.run_in_executor(None, self._screen, s["rgb"], s["dom"], i == 0, i, n, emit, s["jpeg"])
                screens.append({"n": s["n"], "y": s["y"], "image": data_url(s["jpeg"]), **r})
            tips = [] if cap["complete"] else ["Page très longue : seuls les premiers écrans ont été analysés."]
            return {"url": cap["url"], "final_url": cap["final_url"], "title": cap["title"], "page_height": cap["page_height"],
                    "score": rules.global_score([s["score"] for s in screens]), "screens": screens, "tips": tips,
                    "date": int(time.time() * 1000), "seconds_capture": cap["seconds"], **self._report_meta(t0)}

    # ------------------------------------------------------------ une image
    async def analyse_image(self, data, name, emit):
        self.refresh()
        loop = asyncio.get_running_loop()
        t0 = time.time()
        async with self.lock:
            emit({"t": "etat", "etape": "lecture", "marque": "cours", "texte": "Lecture de l'image"})
            ecrans, tronque, total, hauteur = split_image(data)
            await loop.run_in_executor(None, self._warm, ["detector", "gaze_a", "gaze_b", "brain"], emit)
            n = len(ecrans)
            screens = []
            for i, e in enumerate(ecrans):
                jpg = jpeg_of(e["rgb"])
                r = await loop.run_in_executor(None, self._screen, e["rgb"], None, i == 0, i, n, emit, jpg, True)
                screens.append({"n": i + 1, "y": e["y"], "image": data_url(jpg), **r})
            tips = ["Note indicative : Mona a lu l’interface depuis une image, sans le code de la page. L’écart moyen avec la lecture du code est d’environ 5,5 points sur 100."]
            if tronque:
                tips.append(f"Image très longue : seuls les {n} premiers écrans sur {total} ont été analysés.")
            return {"url": name, "final_url": None, "title": name, "mode": "image", "page_height": hauteur,
                    "score": rules.global_score([s["score"] for s in screens]), "screens": screens, "tips": tips,
                    "date": int(time.time() * 1000), **self._report_meta(t0)}
