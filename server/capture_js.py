"""Scripts JavaScript partages (capture locale et serveur de capture) : defilement et releve du code de la page."""

# Choisit l'element qui defile vraiment (fenetre, ou bloc interieur sur certains sites).
SCROLLER_JS = r"""
() => {
  const se = document.scrollingElement || document.documentElement;
  if (se.scrollHeight > se.clientHeight + 10) { window.__mona = se; return 'fenetre'; }
  let best = null;
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 10 && el.clientHeight > innerHeight * 0.5 &&
        (!best || el.scrollHeight > best.scrollHeight)) best = el;
  }
  window.__mona = best || se;
  return best ? 'bloc interieur' : 'fenetre';
}
"""

# Code de la page en coordonnees de PAGE (pas d'ecran). Elements fixes/colles : coordonnees d'ecran.
DOM_FULL_JS = r"""
() => {
  const sc = window.__mona, top0 = sc.scrollTop;
  const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0,0,0,0]; };
  const bgOf = el => {
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      const v = parse(c);
      if ((v.length < 4 || v[3] > 0.5) && c !== 'rgba(0, 0, 0, 0)') return v.slice(0,3);
      el = el.parentElement;
    }
    return [255,255,255];
  };
  const fixedCache = new Map();
  const isFixed = el => {
    if (!el || el === document.body) return false;
    if (fixedCache.has(el)) return fixedCache.get(el);
    const pos = getComputedStyle(el).position;
    const v = pos === 'fixed' || pos === 'sticky' || isFixed(el.parentElement);
    fixedCache.set(el, v);
    return v;
  };
  const place = (el, r) => {
    const fixed = isFixed(el);
    return { fixed, box: [r.left, fixed ? r.top : r.top + top0, r.width, r.height] };
  };
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  // Texte decoratif (aria-hidden) ou dessin declare comme image (role="img", ex. art ASCII) :
  // ce n'est pas du texte a lire, on ne le juge pas comme tel.
  const decoratif = el => !!el.closest('[aria-hidden="true"], [role="img"]');
  while (walker.nextNode()) {
    const n = walker.currentNode, t = n.textContent.trim();
    if (!t || !n.parentElement || seen.has(n.parentElement)) continue;
    const el = n.parentElement; seen.add(el);
    if (decoratif(el)) continue;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    texts.push({ text: t.slice(0, 60), words: t.split(/\s+/).length, size: parseFloat(s.fontSize),
                 weight: parseInt(s.fontWeight) || 400, color: parse(s.color).slice(0,3), bg: bgOf(el),
                 ...place(el, r) });
  }
  const ctas = [];
  document.querySelectorAll('button, a, input[type=submit], [role=button]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) return;
    const s = getComputedStyle(el), bg = parse(s.backgroundColor);
    const filled = bg.length >= 3 && (bg.length < 4 || bg[3] > 0.5) && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const p = place(el, r);
    ctas.push({ text: (el.innerText || el.value || '').trim().slice(0, 40), fixed: p.fixed, box: p.box,
                filled, area: r.width * r.height, bg: filled ? bg.slice(0,3) : null,
                parentBg: el.parentElement ? bgOf(el.parentElement) : [255,255,255] });
  });
  return { texts, ctas, pageHeight: sc.scrollHeight };
}
"""
