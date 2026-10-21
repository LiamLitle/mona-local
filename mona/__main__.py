"""Commandes de Mona.

    python -m mona                      ouvre l'application
    python -m mona analyze ADRESSE      analyse une adresse ou une image, sans interface
    python -m mona doctor               décrit ton PC, les réglages choisis et l'état des modèles
    python -m mona setup                installe le Chrome de test (une seule fois)
    python -m mona serve                serveur seul, sans fenêtre
"""
import argparse
import asyncio
import base64
import json
import subprocess
import sys
from pathlib import Path


def cmd_doctor(_):
    from . import config, hardware
    from .ai import registry
    p = hardware.profile()
    s = config.load_settings()
    pl = hardware.plan(p, s["mode"])
    print(f"Système      : {p['os']} (Python {p['python']})")
    print(f"Processeur   : {p['cpu']} ({p['cores_physical']} cœurs, {p['cores_logical']} threads)")
    print(f"Mémoire      : {p['ram_gb']} Go (dont {p['ram_free_gb']} Go libres)")
    print(f"Accélération : {p['gpu'] or 'processeur seul'}   [{', '.join(p['providers'])}]")
    print(f"Plan choisi  : mode {pl['mode']}, {pl['threads']} threads, {pl['max_screens']} écrans au plus, modèles de regard en parallèle : {'oui' if pl['parallel_gaze'] else 'non'}")
    for n in pl["notes"]:
        print(f"               - {n}")
    print("Modèles      :")
    bad = 0
    for f, etat, detail in registry.check(deep=True):
        print(f"  {'✓' if etat == 'ok' else '✗'} {f:22s} {etat:8s} {detail}")
        bad += etat != "ok"
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            pw.chromium.launch(headless=True).close()
        print("Chrome de test : ✓ installé")
    except Exception:
        print("Chrome de test : ✗ absent (lance « python -m mona setup »)")
        bad += 1
    return 1 if bad else 0


def cmd_setup(_):
    print("Installation du Chrome de test (environ 150 Mo, une seule fois)...")
    r = subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"])
    return r.returncode


async def _analyze(args):
    from .pipeline import Analyzer
    a = Analyzer({"show_browser": not args.hide} if args.hide else {})
    last = {"t": None}

    def emit(ev):
        if ev["t"] == "etat" and ev.get("texte") and ev["texte"] != last["t"]:
            last["t"] = ev["texte"]
            print(" ·", ev["texte"])
        elif ev["t"] == "step" and ev["etape"] == "fin":
            print(f" · écran {ev['i'] + 1}/{ev['n']} : {ev['score']}/100")

    src = args.source
    try:
        if Path(src).is_file():
            rapport = await a.analyse_image(Path(src).read_bytes(), Path(src).name, emit)
        else:
            rapport = await a.analyse_url(src, emit)
    finally:
        await a.close()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for s in rapport["screens"]:
        (out / f"ecran_{s['n']}.jpg").write_bytes(base64.b64decode(s["image"].split(",", 1)[1]))
    light = {**rapport, "screens": [{k: v for k, v in s.items() if k not in ("image", "att")} for s in rapport["screens"]]}
    (out / "rapport.json").write_text(json.dumps(light, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nNote : {rapport['score']}/100 sur {len(rapport['screens'])} écran(s), calculée en {rapport['calcul']['secondes']} s ({rapport['calcul']['mode']})")
    tips = [(c["conseil"]) for s in rapport["screens"] for c in s["checks"] if c["conseil"]] + rapport["tips"]
    for t in dict.fromkeys(tips):
        print(" -", t)
    print(f"Résultats dans {out.resolve()}")


def main():
    ap = argparse.ArgumentParser(prog="python -m mona", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("doctor", help="décrit ton PC et l'état de Mona").set_defaults(fn=cmd_doctor)
    sub.add_parser("setup", help="installe le Chrome de test").set_defaults(fn=cmd_setup)
    an = sub.add_parser("analyze", help="analyse une adresse ou une image")
    an.add_argument("source", help="adresse d'un site, ou chemin d'une image")
    an.add_argument("--out", default="mona_out", help="dossier des résultats (défaut : mona_out)")
    an.add_argument("--hide", action="store_true", help="ne pas montrer le Chrome de test")
    an.set_defaults(fn=lambda a: asyncio.run(_analyze(a)))
    sv = sub.add_parser("serve", help="serveur seul, sans fenêtre")
    sv.set_defaults(fn=lambda a: __import__("mona.desktop", fromlist=["run"]).run(serve_only=True))
    ap.set_defaults(fn=lambda a: __import__("mona.desktop", fromlist=["run"]).run())
    args = ap.parse_args()
    sys.exit(args.fn(args) or 0)


if __name__ == "__main__":
    main()
