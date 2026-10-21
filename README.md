<p align="center"><img src="docs/banner.gif" alt="Mona: Michelangelo's David drawn in ASCII with a scanning light" width="420"></p>

<h1 align="center">Mona</h1>

<p align="center"><b>See your website the way a first-time visitor does.</b><br>
Mona predicts where eyes land on a web page, how the brain reacts, checks readability, and gives a score out of 100. Runs entirely on your computer.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: personal use, non-commercial" src="https://img.shields.io/badge/license-personal%20use%20only-d9b877"></a>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
  <img alt="Runs locally" src="https://img.shields.io/badge/runs-100%25%20local-9bc7a8">
  <img alt="ONNX models" src="https://img.shields.io/badge/models-ONNX-005CED?logo=onnx&logoColor=white">
</p>

<p align="center"><a href="README.fr.md">Français</a> · <a href="https://mona.devliam.com/">Website</a> · <a href="https://mona.devliam.com/benchmarks.html">Measurements</a> · <a href="TERMS.md">Terms</a> · <a href="PRIVACY.md">Privacy</a></p>

<p align="center"><img src="docs/demo.gif" alt="Mona analyzing a web page: ASCII animation, then the report" width="720"></p>

## What it does

- **Gaze prediction**: a heat map of where people look first, from two AI models trained on real eye-tracking data (62 people, 1,980 interfaces).
- **Brain reaction**: an estimate of how 20 visual areas of the cortex respond (indicative, trained on fMRI data).
- **Readability score**: six checks (text contrast, text size, main button visibility, visual hierarchy, amount of text, clutter) combined into a score out of 100, with advice for each screen.
- **UI element detector**: finds text, buttons, images, fields and icons on any screenshot, mockup or Figma export.
- **Three ways in**: paste an address (Mona opens it in a real Chrome and scrolls it), drop an image, or analyze a tab you already have open.
- **Private by design**: no account, no tracking, nothing leaves your computer except the visit to the site you analyze. Reports are saved in your browser only.

## Quick start

You need Python 3.10 or newer.

```bash
git clone https://github.com/LiamLitle/mona-local.git
cd mona-local
pip install -r requirements.txt
playwright install chromium
python server/app.py
```

No git? Use **Code, Download ZIP** at the top of the repository page instead. Your browser opens on `http://127.0.0.1:8765`: type an address, press **Analyze**. The first time, the models (about 60 MB) load; after that they stay in cache.

| Option | How |
|---|---|
| Another port | `MONA_PORT=9000 python server/app.py` |
| Fewer or more screens | `MONA_MAX_SCREENS=6` (default 12) |
| Do not open the browser automatically | `MONA_NO_BROWSER=1` |

### Command line

```bash
pip install -r cli/requirements.txt
python cli/mona_cli.py screenshot.png
```

Writes a heat map, the detected elements and the brain profile to `mona_out/`.

## What is inside

| Folder | Content |
|---|---|
| `web/` | The Mona interface and the models in `web/models/` (gaze ×2, brain, element detector) |
| `server/` | Small local server: opens addresses with Playwright and serves `web/`. Listens on `127.0.0.1` only and refuses requests coming from other web pages |
| `cli/` | `mona_cli.py`: command line on an image |
| `docs/` | Images used by this README |

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

**Does it work on a phone?** No. The models are heavy (about 60 MB) and phones cannot record another tab. Use a computer.

**Can I use it for client work or in my product?** Not without written permission from the author. See [LICENSE](LICENSE).

**Where do my reports go?** Nowhere: they stay in your browser's storage. You can export them as JSON or print them to PDF.

## License and legal

**Mona Personal Use License** ([LICENSE](LICENSE), with French translation): use it for yourself, for free. **No** redistribution, **no** selling, **no** use to make money (including client work and online services), **no** training other models with it, and a **visible credit** ("Mona by Liam Litle") whenever you show or publish something that uses it. It is *source-available*, not open source. For anything else, ask the author first.

- [Terms of use](TERMS.md) · [Privacy policy](PRIVACY.md) · [Third-party data and licenses](NOTICE.md)
- Training data and pretrained weights have their own terms; the brain model derives from research-only images and is for non-commercial research use.
- To cite Mona, use the "Cite this repository" button on GitHub ([CITATION.cff](CITATION.cff)).

<sub>Keywords: web page analysis, visual saliency, eye-tracking prediction, attention heat map, UX audit, readability score, WCAG contrast, Figma mockup analysis, UI element detection, ONNX, Playwright.</sub>
