// Mona dans le navigateur : regard, cerveau, regles de lecture et note.
// Ce fichier est le portage fidele de analyze.py (memes seuils, memes poids).
// Les modeles (ONNX) tournent chez la personne avec onnxruntime-web : aucune image ne quitte la page
// une fois la capture recue.

export const VIEW = {w: 1440, h: 900};
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

// ---------------------------------------------------------------- outils
const clip = (x, a, b) => Math.min(b, Math.max(a, x));

function luminance(rgb) {
  const c = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function median(arr) {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function percentile(arr, q) {                  // comme numpy.percentile (interpolation lineaire)
  const s = Float32Array.from(arr).sort();
  const pos = (q / 100) * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ---------------------------------------------------------------- image
export async function decodeImage(dataUrl) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const c = new OffscreenCanvas(VIEW.w, VIEW.h);
  const g = c.getContext('2d', {willReadFrequently: true});
  g.drawImage(bmp, 0, 0, VIEW.w, VIEW.h);
  return {bmp, data: g.getImageData(0, 0, VIEW.w, VIEW.h).data, w: VIEW.w, h: VIEW.h};
}

// Couleur de fond la plus probable derriere un texte : mediane des pixels qui ne ressemblent pas au texte.
function pixelBg(img, box, textRgb) {
  let [x, y, w, h] = box.map(Math.round);
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(img.w, x + w), y1 = Math.min(img.h, y + h);
  if (x1 <= x0 || y1 <= y0) return null;
  const n = (x1 - x0) * (y1 - y0), step = Math.max(1, Math.floor(Math.sqrt(n / 900)));
  const R = [], G = [], B = [], fr = [], fg = [], fb = [];
  for (let j = y0; j < y1; j += step) for (let i = x0; i < x1; i += step) {
    const p = (j * img.w + i) * 4, r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
    R.push(r); G.push(g); B.push(b);
    if (textRgb && Math.hypot(r - textRgb[0], g - textRgb[1], b - textRgb[2]) > 60) { fr.push(r); fg.push(g); fb.push(b); }
  }
  if (!R.length) return null;
  if (textRgb && fr.length > 0.2 * R.length) return [median(fr), median(fg), median(fb)];
  return [median(R), median(G), median(B)];
}

// Densite de contours : cv2.Canny(gris, 80, 200) (Sobel 3x3, norme L1, suppression des non-maxima, hysteresis).
export function edgeDensity(img, low = 80, high = 200) {
  const W = img.w, H = img.h, gray = new Int16Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4)
    gray[i] = (img.data[p] * 4899 + img.data[p + 1] * 9617 + img.data[p + 2] * 1868 + 8192) >> 14;
  const mag = new Int32Array(W * H), dxs = new Int16Array(W * H), dys = new Int16Array(W * H);
  const at = (x, y) => gray[clip(y, 0, H - 1) * W + clip(x, 0, W - 1)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1), d = at(x - 1, y), f = at(x + 1, y),
          g = at(x - 1, y + 1), h = at(x, y + 1), k = at(x + 1, y + 1);
    const dx = (c + 2 * f + k) - (a + 2 * d + g), dy = (g + 2 * h + k) - (a + 2 * b + c);
    const i = y * W + x;
    dxs[i] = dx; dys[i] = dy; mag[i] = Math.abs(dx) + Math.abs(dy);
  }
  const TG22 = 0.41421356, state = new Uint8Array(W * H);          // 0 rien, 1 faible, 2 fort
  const stack = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, m = mag[i];
    if (m <= low) continue;
    const ax = Math.abs(dxs[i]), ay = Math.abs(dys[i]), tg22x = ax * TG22;
    let keep;
    if (ay < tg22x) keep = m > mag[i - 1] && m >= mag[i + 1];
    else if (ay > tg22x + ax * 2) keep = m > mag[i - W] && m >= mag[i + W];
    else { const s = (dxs[i] < 0) !== (dys[i] < 0) ? -1 : 1; keep = m > mag[i - W - s] && m > mag[i + W - s]; }
    if (!keep) continue;
    if (m > high) { state[i] = 2; stack.push(i); } else state[i] = 1;
  }
  let edges = 0;
  while (stack.length) {                                              // hysteresis : les faibles touchant un fort comptent
    const i = stack.pop();
    edges++;
    for (const j of [i - W - 1, i - W, i - W + 1, i - 1, i + 1, i + W - 1, i + W, i + W + 1])
      if (j >= 0 && j < W * H && state[j] === 1) { state[j] = 2; stack.push(j); }
  }
  return edges / (W * H);
}

// ---------------------------------------------------------------- regles de lecture (analyze.check_screen)
function boxMax(att, box) {                                           // att : {w,h,data} a l'echelle de l'ecran / att.k
  const k = att.k;
  let [x, y, w, h] = box.map(v => Math.round(v * k));
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(att.w, x + Math.max(1, w)), y1 = Math.min(att.h, y + Math.max(1, h));
  let m = 0;
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) m = Math.max(m, att.data[j * att.w + i]);
  return m;
}

export function checkScreen(img, dom, att, first) {
  const checks = [], where = first ? 'au premier écran' : 'sur cet écran';
  const texts = dom.texts || [];
  if (texts.length) {
    for (const t of texts) t.bg_px = pixelBg(img, t.box, t.color) || t.bg;
    const bad = texts.filter(t => contrast(t.color, t.bg_px) < ((t.size >= 24 || (t.size >= 18.66 && t.weight >= 700)) ? 3 : 4.5));
    const words = a => a.reduce((s, t) => s + t.words, 0);
    const s = 1 - words(bad) / Math.max(1, words(texts));
    const exemples = bad.some(t => t.detecte) ? '' : `, ex. ${bad.slice(0, 3).map(t => `« ${t.text.slice(0, 25)} »`).join(', ')}`;
    const tip = bad.length ? `${bad.length} texte(s) avec un contraste trop faible${exemples}. Assombris le texte ou éclaircis le fond.` : null;
    checks.push({nom: 'Contraste du texte', s, w: 2.0, tip});

    const small = texts.filter(t => t.size < 14);
    checks.push({nom: 'Taille du texte', s: 1 - small.length / texts.length, w: 1.0,
      tip: small.length > 2 ? `${small.length} texte(s) en dessous de 14 px : difficile à lire, surtout sur mobile.` : null});
  }
  // Bouton principal : « plein » = fond qui ressort de son entourage
  let ctas = (dom.ctas || []).filter(c => c.filled && c.text && contrast(c.bg, c.parentBg) > 1.6);
  if (!first) ctas = ctas.filter(c => !c.fixed);
  if (ctas.length) {
    const inPage = ctas.filter(c => !c.fixed), pool = inPage.length ? inPage : ctas;
    const main = pool.reduce((a, c) => (c.area * contrast(c.bg, c.parentBg) > a.area * contrast(a.bg, a.parentBg) ? c : a));
    const ratio = boxMax(att, main.box) / (percentile(att.data, 95) + 1e-8);
    const s = clip(Math.sqrt(ratio) / 0.9, 0, 1);
    checks.push({nom: 'Bouton principal visible', s, w: 2.5,
      tip: s < 0.6 ? (main.detecte ? 'Le bouton principal repéré sur l’image attire peu le regard. Plus gros, plus contrasté, ou mieux placé.' : `Le bouton « ${main.text} » attire peu le regard. Plus gros, plus contrasté, ou mieux placé.`) : null});
  } else if (first) {
    checks.push({nom: 'Bouton principal visible', s: 0.2, w: 2.5,
      tip: 'Aucun bouton d\'action clair au premier écran. Ajoute un bouton coloré (ex. « Commencer »).'});
  }
  const density = edgeDensity(img);
  const sd = clip(1 - (density - 0.04) / 0.10, 0, 1);
  checks.push({nom: 'Clarté / pas de surcharge', s: sd, w: 1.5,
    tip: sd < 0.6 ? 'Écran chargé : trop d\'éléments en même temps. Ajoute de l\'espace vide, retire du superflu.' : null});

  const words = texts.reduce((s, t) => s + t.words, 0);
  let sq = 1;
  if (words > 120) sq = clip(1 - (words - 120) / 280, 0, 1); else if (words < 5) sq = first ? 0.5 : 1;
  checks.push({nom: 'Quantité de texte', s: sq, w: 1.0,
    tip: words > 200 ? `${words} mots ${where} : trop dense. Découpe en blocs courts avec des intertitres.`
      : (words < 5 && first ? 'Presque aucun texte au premier écran : le visiteur ne sait pas ce que tu proposes.' : null)});

  if (texts.length >= 3) {
    const sizes = texts.map(t => t.size).sort((a, b) => b - a), med = median(sizes);
    const s = clip((sizes[0] / med - 1.3) / 1.2, 0, 1);
    checks.push({nom: 'Hiérarchie visuelle', s, w: 1.5,
      tip: s < 0.5 ? `Pas de titre qui domine ${where} : rends le titre nettement plus gros (2× le texte normal).` : null});
  }
  const tw = checks.reduce((a, c) => a + c.w, 0);
  return {score: Math.round(100 * checks.reduce((a, c) => a + c.s * c.w, 0) / tw), checks};
}

export function globalScore(screens) {            // le premier écran compte pour moitié
  const first = screens[0].score, rest = screens.slice(1).map(s => s.score);
  return rest.length ? Math.round(0.5 * first + 0.5 * rest.reduce((a, b) => a + b, 0) / rest.length) : first;
}

// ---------------------------------------------------------------- modeles (onnxruntime-web)
let ort = null, sessions = {};
export async function loadModels(base, onProgress = () => {}) {
  if (!ort) {
    if (!window.ort) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = base + 'js/ort/ort.wasm.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    ort = window.ort;
    ort.env.wasm.wasmPaths = base + 'js/ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  }
  const spec = [['gaze_a', 'models/gaze_a.onnx', 256, 320], ['gaze_b', 'models/gaze_b.onnx', 384, 480], ['brain', 'models/brain.onnx', 224, 224]];
  let k = 0;
  for (const [name, path, h, w] of spec) {
    if (!sessions[name]) sessions[name] = {s: await ort.InferenceSession.create(base + path, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'}), h, w};
    onProgress(++k / spec.length, name);
  }
  if (!sessions.ref) sessions.ref = await (await fetch(base + 'models/brain_reference.json')).json();
}

function toTensor(bmp, h, w) {                   // image -> tenseur normalise [1,3,h,w]
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', {willReadFrequently: true});
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(3 * h * w);
  for (let i = 0, p = 0; i < h * w; i++, p += 4) for (let ch = 0; ch < 3; ch++) out[ch * h * w + i] = (d[p + ch] / 255 - MEAN[ch]) / STD[ch];
  return new ort.Tensor('float32', out, [1, 3, h, w]);
}

function resizeMap(src, sw, sh, dw, dh) {        // redimensionnement bilineaire d'une carte
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = clip((y + 0.5) * sh / dh - 0.5, 0, sh - 1), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = clip((x + 0.5) * sw / dw - 0.5, 0, sw - 1), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      out[y * dw + x] = (src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx) * (1 - ty) + (src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx) * ty;
    }
  }
  return out;
}

// Carte d'attention 0..1 : moyenne des deux modeles de regard, a 1/4 de la taille de l'ecran (360 x 225).
export const ATT = {w: 360, h: 225, k: 0.25};
export async function attentionMap(bmp) {
  const acc = new Float32Array(ATT.w * ATT.h);
  for (const name of ['gaze_a', 'gaze_b']) {
    const {s, h, w} = sessions[name];
    const out = (await s.run({image: toTensor(bmp, h, w)})).log_prob.data;
    const p = new Float32Array(h * w);
    let sum = 0;
    for (let i = 0; i < p.length; i++) { p[i] = Math.exp(out[i]); sum += p[i]; }
    const r = resizeMap(p, w, h, ATT.w, ATT.h);
    let rs = 0;
    for (let i = 0; i < r.length; i++) rs += r[i];
    for (let i = 0; i < r.length; i++) acc[i] += r[i] / rs / 2;
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of acc) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < acc.length; i++) acc[i] = (acc[i] - lo) / (hi - lo + 1e-8);
  return {...ATT, data: acc};
}

export const BRAIN_GROUPS = {
  'Vision de base': ['V1', 'V2', 'V3', 'V4'], 'Mouvement': ['MT'], 'Visages': ['FFA_visages', 'OFA_visages'],
  'Corps': ['EBA_corps'], 'Lieux / scènes': ['PPA_lieux', 'RSC_lieux', 'TOS_lieux'], 'Objets': ['LOC_objets', 'IT_objets'],
  'Social': ['STS_social'], 'Attention': ['attention_FEF_IPS'],
};
export async function brainProfile(bmp) {       // percentile de chaque groupe de zones par rapport a ~500 pages web
  const {s} = sessions.brain, ref = sessions.ref;
  const out = await s.run({image: toTensor(bmp, 224, 224)});
  const zz = out[Object.keys(out)[0]].data;
  const pct = {};
  ref.rois.forEach((r, j) => {
    const col = ref.values[j];                  // valeurs de reference triees pour cette zone
    let lo = 0, hi = col.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (col[mid] < zz[j]) lo = mid + 1; else hi = mid; }
    pct[r] = lo / col.length * 100;
  });
  const res = {};
  for (const [g, members] of Object.entries(BRAIN_GROUPS)) res[g] = Math.round(members.reduce((a, r) => a + pct[r], 0) / members.length);
  return res;
}

export function brainNotes(profile) {
  const notes = [];
  for (const [g, p] of Object.entries(profile)) {
    if (p >= 80) notes.push(`${g} : réaction plus forte que ${p} % des sites.`);
    else if (p <= 20) notes.push(`${g} : réaction plus faible que ${100 - p} % des sites.`);
  }
  return notes;
}

// ---------------------------------------------------------------- analyse d'un ecran (commune aux deux entrees : adresse ou image)
async function analyserEcran(img, dom, first, i, n, onStep) {
  await onStep({etape: 'regard', i, n, bmp: img.bmp});
  const att = await attentionMap(img.bmp);
  await onStep({etape: 'cerveau', i, n, att});
  const brain = await brainProfile(img.bmp);
  await onStep({etape: 'regles', i, n});
  const res = checkScreen(img, dom, att, first);
  await onStep({etape: 'fin', i, n, score: res.score});
  return {att: {w: att.w, h: att.h, k: att.k, data: Uint8Array.from(att.data, v => Math.round(v * 255))},
    score: res.score, checks: res.checks.map(c => ({nom: c.nom, score: Math.round(c.s * 100), conseil: c.tip})), brain, brainNotes: brainNotes(brain)};
}

// ---------------------------------------------------------------- analyse complete d'une capture du serveur
export async function analyseCapture(cap, onStep = () => {}) {
  const screens = [];
  for (let i = 0; i < cap.screens.length; i++) {
    const sc = cap.screens[i];
    await onStep({etape: 'lecture', i, n: cap.screens.length});
    const img = await decodeImage(sc.image);
    const r = await analyserEcran(img, sc.dom, i === 0, i, cap.screens.length, onStep);
    screens.push({n: sc.n, y: sc.y, image: sc.image, ...r});
  }
  const tips = [];
  if (!cap.complete) tips.push('Page très longue : seuls les premiers écrans ont été analysés.');
  return {url: cap.url, final_url: cap.final_url, title: cap.title, page_height: cap.page_height, score: globalScore(screens), screens, tips,
    date: Date.now(), seconds_capture: cap.seconds};
}

// ---------------------------------------------------------------- analyse d'une IMAGE envoyee (capture, maquette) : le detecteur remplace la lecture du code de la page
// ecrans : [{canvas, data (ImageData 1440 x 900)}] ; detecter(ImageData) -> detections ; reglages : models/plan_b_params.json
export async function analyseImage(ecrans, detecter, reglages, nom, onStep = () => {}, info = {}) {
  const { domFromDets } = await import('./planb.js');
  const screens = [];
  for (let i = 0; i < ecrans.length; i++) {
    const e = ecrans[i];
    await onStep({etape: 'lecture', i, n: ecrans.length, canvas: e.canvas});
    const bmp = await createImageBitmap(e.canvas);
    const img = {bmp, data: e.data.data, w: VIEW.w, h: VIEW.h};
    await onStep({etape: 'detecteur', i, n: ecrans.length, bmp});
    const dets = await detecter(e.data);
    const dom = domFromDets(img, dets, reglages);
    const r = await analyserEcran(img, dom, i === 0, i, ecrans.length, onStep);
    screens.push({n: i + 1, y: e.y, image: e.canvas.toDataURL('image/jpeg', 0.82), ...r});
  }
  const tips = ['Note indicative : Mona a lu l’interface depuis une image, sans le code de la page. L’écart moyen avec la lecture du code est d’environ 5,5 points sur 100.'];
  if (info.tronque) tips.push(`Image très longue : seuls les ${ecrans.length} premiers écrans sur ${info.total} ont été analysés.`);
  return {url: nom, final_url: null, title: nom, mode: 'image', page_height: info.hauteur || 0, score: globalScore(screens), screens, tips, date: Date.now()};
}
