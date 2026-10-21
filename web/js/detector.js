// Detecteur d'elements UI (Faster R-CNN MobileNetV3, ONNX) dans le navigateur. Partage par la page du detecteur et l'analyse d'images.
import { W, H } from './ecrans.js';

const MODELE = 'models/detector.onnx?v=2';
let ort = null, session = null;

export async function chargerOrt(base) {
  if (ort) return ort;
  if (!window.ort) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = base + 'js/ort/ort.wasm.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  ort = window.ort;
  ort.env.wasm.wasmPaths = base + 'js/ort/';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  return ort;
}

// Telecharge le detecteur (environ 38 Mo) avec progression : onProgres(octetsRecus, octetsTotal)
export async function chargerDetecteur(base, onProgres = () => {}) {
  if (session) return session;
  await chargerOrt(base);
  const rep = await fetch(base + MODELE);
  if (!rep.ok) throw new Error('Le détecteur n’a pas pu être téléchargé (' + rep.status + ').');
  const total = +rep.headers.get('content-length') || 38.2e6, lecteur = rep.body.getReader(), morceaux = [];
  let recu = 0;
  for (;;) {
    const {done, value} = await lecteur.read();
    if (done) break;
    morceaux.push(value); recu += value.length; onProgres(recu, total);
  }
  const buf = new Uint8Array(recu); let o = 0;
  for (const m of morceaux) { buf.set(m, o); o += m.length; }
  await new Promise(r => setTimeout(r, 30));
  session = await ort.InferenceSession.create(buf, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});
  return session;
}

// ImageData 1440 x 900 -> [{cls (1 texte, 2 bouton, 3 image, 4 champ, 5 icone), score, box: [x0, y0, x1, y1]}]
export async function detecterEcran(imageData) {
  const d = imageData.data, n = W * H, f = new Float32Array(3 * n);
  for (let i = 0, p = 0; i < n; i++, p += 4) { f[i] = d[p] / 255; f[n + i] = d[p + 1] / 255; f[2 * n + i] = d[p + 2] / 255; }
  const r = await session.run({image: new ort.Tensor('float32', f, [3, H, W])});
  const b = r.boxes.data, out = [];
  for (let i = 0; i < r.scores.data.length; i++)
    out.push({cls: Number(r.labels.data[i]), score: r.scores.data[i], box: [b[4 * i], b[4 * i + 1], b[4 * i + 2], b[4 * i + 3]]});
  return out;
}
