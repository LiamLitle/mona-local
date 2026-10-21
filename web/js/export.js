// Export des graphiques et des resultats : copier (tableau), CSV, image (PNG). Partage par les pages des mesures et du detecteur.
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// ---------------------------------------------------------------- export : copier, CSV, image
export const donneesDe = fig => JSON.parse(fig.dataset.export);
export const csvCellule = c => /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
export const enCsv = d => [d.entetes, ...d.lignes].map(l => l.map(csvCellule).join(',')).join('\r\n');
export const enTsv = d => `${d.titre}\n` + [d.entetes, ...d.lignes].map(l => l.join('\t')).join('\n');
export const slug = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function telecharger(nom, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; }
  catch (e) {
    const t = document.createElement('textarea'); t.value = texte; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t);
    t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}
export function retour(bouton, texte = 'Copié') {
  const avant = bouton.textContent; bouton.textContent = texte; bouton.classList.add('ok');
  setTimeout(() => { bouton.textContent = avant; bouton.classList.remove('ok'); }, 1400);
}

function coller(ctx2, texte, x, y, largeur, interligne) {                       // texte qui passe a la ligne
  const mots = texte.split(' '); let ligne = '';
  for (const m of mots) {
    const essai = ligne ? ligne + ' ' + m : m;
    if (ctx2.measureText(essai).width > largeur && ligne) { ctx2.fillText(ligne, x, y); y += interligne; ligne = m; } else ligne = essai;
  }
  ctx2.fillText(ligne, x, y);
  return y + interligne;
}

async function enImage(fig) {
  const svg = fig.querySelector('svg'), vb = svg.viewBox.baseVal, S = 2;           // image en double definition
  const clone = svg.cloneNode(true), src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {                                                          // le CSS de la page n'existe pas dans l'image : on copie les styles
    const cs = getComputedStyle(el), d = dst[i];
    for (const p of ['fill', 'stroke', 'stroke-width', 'font-size', 'opacity', 'stroke-dasharray', 'stroke-dashoffset']) d.style.setProperty(p, cs.getPropertyValue(p));
    d.style.setProperty('font-family', 'ui-monospace, Menlo, Consolas, monospace');
    d.style.setProperty('transform', 'none'); d.style.setProperty('transition', 'none');
  });
  clone.querySelectorAll('.ligne').forEach(l => l.style.setProperty('stroke-dashoffset', '0'));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', vb.width * S); clone.setAttribute('height', vb.height * S);
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); });
  const titre = fig.querySelector('figcaption b').textContent, legende = fig.querySelector('figcaption span').textContent;
  const leg = $$('.c-legende li', fig).map(li => [li.textContent, getComputedStyle(li.querySelector('i')).backgroundColor]);
  const P = 44 * S / 2, L = vb.width * S, WIDTH = L + 2 * P;
  const mesure = document.createElement('canvas').getContext('2d');
  mesure.font = `${15 * S}px "Instrument Sans", sans-serif`;
  // hauteur du texte : on simule le passage a la ligne
  let lignes = 1, cur = ''; for (const m of legende.split(' ')) { const e = cur ? cur + ' ' + m : m; if (mesure.measureText(e).width > L && cur) { lignes++; cur = m; } else cur = e; }
  const hTitre = 40 * S, hLeg = lignes * 21 * S + 10 * S, hLegende = leg.length ? 28 * S : 0;
  const c = document.createElement('canvas'); c.width = WIDTH; c.height = P + hTitre + hLeg + hLegende + img.height + 46 * S;
  const g = c.getContext('2d');
  g.fillStyle = '#0D0D0C'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ECEAE4'; g.font = `${34 * S}px "Instrument Serif", Georgia, serif`; g.textBaseline = 'alphabetic'; g.fillText(titre, P, P + 28 * S);
  g.fillStyle = '#9C9A93'; g.font = `${15 * S}px "Instrument Sans", sans-serif`;
  let y = coller(g, legende, P, P + hTitre + 14 * S, L, 21 * S);
  let x = P;
  g.font = `${12 * S}px "Geist Mono", monospace`;
  for (const [nom, couleur] of leg) { g.fillStyle = couleur; g.fillRect(x, y + 4 * S, 10 * S, 10 * S); g.fillStyle = '#9C9A93'; g.fillText(nom, x + 16 * S, y + 13 * S); x += g.measureText(nom).width + 40 * S; }
  y += hLegende;
  g.drawImage(img, P, y);
  g.fillStyle = '#6a6963'; g.font = `${11 * S}px "Geist Mono", monospace`;
  g.fillText('Mona · mesures · liamlitle.github.io/mona', P, c.height - 16 * S);
  return await new Promise(ok => c.toBlob(ok, 'image/png'));
}

export function initExports() {
document.addEventListener('click', async e => {
  const b = e.target.closest('.c-outils button');
  if (!b) return;
  const fig = b.closest('.graphique'), d = donneesDe(fig);
  if (b.dataset.act === 'copy') retour(b, (await copier(enTsv(d))) ? 'Copié' : 'Échec');
  else if (b.dataset.act === 'csv') { telecharger(`mona-${slug(d.titre)}.csv`, new Blob(['﻿' + enCsv(d)], {type: 'text/csv;charset=utf-8'})); retour(b, 'Enregistré'); }
  else if (b.dataset.act === 'png') {
    b.disabled = true;
    try { telecharger(`mona-${slug(d.titre)}.png`, await enImage(fig)); retour(b, 'Enregistré'); } catch (err) { retour(b, 'Échec'); }
    b.disabled = false;
  }
});
const tous = () => $$('.graphique').map(donneesDe);
const tc = document.getElementById('tout-copier');
if (tc) tc.onclick = async ev => retour(ev.currentTarget, (await copier(tous().map(enTsv).join('\n\n'))) ? 'Copié' : 'Échec');
const tv = document.getElementById('tout-csv');
if (tv) tv.onclick = ev => {
  telecharger('mona-mesures.csv', new Blob(['﻿' + tous().map(d => csvCellule(d.titre) + '\r\n' + enCsv(d)).join('\r\n\r\n')], {type: 'text/csv;charset=utf-8'}));
  retour(ev.currentTarget, 'Enregistré');
};
}
