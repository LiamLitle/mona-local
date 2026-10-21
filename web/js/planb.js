// « Plan B » : reconstruit ce que le code d'une page donnerait (textes, tailles, couleurs, boutons) depuis les detections d'une IMAGE.
// Portage de plan_b.py ; les reglages viennent de models/plan_b_params.json (calibres sur des sites jamais vus).
// Ecart de note moyen avec la lecture du code de la page : 5,5 points sur 100 (voir la page des mesures).

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lineSize = (h, P) => Math.max(6, Math.exp(P.size_a * Math.log(Math.max(h, 1)) + P.size_b) + P.size_shift);

function med(a) { const s = Float32Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }

// fond d'une boite : mediane des pixels du pourtour (RGB)
function bgColor(img, box, pad = 3) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  const X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad), X1 = Math.min(img.w, x1 + pad), Y1 = Math.min(img.h, y1 + pad);
  const R = [], G = [], B = [];
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const dedans = x >= X0 + pad && x < X1 - pad && y >= Y0 + pad && y < Y1 - pad;
    if (dedans) continue;
    const p = (y * img.w + x) * 4; R.push(img.data[p]); G.push(img.data[p + 1]); B.push(img.data[p + 2]);
  }
  if (R.length < 8) return [255, 255, 255];
  return [med(R), med(G), med(B)];
}

// (couleur du texte, fond, epaisseur du trait, part d'encre) : le fond = couleur dominante, le texte = pixels les plus eloignes du fond
function textColors(img, box, P) {
  let [x0, y0, x1, y1] = box.map(Math.round);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(img.w, x1); y1 = Math.min(img.h, y1);
  const w = x1 - x0, h = y1 - y0;
  if (w < 3 || h < 3) return {fg: [0, 0, 0], bg: [255, 255, 255], stroke: 0, ink: 0};
  const n = w * h, px = new Float32Array(n * 3), cnt = new Map();
  let k = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, k++) {
    const p = (y * img.w + x) * 4, r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
    px[3 * k] = r; px[3 * k + 1] = g; px[3 * k + 2] = b;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); cnt.set(key, (cnt.get(key) || 0) + 1);
  }
  let dom = 0, best = -1;
  for (const [key, c] of cnt) if (c > best) { best = c; dom = key; }
  let sr = 0, sg = 0, sb = 0, m = 0;
  for (let i = 0; i < n; i++) {
    const key = ((px[3 * i] >> 4) << 8) | ((px[3 * i + 1] >> 4) << 4) | (px[3 * i + 2] >> 4);
    if (key === dom) { sr += px[3 * i]; sg += px[3 * i + 1]; sb += px[3 * i + 2]; m++; }
  }
  const bg = [sr / m, sg / m, sb / m], d = new Float32Array(n);
  let dmax = 1e-6;
  for (let i = 0; i < n; i++) { d[i] = dist([px[3 * i], px[3 * i + 1], px[3 * i + 2]], bg); if (d[i] > dmax) dmax = d[i]; }
  const kk = Math.max(3, Math.floor(n * P.fg_pct)), idx = Array.from({length: n}, (_, i) => i).sort((a, b) => d[a] - d[b]).slice(n - kk);
  const fg = [0, 0, 0];
  for (const i of idx) { fg[0] += px[3 * i]; fg[1] += px[3 * i + 1]; fg[2] += px[3 * i + 2]; }
  fg[0] /= kk; fg[1] /= kk; fg[2] /= kk;
  let ink = 0, trait = 0, nt = 0;
  const far = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (d[i] > 0.5 * dmax) { far[i] = 1; ink++; }
  // epaisseur de trait : distance moyenne au bord (approchee par erosion horizontale / verticale)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (far[y * w + x]) {
    let a = 0; while (x - a - 1 >= 0 && far[y * w + x - a - 1] && a < 20) a++;
    let b = 0; while (x + b + 1 < w && far[y * w + x + b + 1] && b < 20) b++;
    let c = 0; while (y - c - 1 >= 0 && far[(y - c - 1) * w + x] && c < 20) c++;
    let e = 0; while (y + e + 1 < h && far[(y + e + 1) * w + x] && e < 20) e++;
    trait += Math.min(a + b + 1, c + e + 1) / 2; nt++;
  }
  return {fg, bg, stroke: nt ? (trait / nt) / Math.max(1, h) : 0, ink: ink / n};
}

// img : {data (RGBA), w, h} ; dets : [{cls, score, box}] ; P : reglages
export function domFromDets(img, dets, P) {
  const bonnes = dets.filter(d => d.score >= P.sc_min);
  const texts = [], ctas = [];
  for (const d of bonnes) {
    if (d.cls !== 1) continue;
    const b = d.box, h = b[3] - b[1], w = b[2] - b[0], {fg, bg, stroke, ink} = textColors(img, b, P);
    const size = lineSize(h, P), words = Math.max(1, Math.round(w / (size * P.words_per_em)));
    const [c0, c1, c2] = P.bold_coef, gras = 1 / (1 + Math.exp(-(c0 + c1 * stroke + c2 * ink))) >= P.bold_thr;
    texts.push({text: '(texte détecté)', detecte: true, words, size, weight: gras ? 700 : 400, color: fg, bg, fixed: false, box: [b[0], b[1], w, h]});
  }
  for (const d of bonnes) {
    if (d.cls !== 2) continue;
    const [x0, y0, x1, y1] = d.box, ring = bgColor(img, d.box, 6);
    const R = [], G = [], B = [];
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.h, Math.floor(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.w, Math.floor(x1)); x++) {
      const p = (y * img.w + x) * 4; R.push(img.data[p]); G.push(img.data[p + 1]); B.push(img.data[p + 2]);
    }
    const inner = R.length ? [med(R), med(G), med(B)] : ring, filled = dist(inner, ring) > P.fill_thr;
    ctas.push({text: '(bouton détecté)', detecte: true, fixed: false, box: [x0, y0, x1 - x0, y1 - y0], filled, area: (x1 - x0) * (y1 - y0), bg: filled ? inner : null, parentBg: ring});
  }
  return {texts, ctas};
}
