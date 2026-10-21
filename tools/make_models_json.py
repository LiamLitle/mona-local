"""Écrit models/MODELS.json (taille et empreinte SHA-256 de chaque fichier). À relancer si un modèle change."""
import hashlib
import json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "models"
INFO = {
    "gaze_a.onnx": dict(role="Regard (modèle A)", task="Prédit où l'œil se pose : carte de probabilité de regard.",
                        input="image [1,3,256,320] RGB normalisé ImageNet", output="log_prob [1,1,256,320]",
                        trained_on="UEyes (CC BY 4.0)", base="MobileNetV3-Large (ImageNet)", license="Personal Use, voir LICENSE et NOTICE.md"),
    "gaze_b.onnx": dict(role="Regard (modèle B)", task="Deuxième modèle de regard, plus fin ; la carte finale est la moyenne de A et B.",
                        input="image [1,3,384,480] RGB normalisé ImageNet", output="log_prob [1,1,384,480]",
                        trained_on="UEyes (CC BY 4.0)", base="MobileNetV3-Large (ImageNet)", license="Personal Use, voir LICENSE et NOTICE.md"),
    "brain.onnx": dict(role="Cerveau", task="Estime la réponse de 20 zones visuelles du cortex (indicatif, un seul sujet).",
                       input="image [1,3,224,224] RGB normalisé ImageNet", output="zones [1,20]",
                       trained_on="THINGS-fMRI sujet 1 + images THINGS (recherche non commerciale)", base="MobileNetV3-Large (ImageNet)",
                       license="Recherche non commerciale uniquement, voir NOTICE.md"),
    "brain_reference.json": dict(role="Référence du cerveau", task="Valeurs de référence (~500 pages web) pour convertir la réponse en percentile.",
                                 input="-", output="-", trained_on="Pages web de référence", base="-", license="Voir NOTICE.md"),
    "detector.onnx": dict(role="Détecteur d'éléments", task="Repère texte, bouton, image, champ et icône sur une capture d'écran.",
                          input="image [3,H,W] RGB entre 0 et 1 (écran de 1440 x 900)", output="boxes [n,4], labels [n], scores [n]",
                          trained_on="Captures de sites publics étiquetées depuis leur code", base="Faster R-CNN MobileNetV3 (COCO)",
                          license="Personal Use, voir LICENSE et NOTICE.md"),
    "plan_b_params.json": dict(role="Réglages du « plan B »", task="Paramètres calibrés pour lire une image comme si c'était le code d'une page.",
                               input="-", output="-", trained_on="Calibré sur des sites jamais vus", base="-", license="Personal Use"),
}
out = {"version": 1, "files": []}
for f in sorted(D.iterdir()):
    if f.name in INFO:
        b = f.read_bytes()
        out["files"].append({"file": f.name, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest(), **INFO[f.name]})
(D / "MODELS.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(len(out["files"]), "fichiers décrits")
