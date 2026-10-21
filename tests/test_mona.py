"""Tests de Mona : règles, modèles, plan du PC, chaîne d'analyse sur une image (sans navigateur)."""
import asyncio
import io
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mona import hardware, rules  # noqa: E402
from mona.ai import registry  # noqa: E402


def test_contraste_wcag():
    assert rules.contrast((0, 0, 0), (255, 255, 255)) == pytest.approx(21, rel=0.01)
    assert rules.contrast((119, 119, 119), (255, 255, 255)) == pytest.approx(4.48, rel=0.02)


def test_note_globale_premier_ecran_pour_moitie():
    assert rules.global_score([80]) == 80
    assert rules.global_score([80, 40, 60]) == 65          # 0,5 x 80 + 0,5 x moyenne(40, 60)


def test_regles_page_vide_demande_un_bouton():
    img = np.full((900, 1440, 3), 255, np.uint8)
    score, checks = rules.check_screen(img, {"texts": [], "ctas": []}, np.zeros((225, 360), np.float32), first=True)
    noms = {c["nom"]: c for c in checks}
    assert noms["Bouton principal visible"]["score"] == 20
    assert "Aucun bouton" in noms["Bouton principal visible"]["conseil"]
    assert 0 <= score <= 100


def test_plan_s_adapte_au_pc():
    faible = {"cores_logical": 2, "cores_physical": 2, "ram_gb": 4, "ram_free_gb": 2, "gpu": None}
    fort = {"cores_logical": 16, "cores_physical": 8, "ram_gb": 32, "ram_free_gb": 20, "gpu": None}
    pf, pg = hardware.plan(faible), hardware.plan(fort)
    assert pf["mode"] == "eco" and pf["max_screens"] == 6 and not pf["parallel_gaze"]
    assert pg["mode"] == "turbo" and pg["parallel_gaze"] and pg["threads"] <= 12
    assert pg["threads"] > pf["threads"]
    assert hardware.plan(fort, "eco")["mode"] == "eco"      # mode forcé


def test_modeles_presents_et_intacts():
    for fichier, etat, detail in registry.check(deep=True):
        assert etat == "ok", f"{fichier} : {detail}"


def _image_de_test():
    im = Image.new("RGB", (1440, 900), (250, 250, 250))
    d = ImageDraw.Draw(im)
    d.text((80, 120), "Titre de la page", fill=(20, 20, 20))
    d.rectangle((80, 300, 360, 370), fill=(30, 90, 220))
    d.text((150, 328), "Commencer", fill=(255, 255, 255))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def test_analyse_d_une_image_de_bout_en_bout():
    from mona.pipeline import Analyzer
    evenements = []
    rapport = asyncio.run(Analyzer({"show_browser": False}).analyse_image(_image_de_test(), "test.png", evenements.append))
    assert rapport["mode"] == "image" and len(rapport["screens"]) == 1
    assert 0 <= rapport["score"] <= 100
    ecran = rapport["screens"][0]
    assert ecran["att"]["w"] == 360 and ecran["att"]["h"] == 225 and set(ecran["brain"]) >= {"Visages", "Attention"}
    etapes = [e["etape"] for e in evenements if e["t"] == "step"]
    assert etapes == ["lecture", "detecteur", "regard", "cerveau", "regles", "fin"]
