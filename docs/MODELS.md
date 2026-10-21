# The AI models · Les modèles d'IA

**All the AI models are in the [`models/`](../models) folder**, next to this documentation. They are included when you clone the repository or download the ZIP: nothing else to download. [`models/MODELS.json`](../models/MODELS.json) lists every file with its size and SHA-256, and `python -m mona doctor` checks them.

**Tous les modèles d'IA sont dans le dossier [`models/`](../models)**. Ils sont fournis avec le dépôt (clone ou ZIP) : rien d'autre à télécharger. `python -m mona doctor` vérifie les fichiers.

## Files

| File | Role | Input | Output | Size |
|---|---|---|---|---|
| `gaze_a.onnx` | Gaze, model A: where eyes land | image 256 × 320 | log-probability map | 6.5 MB |
| `gaze_b.onnx` | Gaze, model B, finer | image 384 × 480 | log-probability map | 7.9 MB |
| `brain.onnx` | Brain: response of 20 visual areas | image 224 × 224 | 20 values | 6.0 MB |
| `brain_reference.json` | Percentile reference for the brain model (~500 web pages) | | | 0.2 MB |
| `detector.onnx` | Detects text, button, image, field, icon | screen 1440 × 900 | boxes, labels, scores | 38.2 MB |
| `plan_b_params.json` | Settings that turn detections into "page code" for an image | | | < 1 KB |

Images are RGB, normalized with the ImageNet mean and standard deviation (the detector takes values between 0 and 1). Weights are stored in fp16; computation runs in fp32.

## What they were trained on

| Model | Trained on | Starting point |
|---|---|---|
| Gaze A and B | [UEyes](https://github.com/YueJiang-nj/UEyes-CHI2023) eye-tracking, 62 people, 1,980 interfaces (CC BY 4.0) | MobileNetV3-Large, ImageNet |
| Brain | THINGS-fMRI, subject 1 (8,740 images seen) | MobileNetV3-Large, ImageNet |
| Detector | Screenshots of public websites, labeled automatically from their code | Faster R-CNN MobileNetV3, COCO |

How well they work (measured on cases never seen during training): gaze correlation 0.68 with real eye-tracking, element detector F1 0.64, score from an image alone within 5.5 points out of 100 of the score from the page code. Details: <https://mona.devliam.com/benchmarks.html>.

## Licenses

The models follow the [Mona Personal Use License](../LICENSE). Their training data and starting weights have their own terms, listed in [NOTICE.md](../NOTICE.md). In short: attribution to UEyes is required, and the **brain model is for non-commercial research use only**.

## Running on your PC

`mona/ai/runtime.py` opens each file with onnxruntime. `mona/hardware.py` first reads your CPU, memory and graphics card, then sets the number of threads, whether the two gaze models run in parallel, and whether a GPU provider is used. Run `python -m mona doctor` to see what Mona chose for your machine.

## Replacing or updating a model

1. Replace the `.onnx` file in `models/` (same input and output names).
2. Run `python tools/make_models_json.py` to refresh sizes and SHA-256.
3. Run `python -m mona doctor`, then the tests: `python -m pytest`.
