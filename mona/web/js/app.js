// Interface de Mona en local : l'analyse tourne sur le PC (serveur Python), cette page affiche la progression et le rapport.
//   initOutil(racine)       : formulaire, animation de l'analyse, rapport affiche sur place
//   initHistorique(racine)  : liste des analyses enregistrees, ouverture d'un rapport, import / export
import { lancerAscii } from './ascii-anim.js';

let app = null, MODE = 'historique';
const BASE = new URL('../', import.meta.url).href;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const couleur = s => s >= 75 ? 'var(--bien)' : s >= 50 ? 'var(--moyen)' : 'var(--mal)';
const POIDS = {'Contraste du texte': 2.0, 'Taille du texte': 1.0, 'Bouton principal visible': 2.5, 'Clarté / pas de surcharge': 1.5, 'Quantité de texte': 1.0, 'Hiérarchie visuelle': 1.5};
const EXPLIQUE = {
  'Contraste du texte': 'Rapport de luminance entre le texte et son fond (WCAG : 4,5 ; 3 pour les gros textes). Compté en mots : un paragraphe illisible pèse plus que trois liens.',
  'Taille du texte': 'Part des textes de moins de 14 px.',
  'Bouton principal visible': 'La chaleur de la carte du regard sur le bouton plein le plus visible, comparée aux zones les plus regardées de l\'écran.',
  'Clarté / pas de surcharge': 'Densité des contours de l\'image (détecteur de Canny) : trop d\'éléments en même temps fatigue l\'œil.',
  'Quantité de texte': 'Nombre de mots visibles : au-delà de 120 le score baisse, au-delà de 200 on conseille de découper.',
  'Hiérarchie visuelle': 'Écart de taille entre le plus gros titre et le texte courant (2× est un bon repère).',
};

// ------------------------------------------------------------------ stockage (IndexedDB, sur l'appareil)
const DB = {
  _db: null,
  open() {
    if (this._db) return this._db;
    return this._db = new Promise((ok, ko) => {
      const r = indexedDB.open('mona', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('idx', {keyPath: 'id'}); r.result.createObjectStore('rep', {keyPath: 'id'}); };
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    });
  },
  async tx(stores, mode, fn) {
    const db = await this.open();
    return new Promise((ok, ko) => { const t = db.transaction(stores, mode); const res = fn(t); t.oncomplete = () => ok(res.result ?? res); t.onerror = () => ko(t.error); });
  },
  async liste() { const db = await this.open(); return new Promise((ok, ko) => { const r = db.transaction('idx').objectStore('idx').getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
  async lire(id) { const db = await this.open(); return new Promise((ok, ko) => { const r = db.transaction('rep').objectStore('rep').get(id); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
  async ecrire(rep) {
    const resume = {id: rep.id, url: rep.url, title: rep.title, date: rep.date, score: rep.score, ecrans: rep.screens.length, thumb: rep.thumb};
    await this.tx(['idx', 'rep'], 'readwrite', t => { t.objectStore('idx').put(resume); t.objectStore('rep').put(rep); return {}; });
  },
  async supprimer(id) { await this.tx(['idx', 'rep'], 'readwrite', t => { t.objectStore('idx').delete(id); t.objectStore('rep').delete(id); return {}; }); },
};

async function miniature(dataUrl) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const c = new OffscreenCanvas(360, 225), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, 360, 225);
  const b = await c.convertToBlob({type: 'image/jpeg', quality: 0.7});
  return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
}

// export / import JSON (att en base64)
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function empaqueter(rep) {
  return JSON.stringify({mona: 1, ...rep, screens: rep.screens.map(s => ({...s, att: {...s.att, data: b64(s.att.data)}}))});
}
function depaqueter(texte) {
  const r = JSON.parse(texte);
  if (r.mona !== 1 || !Array.isArray(r.screens) || !r.screens.length) throw new Error('Fichier de rapport Mona invalide.');
  for (const s of r.screens) {
    if (typeof s.image !== 'string' || !s.image.startsWith('data:image/jpeg;base64,')) throw new Error('Image de rapport invalide.');
    s.att = {...s.att, data: unb64(s.att.data)};
  }
  delete r.mona;
  r.id = r.id || nouvelId();
  return r;
}
const nouvelId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
function telecharger(nom, texte, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texte], {type})); a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = u => u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'site';
const dateFr = t => new Date(t).toLocaleString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
function versHaut() {                                    // ramene la vue en haut de l'outil (accueil) ou de la page (rapports)
  if (MODE === 'outil') {
    const L = window.monaLenis, y = app.getBoundingClientRect().top + scrollY - 90;
    if (L) L.scrollTo(Math.max(0, y), {duration: 1.1}); else scrollTo({top: Math.max(0, y), behavior: 'smooth'});
  } else scrollTo(0, 0);
}

// ------------------------------------------------------------------ chaleur du regard
function jet(v) { return [clamp(1.5 - Math.abs(4 * v - 3), 0, 1), clamp(1.5 - Math.abs(4 * v - 2), 0, 1), clamp(1.5 - Math.abs(4 * v - 1), 0, 1)].map(x => Math.round(x * 255)); }
function heatCanvas(att, data) {
  const c = document.createElement('canvas'); c.width = att.w; c.height = att.h;
  const g = c.getContext('2d'), im = g.createImageData(att.w, att.h);
  for (let i = 0; i < att.w * att.h; i++) { const v = data ? data[i] : att.data[i] / 255, [r, gg, b] = jet(v); im.data.set([r, gg, b, 255], i * 4); }
  g.putImageData(im, 0, 0);
  return c;
}

// ------------------------------------------------------------------ outil (accueil) : adresse d'un site OU image
async function api(chemin, corps) {
  const r = await fetch(chemin, corps === undefined ? {} : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(corps)});
  if (!r.ok) throw new Error(`Le serveur local a répondu ${r.status}.`);
  return r.json();
}

async function vueOutil(mode = 'url') {
  const deja = document.getElementById('url') ? document.getElementById('url').value : '';
  app.innerHTML = `
    <div class="onglets-outil" role="tablist" aria-label="Que veux-tu analyser ?">
      <button type="button" role="tab" data-m="url" aria-selected="${mode === 'url'}">Un site</button>
      <button type="button" role="tab" data-m="image" aria-selected="${mode === 'image'}">Une image (capture, maquette, Figma)</button>
    </div>
    <div id="mode-url" ${mode === 'url' ? '' : 'hidden'}>
      <form class="form" id="form" autocomplete="off">
        <input id="url" type="text" inputmode="url" placeholder="https://exemple.com" aria-label="Adresse du site" required>
        <button class="btn btn-plein">Analyser</button>
      </form>
      <p class="ana-note">Mona ouvre un Chrome de test, fait défiler la page jusqu’en bas, puis la lit avec ses modèles. Tout se passe sur ton PC.</p>
    </div>
    <div id="mode-image" ${mode === 'image' ? '' : 'hidden'}>
      <div class="depot" id="depot" tabindex="0" role="button" aria-label="Choisir ou déposer une image">
        <b>Dépose ton image ici</b>
        <span>PNG, JPG ou WebP : capture d’écran, maquette, export Figma. Tu peux aussi la coller avec Ctrl + V. Les images longues sont découpées en écrans.</span>
        <button class="btn btn-plein" type="button" id="choisir-img">Choisir une image</button>
        <input type="file" id="fichier-img" accept="image/*" hidden>
      </div>
      <p class="ana-note">Sans le code de la page, Mona lit l’interface avec son détecteur d’éléments : la note est <b>indicative</b> (environ 5 points sur 100 d’écart).</p>
    </div>
    <details class="pc" id="pc"><summary>Ton PC et les réglages</summary><div id="pc-corps"><p class="ana-note">Lecture du PC…</p></div></details>
    <p class="petit" id="lien-histo" style="margin-top:14px"></p>`;
  app.querySelectorAll('.onglets-outil button').forEach(b => b.onclick = () => vueOutil(b.dataset.m));
  document.getElementById('form').onsubmit = e => { e.preventDefault(); lancer(document.getElementById('url').value); };
  if (deja) document.getElementById('url').value = deja;
  const depot = document.getElementById('depot'), champ = document.getElementById('fichier-img');
  document.getElementById('choisir-img').onclick = ev => { ev.stopPropagation(); champ.click(); };
  depot.onclick = () => champ.click();
  champ.onchange = () => { if (champ.files[0]) lancerImage(champ.files[0]); };
  ['dragenter', 'dragover'].forEach(t => depot.addEventListener(t, e => { e.preventDefault(); depot.classList.add('survol'); }));
  ['dragleave', 'drop'].forEach(t => depot.addEventListener(t, e => { e.preventDefault(); depot.classList.remove('survol'); }));
  depot.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) lancerImage(f); });
  vuePc();
  try {
    const n = (await DB.liste()).length;
    document.getElementById('lien-histo').innerHTML = n ? `<a href="analyse.html">Mes analyses : ${n} rapport${n > 1 ? 's' : ''} sur cet appareil →</a>` : '';
  } catch (e) {}
}

// Carte « Ton PC » : ce que Mona a lu du PC, ce qu'elle en a fait, et quelques réglages
const MODES = {eco: 'Économique', standard: 'Équilibré', turbo: 'Rapide'};
async function vuePc() {
  const cadre = document.getElementById('pc-corps');
  if (!cadre) return;
  let d;
  try { d = await api('/api/hardware'); } catch (e) { cadre.innerHTML = '<p class="ana-note">Impossible de lire le PC.</p>'; return; }
  const {hardware: h, plan: p, settings: s, models: m} = d, ok = m.every(x => x.etat === 'ok');
  cadre.innerHTML = `
    <dl class="pc-liste">
      <div><dt>Processeur</dt><dd>${esc(h.cpu)} · ${h.cores_physical} cœurs (${h.cores_logical} threads)</dd></div>
      <div><dt>Mémoire</dt><dd>${h.ram_gb} Go, dont ${h.ram_free_gb} Go libres</dd></div>
      <div><dt>Accélération</dt><dd>${esc(h.gpu || 'processeur seul')}</dd></div>
      <div><dt>Réglage choisi</dt><dd>${MODES[p.mode]} : ${p.threads} threads, ${p.max_screens} écrans au plus${p.parallel_gaze ? ', regard en parallèle' : ''}</dd></div>
      <div><dt>Modèles</dt><dd>${ok ? `${m.length} fichiers présents dans <code>models/</code>` : '<b>fichiers manquants ou abîmés : relance « python -m mona doctor »</b>'}</dd></div>
    </dl>
    ${p.notes.map(n => `<p class="ana-note">${esc(n)}</p>`).join('')}
    <div class="pc-reglages">
      <label>Mode <select id="r-mode"><option value="auto">Automatique (conseillé)</option>${Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="r-visible"> Montrer le Chrome de test pendant la capture</label>
    </div>`;
  document.getElementById('r-mode').value = s.mode;
  document.getElementById('r-visible').checked = s.show_browser;
  const enregistrer = async () => { try { await api('/api/settings', {mode: document.getElementById('r-mode').value, show_browser: document.getElementById('r-visible').checked}); vuePc(); } catch (e) {} };
  document.getElementById('r-mode').onchange = enregistrer;
  document.getElementById('r-visible').onchange = enregistrer;
}

addEventListener('paste', e => {                         // coller une image n'importe ou sur la page quand l'outil est a l'ecran
  if (MODE !== 'outil' || !document.getElementById('mode-image') || document.getElementById('mode-image').hidden) return;
  const it = [...(e.clipboardData?.items || [])].find(x => x.type.startsWith('image/'));
  if (it) lancerImage(it.getAsFile());
});

// ------------------------------------------------------------------ « Mes analyses »
async function vueHistorique() {
  document.title = 'Mes analyses — Mona';
  app.innerHTML = `
    <h1 class="ana-mot">Mes analyses</h1>
    <p class="ana-intro">Les rapports enregistrés sur cet appareil. Rien n’est envoyé : ils restent dans le stockage de ton navigateur.</p>
    <p><a class="btn btn-plein" href="index.html">Nouvelle analyse</a></p>
    <div class="histo">
      <div class="histo-tete">
        <input id="cherche" type="search" placeholder="Rechercher" aria-label="Rechercher une analyse" style="margin-right:auto">
        <select id="tri" aria-label="Trier"><option value="date">Plus récentes</option><option value="note">Meilleure note</option><option value="nom">Par site</option></select>
      </div>
      <div class="grille" id="grille"></div>
      <div class="outils"><button class="btn" id="exp-tout">Tout exporter</button><label class="btn">Importer un rapport<input id="imp" type="file" accept="application/json,.json" multiple hidden></label><span class="petit" id="stock-txt" style="align-self:center"></span></div>
    </div>`;
  const grille = document.getElementById('grille');
  let liste = [];
  try { liste = await DB.liste(); } catch (e) { grille.innerHTML = `<p class="vide">Le stockage du navigateur n’est pas disponible (navigation privée ?). Les rapports ne pourront pas être gardés, mais tu peux les exporter.</p>`; }
  const dessiner = () => {
    const q = document.getElementById('cherche').value.toLowerCase().trim(), tri = document.getElementById('tri').value;
    let l = liste.filter(r => !q || (r.url + ' ' + r.title).toLowerCase().includes(q));
    l.sort(tri === 'note' ? (a, b) => b.score - a.score : tri === 'nom' ? (a, b) => a.url.localeCompare(b.url) : (a, b) => b.date - a.date);
    grille.innerHTML = l.length ? l.map(r => `<a class="carte" href="#/r/${esc(r.id)}"><img alt="" src="${esc(r.thumb)}" loading="lazy"><div class="corps"><span class="site">${esc((r.title || r.url).slice(0, 60))}</span><span class="sc" style="color:${couleur(r.score)}">${r.score}</span><span class="date">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 34))} · ${dateFr(r.date)} · ${r.ecrans} écran${r.ecrans > 1 ? 's' : ''}</span></div></a>`).join('')
      : `<p class="vide" style="grid-column:1/-1">${liste.length ? 'Aucun résultat.' : 'Aucune analyse pour l\'instant. Lance-en une depuis la page d\'accueil : elle apparaîtra ici.'}</p>`;
  };
  dessiner();
  document.getElementById('cherche').oninput = dessiner; document.getElementById('tri').onchange = dessiner;
  document.getElementById('exp-tout').onclick = async () => {
    const tous = []; for (const r of liste) tous.push(JSON.parse(empaqueter(await DB.lire(r.id))));
    telecharger('mona-rapports.json', JSON.stringify(tous), 'application/json');
  };
  document.getElementById('imp').onchange = async e => {
    let n = 0;
    for (const f of e.target.files) {
      try {
        const j = JSON.parse(await f.text());
        for (const item of Array.isArray(j) ? j : [j]) { const r = depaqueter(JSON.stringify(item)); r.thumb = r.thumb || await miniature(r.screens[0].image); await DB.ecrire(r); n++; }
      } catch (err) { alert(`${f.name} : ${err.message}`); }
    }
    if (n) vueHistorique();
  };
  majStockage();
}
async function majStockage() {
  try {
    const e = await navigator.storage.estimate(), n = (await DB.liste()).length;
    const t = `${n} rapport${n > 1 ? 's' : ''} · ${(e.usage / 1e6).toFixed(1)} Mo sur cet appareil`;
    const s = document.getElementById('stock-txt'); if (s) s.textContent = t;
    const f = document.getElementById('stockage'); if (f) f.textContent = t;
  } catch (e) {}
}

// ------------------------------------------------------------------ analyse en cours
const ETAPES = [
  ['ouverture', 'Ouverture du Chrome de test', 'il ouvre l\'adresse et fait défiler la page'],
  ['modeles', 'Chargement des modèles', 'sur ton PC, une seule fois'],
  ['lecture', 'Lecture des écrans', 'défilement, textes, boutons, couleurs'],
  ['regard', 'Où l\'œil se pose', 'deux modèles appris sur de vrais regards'],
  ['cerveau', 'Réaction du cerveau', '20 zones du cortex visuel'],
  ['regles', 'Vérification de la lisibilité', 'contraste, taille, bouton, hiérarchie…'],
];
function ondeAscii(canvas, stop) {                        // petite vague de caractères pendant l'attente du serveur
  const RAMP = ' .,:;i1tfLCG08@', cols = 56, rows = 9, g = canvas.getContext('2d');
  canvas.width = cols * 11; canvas.height = rows * 20;
  g.font = '16px "Geist Mono", monospace'; g.textBaseline = 'top';
  const t0 = performance.now();
  const f = now => {
    if (stop.fini) return;
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const v = (Math.sin(x * 0.28 + t * 2.1 + y * 0.6) + Math.sin(y * 0.9 - t * 1.4 + x * 0.1) + 2) / 4;
      g.fillStyle = `rgba(236,234,228,${0.15 + v * 0.7})`;
      g.fillText(RAMP[Math.floor(v * (RAMP.length - 1))], x * 11, y * 20);
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

// Scene d'analyse commune aux deux entrees : image, etapes, barre, vignettes, animation ASCII
const ETAPES_IMAGE = [
  ['lecture', 'Lecture de l\'image', 'découpée en écrans de 900 px'],
  ['modeles', 'Chargement des modèles', 'détecteur, regard, cerveau : une seule fois'],
  ['detecteur', 'Lecture de l\'interface', 'textes, boutons, images, champs, icônes'],
  ['regard', 'Où l\'œil se pose', 'deux modèles appris sur de vrais regards'],
  ['cerveau', 'Réaction du cerveau', '20 zones du cortex visuel'],
  ['regles', 'Vérification de la lisibilité', 'contraste, taille, bouton, hiérarchie…'],
];
function installerScene(titre, etapes) {
  app.innerHTML = `
    <p class="ana-intro" style="font-family:var(--mono);overflow-wrap:anywhere;margin-top:0">${esc(titre)}</p>
    <div class="ana-scene">
      <div><div class="film" id="film"><div class="attente"><canvas id="onde"></canvas></div><div class="balayage"></div></div><div class="bande" id="bande"></div></div>
      <div><ol class="etapes" id="etapes">${etapes.map(([k, t, d]) => `<li data-k="${k}"><span>${t}<small>${d}</small></span></li>`).join('')}</ol><div class="barre"><i id="prog"></i></div><p class="petit" id="statut" style="margin-top:12px"></p></div>
    </div>`;
  versHaut();
  const S = {film: document.getElementById('film'), bande: document.getElementById('bande'), statut: document.getElementById('statut'), stopOnde: null, stopAscii: null};
  S.stopOnde = lancerAscii(document.getElementById('onde'), S.film, null);                 // vague de caracteres pendant l'attente
  S.marque = (k, etat) => app.querySelectorAll('#etapes li').forEach(li => { if (li.dataset.k === k) li.className = etat; });
  S.progres = x => { document.getElementById('prog').style.width = (clamp(x, 0, 1) * 100).toFixed(1) + '%'; };
  S.echec = msg => { S.arreter(); app.innerHTML = `<div class="alerte">${esc(msg)}</div><div class="outils"><button class="btn" id="retour">Réessayer</button></div>`; document.getElementById('retour').onclick = () => vueOutil(); };
  S.arreter = () => { if (S.stopOnde) S.stopOnde(); if (S.stopAscii) S.stopAscii(); S.stopOnde = S.stopAscii = null; };
  S.film.innerHTML = '<img alt=""><canvas class="chaleur"></canvas><canvas class="ascii-film"></canvas><div class="balayage"></div>';
  S.img = S.film.querySelector('img'); S.cv = S.film.querySelector('canvas.chaleur'); S.ascii = S.film.querySelector('.ascii-film');
  S.film.insertAdjacentHTML('afterbegin', '<div class="attente"><canvas id="onde2"></canvas></div>');
  S.stopOnde(); S.stopOnde = lancerAscii(S.film.querySelector('#onde2'), S.film, null);
  return S;
}
// Une etape de l'analyse d'un ecran : affiche l'image, lance l'animation ASCII pendant la lecture du regard, puis la chaleur
async function etapeScene(S, s, srcImage) {
  const frac = (s.i + ({lecture: 0.04, detecteur: 0.2, regard: 0.42, cerveau: 0.68, regles: 0.88, fin: 1}[s.etape] || 0)) / s.n;
  S.progres(0.14 + 0.84 * frac);
  if (s.etape === 'lecture') {
    if (S.stopOnde) { S.stopOnde(); S.stopOnde = null; S.film.querySelector('.attente')?.remove(); }
    S.film.classList.remove('chaud', 'scan'); S.img.src = srcImage(s); S.marque('lecture', 'cours'); ['detecteur', 'regard', 'cerveau', 'regles'].forEach(k => S.marque(k, ''));
    S.statut.textContent = `Écran ${s.i + 1} sur ${s.n}`;
  } else if (s.etape === 'detecteur') { S.marque('lecture', 'fait'); S.marque('detecteur', 'cours'); }
  else if (s.etape === 'regard') {
    S.marque('lecture', 'fait'); S.marque('detecteur', 'fait'); S.marque('regard', 'cours'); S.film.classList.add('scan');
    if (S.stopAscii) S.stopAscii(); S.stopAscii = lancerAscii(S.ascii, S.film, S.img); S.t0 = performance.now();
  } else if (s.etape === 'cerveau') {
    const reste = 1300 - (performance.now() - (S.t0 || 0));        // l'animation ASCII est visible au moins 1,3 s par ecran : la bande a le temps de balayer l'image
    if (reste > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) await sleep(reste);
    S.marque('regard', 'fait'); S.marque('cerveau', 'cours'); S.film.classList.remove('scan');
    if (S.stopAscii) { S.stopAscii(); S.stopAscii = null; }
    const h = heatCanvas(s.att, s.att.data); S.cv.width = h.width; S.cv.height = h.height; S.cv.getContext('2d').drawImage(h, 0, 0); requestAnimationFrame(() => S.film.classList.add('chaud'));
  } else if (s.etape === 'regles') { S.marque('cerveau', 'fait'); S.marque('regles', 'cours'); }
  else if (s.etape === 'fin') {
    S.marque('regles', 'fait');
    const fig = document.createElement('figure'); fig.innerHTML = `<img alt="" src="${esc(S.img.src)}"><b style="color:${couleur(s.score)}">${s.score}</b>`; S.bande.appendChild(fig);
    return sleep(260);
  }
}
async function enregistrerEtMontrer(rapport) {
  rapport.id = nouvelId(); rapport.thumb = await miniature(rapport.screens[0].image);
  try { await DB.ecrire(rapport); } catch (e) { rapport.nonSauve = true; }
  vueRapport(rapport);
}

// Lit le flux d'événements du serveur local (une ligne JSON par événement) et les traite l'un après l'autre
async function suivre(reponse, S, onEvent) {
  if (!reponse.ok) {
    let d = ''; try { d = (await reponse.json()).detail; } catch (e) {}
    throw new Error(d || `Le serveur local a répondu ${reponse.status}.`);
  }
  const lecteur = reponse.body.getReader(), dec = new TextDecoder();
  let tampon = '', rapport = null;
  for (;;) {
    const {done, value} = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, {stream: true});
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, i).trim(); tampon = tampon.slice(i + 1);
      if (!ligne) continue;
      const ev = JSON.parse(ligne);
      if (ev.t === 'erreur') throw new Error(ev.message);
      if (ev.t === 'termine') { rapport = ev.rapport; continue; }
      await onEvent(ev);
    }
  }
  if (!rapport) throw new Error('L’analyse s’est arrêtée avant la fin.');
  for (const s of rapport.screens) s.att = {...s.att, data: unb64(s.att.data)};
  return rapport;
}

// Événements du serveur -> scène d'analyse (étapes, statut, animation)
function gererEvenement(S, images) {
  return async ev => {
    if (ev.t === 'etat') {
      if (ev.etape && ev.marque) S.marque(ev.etape, ev.marque);
      if (ev.texte) S.statut.textContent = ev.texte;
      if (ev.etape === 'ouverture') S.progres(0.05);
      if (ev.etape === 'modeles' && ev.marque === 'fait') S.progres(0.14);
      return;
    }
    if (ev.etape === 'lecture') images[ev.i] = ev.image;
    if (ev.etape === 'cerveau') ev.att = {...ev.att, data: unb64(ev.att.data)};
    return etapeScene(S, ev, st => images[st.i]);
  };
}

async function lancer(brut) {
  let url = (brut || '').trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const S = installerScene(url, ETAPES);
  S.marque('ouverture', 'cours'); S.progres(0.03);
  S.statut.textContent = 'Ouverture du Chrome de test…';
  try {
    const rep = await fetch('/api/analyze', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({url})});
    const rapport = await suivre(rep, S, gererEvenement(S, []));
    S.arreter(); S.progres(1); S.statut.textContent = 'Calcul de la note…'; await sleep(450);
    await enregistrerEtMontrer(rapport);
  } catch (e) { S.echec(e.message.includes('Failed to fetch') ? 'Le serveur local ne répond plus. Relance Mona.' : e.message); }
}

async function lancerImage(fichier) {
  const nom = (fichier.name && fichier.name !== 'image.png' ? fichier.name : 'Image collée').slice(0, 80);
  const S = installerScene(nom, ETAPES_IMAGE);
  S.marque('lecture', 'cours'); S.progres(0.03);
  try {
    const rep = await fetch('/api/analyze-image', {method: 'POST', headers: {'x-name': encodeURIComponent(nom), 'content-type': 'application/octet-stream'}, body: await fichier.arrayBuffer()});
    const rapport = await suivre(rep, S, gererEvenement(S, []));
    S.arreter(); S.progres(1); S.statut.textContent = 'Calcul de la note…'; await sleep(450);
    await enregistrerEtMontrer(rapport);
  } catch (e) { S.echec(e.message.includes('Failed to fetch') ? 'Le serveur local ne répond plus. Relance Mona.' : e.message); }
}

// ------------------------------------------------------------------ rapport
const verdict = s => s >= 85 ? 'Très lisible : peu de choses à corriger.' : s >= 70 ? 'Plutôt bon : quelques points à travailler.' : s >= 50 ? 'Moyen : plusieurs choses freinent la lecture.' : 'Fragile : la page est difficile à lire d\'un coup d\'œil.';
function barre(nom, v, conseil) {
  return `<div class="critere"><div class="nom"><b style="font-weight:500">${esc(nom)}</b><span>${v}</span></div><div class="piste"><i style="width:${v}%;background:${couleur(v)}"></i></div>${conseil ? `<p style="font-size:13px;color:var(--pierre);margin-top:5px">${esc(conseil)}</p>` : ''}</div>`;
}

function vueRapport(r, demo = false) {
  if (MODE === 'historique') document.title = `${r.title || r.url} — rapport Mona`;
  const n = r.screens.length, outil = MODE === 'outil';
  const moy = {};
  for (const s of r.screens) for (const c of s.checks) (moy[c.nom] ||= []).push(c.score);
  const conseils = [];
  r.screens.forEach((s, i) => s.checks.forEach(c => { if (c.conseil) conseils.push({ecran: i + 1, nom: c.nom, texte: c.conseil, poids: (1 - c.score / 100) * (POIDS[c.nom] || 1)}); }));
  conseils.sort((a, b) => b.poids - a.poids);
  for (const t of r.tips || []) conseils.push({ecran: 0, nom: 'Page', texte: t, poids: 0});
  const ligne = c => `<li><span class="ou">${c.ecran ? 'Écran ' + c.ecran : 'Page'}<br>${esc(c.nom)}</span><span class="quoi">${esc(c.texte)}</span></li>`;
  app.innerHTML = `
    <div class="rapport-tete">
      <div class="note-grande" style="color:${couleur(r.score)}">${r.score}<small>/100</small></div>
      <div><p class="petit">${demo ? 'Rapport d\'exemple · ' : ''}${esc(dateFr(r.date))} · ${n} écran${n > 1 ? 's' : ''}</p>
        <h1>${esc(r.title || r.url)}</h1><p class="verdict">${verdict(r.score)}</p>
        ${r.mode === 'image' ? '<span class="petit">Lu depuis une image envoyée</span>' : `<a class="petit" href="${esc(/^https?:\/\//.test(r.final_url || r.url) ? (r.final_url || r.url) : '#')}" target="_blank" rel="noopener noreferrer">${esc(r.final_url || r.url)}</a>`}</div>
    </div>
    <div class="bouts noprint">
      ${outil ? '<button class="btn btn-plein" id="b-nouveau">← Nouvelle analyse</button><a class="btn" href="analyse.html">Mes analyses</a>' : '<a class="btn" href="#/">← Mes analyses</a>'}
      <button class="btn" id="b-json">Exporter (JSON)</button>
      ${outil ? `<a class="btn" href="analyse.html#/r/${esc(r.id)}">Imprimer / PDF</a>` : '<button class="btn" id="b-pdf">Imprimer / PDF</button>'}
      ${demo ? '<button class="btn btn-plein" id="b-save">Enregistrer cet exemple</button>' : (outil ? '' : '<button class="btn" id="b-sup">Supprimer</button>')}
    </div>
    ${r.nonSauve ? '<div class="alerte info">Ce rapport n\'a pas pu être enregistré sur cet appareil (stockage indisponible). Exporte-le pour le garder.</div>' : ''}
    <div class="bloc"><h2>Ce qu'il faut corriger d'abord</h2>
      <p class="ana-intro" style="margin-bottom:0">Classé par effet probable sur la note (poids de la règle × écart).</p>
      ${conseils.length ? `<ul class="liste-conseils" id="conseils">${conseils.slice(0, 8).map(ligne).join('')}</ul>${conseils.length > 8 ? `<p style="margin-top:12px"><button class="btn noprint" id="b-plus">Voir les ${conseils.length - 8} autres</button></p>` : ''}` : '<p class="ana-intro">Rien de grave détecté.</p>'}
    </div>
    <div class="bloc"><h2>Vue d'ensemble</h2>
      <div class="moyennes">${Object.entries(moy).map(([k, v]) => barre(k, Math.round(v.reduce((a, b) => a + b, 0) / v.length))).join('')}</div>
    </div>
    <div class="bloc"><h2>Écran par écran</h2>
      <div class="regard noprint"><label for="chaleur">Intensité du regard prédit</label><input id="chaleur" type="range" min="0" max="85" value="55"><span>rouge = beaucoup regardé</span></div>
      <div id="ecrans">${r.screens.map((s, i) => `
        <article class="ecran"><div class="titre"><h3>Écran ${i + 1}</h3><span class="sc" style="color:${couleur(s.score)}">${s.score}</span></div>
          <div class="vue" data-i="${i}"><img alt="Capture de l'écran ${i + 1}" src="${esc(s.image)}"></div>
          <div><div class="moyennes" style="grid-template-columns:1fr;gap:10px">${s.checks.map(c => barre(c.nom, c.score, c.conseil)).join('')}</div>
            <div class="cerveau"><h3>Cerveau (réaction prédite)</h3><p class="petit" style="margin-bottom:8px">Percentile par rapport à ~500 pages web : 50 = comme un site moyen. Indicatif, hors note.</p>
              ${Object.entries(s.brain).map(([k, v]) => `<div class="critere"><div class="nom">${esc(k)}<span class="petit">${v}</span></div><div class="piste"><i style="width:${v}%;background:#8f86c9"></i></div></div>`).join('')}
              ${s.brainNotes?.length ? `<ul>${s.brainNotes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</div></div>
        </article>`).join('')}</div>
    </div>
    <div class="bloc methode"><h2>Comment lire ce rapport</h2>
      ${r.mode === 'image' ? `<p><b>Ce que Mona a fait.</b> Elle a découpé ton image en ${n} écran${n > 1 ? 's' : ''} de 1440 × 900 et lu l'interface avec son détecteur d'éléments (textes, boutons, images…), puis estimé tailles et couleurs. Sans le code de la page, la note est <b>indicative</b> : écart moyen d'environ 5,5 points sur 100 avec la lecture d'une vraie page.</p>` : ''}
      ${r.mode === 'image' ? '' : `<p><b>Ce que Mona a fait.</b> Elle a ouvert l'adresse dans un navigateur sans interface (1440 × 900), fait défiler la page jusqu'à ${n} écran${n > 1 ? 's' : ''} en attendant les animations, et relevé le texte, les tailles et les couleurs de chaque écran. ${r.seconds_capture ? `La capture a pris ${r.seconds_capture} s. ` : ''}Le serveur ne garde rien.</p>`}
      <p><b>Le regard.</b> Deux petits modèles appris sur de vrais regards (UEyes, 62 personnes, 1 980 interfaces) prédisent la zone regardée pendant les 3 premières secondes ; Mona fait la moyenne. C'est une prédiction, pas une mesure : elle ne dit pas ce qui plaît.</p>
      <p><b>Le cerveau.</b> Un modèle appris sur des mesures IRM (THINGS-fMRI) prédit la réaction de 20 zones du cortex visuel. Il est indicatif, il n'entre pas dans la note et n’a pas encore été validé sur des pages web.</p>
      <p><b>La note.</b> Moyenne pondérée de six règles, par écran ; le premier écran compte pour moitié, les autres pour l'autre moitié.</p>
      <table class="poids"><tr><th>Règle</th><th>Poids</th><th>Ce qui est mesuré</th></tr>${Object.keys(POIDS).map(k => `<tr><td>${esc(k)}</td><td>${POIDS[k]}</td><td>${esc(EXPLIQUE[k])}</td></tr>`).join('')}</table>
      <p><b>Limites.</b> Mona prépare un test avec de vraies personnes, elle ne le remplace pas. Les pages derrière une connexion, un bandeau bloquant ou une protection anti-robot peuvent donner un rapport partiel.</p>
    </div>`;
  // chaleur : un canvas par écran, dessiné une fois ; le curseur règle seulement l'opacité
  app.querySelectorAll('.vue').forEach(v => { const s = r.screens[+v.dataset.i]; v.appendChild(heatCanvas(s.att)); });
  const ch = app.querySelector('#chaleur'); ch.oninput = () => app.style.setProperty('--chaleur', ch.value / 100);
  const plus = app.querySelector('#b-plus');
  if (plus) plus.onclick = () => { app.querySelector('#conseils').innerHTML = conseils.map(ligne).join(''); plus.remove(); };
  app.querySelector('#b-json').onclick = () => telecharger(`mona-${slug(r.url)}.json`, empaqueter(r), 'application/json');
  const nouveau = app.querySelector('#b-nouveau'); if (nouveau) nouveau.onclick = () => { vueOutil(); versHaut(); };
  const pdf = app.querySelector('#b-pdf'); if (pdf) pdf.onclick = () => window.print();
  const sup = app.querySelector('#b-sup');
  if (sup) sup.onclick = async () => { if (confirm('Supprimer ce rapport de cet appareil ?')) { await DB.supprimer(r.id); location.hash = '#/'; } };
  const sav = app.querySelector('#b-save');
  if (sav) sav.onclick = async () => { const c = {...r, id: nouvelId()}; c.thumb = c.thumb || await miniature(c.screens[0].image); await DB.ecrire(c); location.hash = '#/r/' + c.id; };
  versHaut();
}

// ------------------------------------------------------------------ points d'entree
export function initOutil(racine) {
  app = racine; MODE = 'outil';
  vueOutil();
  const battement = () => fetch('/api/ping').catch(() => {});     // le serveur s'arrête quand la fenêtre est fermée
  battement(); setInterval(battement, 4000);
}

export function initHistorique(racine) {
  app = racine; MODE = 'historique';
  async function route() {
    const h = location.hash;
    if (h.startsWith('#/r/')) {
      let r = null;
      try { r = await DB.lire(decodeURIComponent(h.slice(4))); } catch (e) {}
      if (!r) { app.innerHTML = '<h1 class="ana-mot">Rapport</h1><div class="alerte">Ce rapport n\'est pas sur cet appareil (les rapports sont gardés localement). Importe un fichier exporté, ou refais l\'analyse.</div><div class="outils"><a class="btn" href="#/">Mes analyses</a></div>'; return; }
      return vueRapport(r);
    }
    if (h === '#/demo') {
      try { return vueRapport(depaqueter(await (await fetch(BASE + 'demo/exemple.json')).text()), true); }
      catch (e) { app.innerHTML = '<div class="alerte">Rapport d\'exemple indisponible.</div>'; return; }
    }
    return vueHistorique();
  }
  addEventListener('hashchange', route);
  route();
}
