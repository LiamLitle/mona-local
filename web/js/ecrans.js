// Image envoyee (capture, maquette, export Figma) -> ecrans de 1440 x 900, comme pour une page en ligne.
export const W = 1440, H = 900, MAX_ECRANS = 6;

// Telephones et tablettes : l'analyse (modeles de 60 Mo, calcul lourd) n'y est pas proposee
export const SUR_TELEPHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
export const MESSAGE_TELEPHONE = 'L’analyse n’est pas disponible sur téléphone. Essaie sur un ordinateur (Chrome, Edge ou Firefox).';

export async function versEcrans(bmp) {
  const h = Math.max(1, Math.round(bmp.height * W / bmp.width));
  const tops = [];
  if (h <= H) tops.push(0); else { for (let y = 0; y + H <= h; y += H) tops.push(y); if (tops[tops.length - 1] + H < h) tops.push(h - H); }
  const grand = document.createElement('canvas'); grand.width = W; grand.height = Math.max(h, H);
  const g = grand.getContext('2d', {willReadFrequently: true});
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, grand.height);
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, W, h);
  if (h < H) {                                                             // image plus courte qu'un ecran : on prolonge avec la couleur du bas
    const bas = g.getImageData(0, h - 1, 1, 1).data; g.fillStyle = `rgb(${bas[0]},${bas[1]},${bas[2]})`; g.fillRect(0, h, W, H - h);
  }
  const lot = tops.slice(0, MAX_ECRANS);
  return {
    ecrans: lot.map(y => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(grand, 0, y, W, H, 0, 0, W, H);
      return {y, canvas: c, data: c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H)};
    }),
    tronque: tops.length > lot.length, total: tops.length, hauteur: h,
  };
}
