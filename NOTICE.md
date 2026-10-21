# Licences et provenance

## Code et logiciel
Mona Personal Use License, voir `LICENSE` (usage personnel non commercial, pas de redistribution, crédit obligatoire).

## Poids des modèles

| Modèle | Entraîné sur | Conditions |
|---|---|---|
| `gaze_a`, `gaze_b` | UEyes (Jiang et al., CHI 2023), CC BY 4.0 | **Citer** : Jiang, Y. et al., « UEyes: Understanding Visual Saliency across User Interface Types », CHI 2023. Point de départ : MobileNetV3-Large préentraîné sur ImageNet (torchvision). |
| `detector` | Captures de sites web publics étiquetées automatiquement depuis leur code (HTML/CSS). Point de départ : Faster R-CNN MobileNetV3 préentraîné sur COCO (torchvision). | Les captures ne sont pas redistribuées. Seuls les poids le sont. |
| `brain`, `brain_reference.json` | Réponses THINGS-fMRI, sujet 1 (Hebart et al., 2023) et images THINGS, dont les images sont décrites comme réservées à un usage académique. | **Usage de recherche, non commercial.** |

Les évaluations utilisent aussi Imp1k (Fosco et al., UIST 2020) comme test externe uniquement : aucun poids n'a été entraîné dessus.

## Points non tranchés
- Les poids ImageNet de départ (regard, cerveau) et leurs conditions d'usage : à vérifier avant tout usage commercial.
- Le modèle cerveau dérive d'images THINGS à usage académique : tant que ce point n'est pas éclairci, ne le réutilise pas dans un produit commercial.
- Le regard et le détecteur n'ont pas de restriction connue au-delà de l'attribution UEyes, mais la question de l'usage commercial des poids ImageNet/COCO de départ reste à vérifier.

---

# Licenses and provenance (English summary)

- **Software:** Mona Personal Use License (see `LICENSE`): personal non-commercial use, no redistribution, credit required.
- **Gaze models (`gaze_a`, `gaze_b`):** trained on UEyes (Jiang et al., CHI 2023, CC BY 4.0): cite *UEyes: Understanding Visual Saliency across User Interface Types*, CHI 2023. Starting point: MobileNetV3-Large pretrained on ImageNet (torchvision).
- **Detector:** screenshots of public websites auto-labeled from their HTML/CSS (not redistributed). Starting point: Faster R-CNN MobileNetV3 pretrained on COCO (torchvision).
- **Brain model:** THINGS-fMRI responses (subject 1, Hebart et al., 2023) and THINGS images, which are described as academic-use only: research, non-commercial use only.
- **Imp1k** (Fosco et al., UIST 2020) was used only to test; no weights were trained on it.
- **Open questions:** commercial-use terms of the ImageNet and COCO starting weights, and of THINGS-derived weights, were not verified. The non-commercial license above is consistent with these doubts.
