<p align="center"><img src="docs/banner.gif" alt="Mona: Michelangelo's David drawn in ASCII with a scanning light" width="420"></p>

<h1 align="center">Mona</h1>

<p align="center"><b>See your website the way a first-time visitor does.</b><br>
Mona predicts where eyes land on a web page, how the brain reacts, checks readability, and gives a score out of 100.<br>
A small desktop app: the AI models run on your PC, nothing is sent anywhere.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: personal use, non-commercial" src="https://img.shields.io/badge/license-personal%20use%20only-d9b877"></a>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
  <img alt="Runs locally" src="https://img.shields.io/badge/AI-runs%20on%20your%20PC-9bc7a8">
  <img alt="ONNX models included" src="https://img.shields.io/badge/models-ONNX%20included-005CED?logo=onnx&logoColor=white">
</p>

<p align="center"><a href="README.fr.md">Français</a> · <a href="https://mona.devliam.com/">Website</a> · <a href="https://mona.devliam.com/benchmarks.html">Measurements</a> · <a href="docs/MODELS.md">AI models</a> · <a href="docs/ARCHITECTURE.md">Architecture</a> · <a href="TERMS.md">Terms</a> · <a href="PRIVACY.md">Privacy</a></p>

<p align="center"><img src="docs/demo.gif" alt="Mona analyzing a web page: ASCII animation, then the report" width="720"></p>

## What it does

- **Gaze prediction**: a heat map of where people look first, from two AI models trained on real eye-tracking data (62 people, 1,980 interfaces).
- **Brain reaction**: an estimate of how 20 visual areas of the cortex respond (indicative, trained on fMRI data).
- **Readability score**: six checks (text contrast, text size, main button visibility, visual hierarchy, amount of text, clutter) combined into a score out of 100, with advice for each screen.
- **UI element detector**: finds text, buttons, images, fields and icons on any screenshot, mockup or Figma export.
- **A real Chrome does the looking**: paste an address, and Mona opens a test Chrome, scrolls the page to the very bottom like a visitor, and reads it. Or drop an image.
- **Adapts to your PC**: Mona reads your processor, memory and graphics card first, then picks how hard to work (and leaves a quarter of your cores free).
- **Private by design**: no account, no tracking. The only network traffic is the visit to the site you analyze.

## Install and run

You need Python 3.10 or newer. [Download the ZIP](https://github.com/LiamLitle/mona-local/archive/refs/heads/main.zip) (the AI models are inside) or clone the repository, then:

| | |
|---|---|
| **Windows** | double-click **`Mona.bat`** |
| **macOS, Linux** | run **`./mona.sh`** |

The first time, it installs everything (a few minutes: Python packages and the test Chrome, about 150 MB). After that the app opens straight away, in its own window.

<details><summary>Or by hand</summary>

```bash
pip install -r requirements.txt
python -m mona setup      # installs the test Chrome, once
python -m mona            # opens the app
```

For a native window instead of a Chrome/Edge app window: `pip install -r requirements-app.txt`.
</details>

## Commands

```bash
python -m mona                      # open the app
python -m mona analyze https://example.com    # analyze without the interface
python -m mona analyze screenshot.png         # analyze an image
python -m mona doctor               # your PC, the settings Mona chose, the state of the models
python -m mona setup                # install the test Chrome
python -m mona serve                # server only, no window
python -m pytest                    # run the tests
```

Environment variables: `MONA_PORT`, `MONA_MAX_SCREENS` (default 12), `MONA_HEADLESS=1` (hide the test Chrome), `MONA_HOME` (where settings are stored).

## Where is everything?

```
mona-local/
├── models/        ← THE AI MODELS (*.onnx) + MODELS.json  → docs/MODELS.md
├── mona/
│   ├── ai/        run the models: gaze, brain, detector, plan B
│   ├── capture.py the test Chrome: open, scroll, capture
│   ├── rules.py   six readability rules and the score
│   ├── pipeline.py, server.py, desktop.py, hardware.py
│   └── web/       the interface
├── docs/          ARCHITECTURE.md, MODELS.md
├── tests/         automatic tests
├── Mona.bat · mona.sh   one-click launchers
└── LICENSE, TERMS.md, PRIVACY.md, NOTICE.md
```

- **The AI models** are in [`models/`](models) and ship with the repository. [`docs/MODELS.md`](docs/MODELS.md) explains each one: role, input and output, training data, licenses.
- **How the parts fit together**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How reliable is it?

Measured on cases never seen during training:

| What | Result |
|---|---|
| Gaze vs. real eye-tracking (UEyes) | correlation 0.68 |
| Gaze on web pages from another dataset (Imp1k) | correlation 0.56 |
| Element detector (text, button, image) | F1 0.64 |
| Score from an image alone vs. from the page code | 5.5 points out of 100 apart on average |

The brain model comes from a single subject: an indication, not a diagnosis. Mona measures readability and attention, **not taste**, and it does not replace a test with real people or an accessibility audit. Details and method: <https://mona.devliam.com/benchmarks.html>.

## FAQ

**Is it free?** Yes, for personal, non-commercial use. See the license below.

**Does it work on a phone?** No, it is a desktop app (Windows, macOS, Linux).

**Is it fast?** On a recent PC, an image takes a few seconds and a page about ten seconds. `python -m mona doctor` shows what Mona chose for your machine.

**Can I use it for client work or in my product?** Not without written permission from the author. See [LICENSE](LICENSE).

**Where do my reports go?** Nowhere: they stay in the app's own storage on your PC. You can export them as JSON or print them to PDF.

## License and legal

**Mona Personal Use License** ([LICENSE](LICENSE), with French translation): use it for yourself, for free. **No** redistribution, **no** selling, **no** use to make money (including client work and online services), **no** training other models with it, and a **visible credit** ("Mona by Liam Litle") whenever you show or publish something that uses it. It is *source-available*, not open source. For anything else, ask the author first.

- [Terms of use](TERMS.md) · [Privacy policy](PRIVACY.md) · [Third-party data and licenses](NOTICE.md)
- Training data and pretrained weights have their own terms; the brain model derives from research-only images and is for non-commercial research use.
- To cite Mona, use the "Cite this repository" button on GitHub ([CITATION.cff](CITATION.cff)).

<sub>Keywords: web page analysis, visual saliency, eye-tracking prediction, attention heat map, UX audit, readability score, WCAG contrast, Figma mockup analysis, UI element detection, ONNX, Playwright, desktop app.</sub>
