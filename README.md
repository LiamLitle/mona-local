# Mona (local)

<p align="center"><img src="docs/banner.gif" alt="Mona: Laocoön statue drawn in ASCII with a scanning light" width="420"></p>

<p align="center"><img src="docs/demo.gif" alt="Mona analyzing a web page: ASCII animation, then the report" width="720"></p>

Paste a web address. Mona opens it in your own Chrome, scrolls it, predicts **where eyes land**, how **the brain reacts**, checks 6 readability rules and gives a **score out of 100**. Everything runs on your computer: the AI models (ONNX) run in your browser, nothing is sent anywhere except the visit to the site you analyze.

Français : [README.fr.md](README.fr.md) · Website and measurements: <https://liamlitle.github.io/mona/>

## Quick start

Needs Python 3.10+.

```bash
pip install -r requirements.txt
playwright install chromium
python server/app.py
```

Your browser opens on `http://127.0.0.1:8765`. Type an address, press **Analyze**. The first time, the models (about 60 MB) load, then they stay in cache.

Other ways in the same page: **Image tab** (screenshot, mockup, Figma export, no browser needed) and **"Analyze a site already open in another tab"** (the browser shares one tab with Mona; nothing else on your screen).

Settings (environment variables): `MONA_PORT` (default 8765), `MONA_MAX_SCREENS` (default 12), `MONA_NO_BROWSER=1`.

## What is inside

| Folder | Content |
|---|---|
| `web/` | The Mona interface and the models in `web/models/` (gaze ×2, brain, element detector) |
| `server/` | Small local server: opens addresses with Playwright, serves `web/`. Listens on `127.0.0.1` only and refuses requests coming from other web pages |
| `cli/` | `mona_cli.py`: command line on an image (heat map, brain profile, detected elements) |

```bash
pip install -r cli/requirements.txt
python cli/mona_cli.py screenshot.png
```

## How reliable is it?

Measured on cases never seen during training: gaze correlation 0.68 with real eye-tracking (UEyes) and 0.56 on web pages from another dataset; element detector F1 0.64; from an image alone, the score differs from the one computed with the page code by 5.5 points out of 100 on average. The brain model comes from a single subject: an indication, not a diagnosis. Mona measures readability and attention, not taste. Details: <https://liamlitle.github.io/mona/benchmarks.html>.

## License

**Mona Personal Use License** (see [LICENSE](LICENSE), with French translation): use it for yourself, for free. **No** redistribution, **no** selling, **no** use to make money (including client work and online services), **no** training other models with it, and a **visible credit** ("Mona by Liam Litle") whenever you show or publish something that uses it. It is *source-available*, not open source. For anything else, ask the author first. Training data and pretrained weights have their own terms: see [NOTICE.md](NOTICE.md).
