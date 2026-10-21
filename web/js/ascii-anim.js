// Animation « analyse en cours » : l'image est redessinee en caracteres, une bande lumineuse la balaie de haut en bas et,
// derriere elle, l'image se revele. Sans image (attente du serveur, telechargement), une vague de caracteres.
// lancerAscii(canvas, conteneur, source) -> fonction d'arret. `source` : canvas, image ou bitmap (optionnel).
const RAMP = ' .,:;i1tfLCG08@';

export function lancerAscii(canvas, conteneur, source) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const dpr = Math.min(2, devicePixelRatio || 1), g = canvas.getContext('2d');
  const L = Math.max(10, Math.round(conteneur.clientWidth * dpr)), Hh = Math.max(10, Math.round(conteneur.clientHeight * dpr));
  canvas.width = L; canvas.height = Hh;
  const cols = Math.max(50, Math.round(conteneur.clientWidth / 7)), cw = L / cols, ch = cw / 0.55, rows = Math.max(8, Math.floor(Hh / ch));
  let lum = null;
  if (source) {                                                           // luminosite de chaque case
    const p = document.createElement('canvas'); p.width = cols; p.height = rows;
    const pg = p.getContext('2d', {willReadFrequently: true}); pg.imageSmoothingQuality = 'high'; pg.drawImage(source, 0, 0, cols, rows);
    const d = pg.getImageData(0, 0, cols, rows).data; lum = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) lum[i] = (0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]) / 255;
  }
  g.font = `${cw / 0.6}px "Geist Mono", ui-monospace, monospace`; g.textBaseline = 'top';
  let vivant = true; const t0 = performance.now();
  const f = now => {
    if (!vivant) return;
    const t = (now - t0) / 1000, balayage = ((t * 0.42) % 1.35) * (rows + 8) - 4;
    g.clearRect(0, 0, L, Hh);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, d = y - balayage;
      let v, a;
      if (lum) {
        const base = lum[i];
        if (d < 0) { v = base; a = 0.35 + 0.65 * base; }                  // deja balaye : l'image est revelee
        else if (d < 3) { v = Math.random(); a = 1; }                      // la bande : caracteres qui brillent
        else { v = base * 0.5 + 0.1 * Math.sin(x * 0.3 + t * 2); a = 0.12; }
      } else {
        v = (Math.sin(x * 0.28 + t * 2.1 + y * 0.6) + Math.sin(y * 0.9 - t * 1.4 + x * 0.1) + 2) / 4; a = 0.2 + v * 0.7;
      }
      const c = RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1))))];
      if (c === ' ') continue;
      g.fillStyle = lum && d >= 0 && d < 3 ? `rgba(255,255,250,${a})` : `rgba(236,234,228,${a})`;
      g.fillText(c, x * cw, y * ch);
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  return () => { vivant = false; g.clearRect(0, 0, L, Hh); };
}
