# Architecture

Mona is a small Python application. Everything runs on your computer: the AI models, the capture of the page, and the interface.

```
┌────────────────────────── your computer ──────────────────────────┐
│                                                                    │
│   window (pywebview, or Chrome/Edge in app mode)                   │
│        │  mona/web/  — HTML, CSS, JS: shows progress and report    │
│        ▼                                                           │
│   mona/server.py  (FastAPI, 127.0.0.1 only)                        │
│        │                                                           │
│        ▼                                                           │
│   mona/pipeline.py ── one analysis at a time ──────────────┐       │
│        │                                                   │       │
│        ├─ mona/capture.py   Chrome de test (Playwright)    │       │
│        │     opens the address, scrolls to the bottom,     │       │
│        │     takes a screenshot + reads the page code      │       │
│        │                                                   │       │
│        ├─ mona/ai/          the AI models  ◄── models/ *.onnx      │
│        │     gaze, brain, detector, plan B                 │       │
│        │     run by onnxruntime, tuned by mona/hardware.py │       │
│        │                                                   │       │
│        └─ mona/rules.py     six readability rules → score ─┘       │
└────────────────────────────────────────────────────────────────────┘
```

## Where things are

| Path | What it is |
|---|---|
| **`models/`** | **The AI models** (`*.onnx`), their settings, and `MODELS.json` (size and SHA-256 of each file). See [MODELS.md](MODELS.md). |
| `mona/ai/` | Code that runs the models: `registry` (file check), `runtime` (onnxruntime sessions), `gaze`, `brain`, `detector`, `planb` |
| `mona/hardware.py` | Reads your PC (CPU, memory, GPU) and chooses threads, parallelism and the number of screens |
| `mona/capture.py` | The Chrome de test: loads the page, scrolls, captures |
| `mona/rules.py` | The six readability rules and the score out of 100 |
| `mona/pipeline.py` | Chains everything and reports progress as events |
| `mona/server.py` | Local API and static files, with protection against other web pages |
| `mona/desktop.py` | Starts the server and opens the application window |
| `mona/web/` | The interface (no build step, plain files) |
| `tests/` | Automatic tests |
| `tools/` | Maintenance scripts (for example, regenerate `models/MODELS.json`) |

## One analysis, step by step

1. **Open**: Chrome de test loads the address in a 1440 × 900 window. For an image, Mona cuts it into 900 px screens instead.
2. **Read**: for each screen, the page code gives texts, sizes, colors and buttons. For an image, the **detector** finds them and **plan B** rebuilds the same information.
3. **Gaze**: two models predict where eyes land; their maps are averaged.
4. **Brain**: one model estimates the response of 20 visual areas, as a percentile against ~500 web pages (indicative, not part of the score).
5. **Rules**: contrast, text size, main button visibility, clutter, amount of text, hierarchy → a score per screen. The first screen counts for half of the final score.
6. **Report**: the interface shows the report and keeps it in your browser's storage (IndexedDB).

## Adapting to your PC

`mona/hardware.py` reads the PC once, then picks a mode (you can force one in the interface):

| Mode | When | What changes |
|---|---|---|
| Économique | fewer than 4 threads or under 6 GB of memory | half of the cores, one model at a time, 6 screens at most |
| Équilibré | in between | up to 6 threads |
| Rapide | 8+ threads and 12+ GB | up to 12 threads, both gaze models in parallel |

Mona always leaves a quarter of the cores free so the PC stays usable. If onnxruntime exposes a graphics card (CUDA, DirectML, CoreML, ROCm), it is used in the two upper modes.

## Interface protocol

`POST /api/analyze` (`{"url": ...}`) and `POST /api/analyze-image` (raw image) answer with a stream, one JSON object per line:

```json
{"t": "etat", "etape": "ouverture", "marque": "cours", "texte": "Ouverture du Chrome de test"}
{"t": "step", "etape": "lecture|detecteur|regard|cerveau|regles|fin", "i": 0, "n": 3, "image": "data:…", "att": {…}, "score": 72}
{"t": "termine", "rapport": {…}}
{"t": "erreur", "message": "…"}
```

The report has the same format as on the website, so reports can be exported and imported between the two.

## Security

- The server listens on `127.0.0.1` only. Requests whose `Host` or `Origin` is not this application are refused, so another web page cannot drive your local Mona.
- The Chrome de test uses a clean profile each time (no cookies, no sign-in) and blocks downloads.
- Nothing is sent to the author. The only network traffic is the visit to the address you give.
