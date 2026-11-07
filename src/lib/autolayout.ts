import {
  PT_TO_MM,
  coverRect,
  discGeometry,
  geometry,
  newImageLayer,
  newRectLayer,
  newSpineTitle,
  newTextLayer,
  type Doc,
  type Layer,
} from './model';
import type { LoadedAsset } from './render';

export interface AutoLayoutInput {
  name: string;
  summary: string;
  credits: string;
  year?: string;
  cover?: LoadedAsset;
  hero?: LoadedAsset;
  logo?: LoadedAsset;
  screenshots: LoadedAsset[];
}

/**
 * Compose une jaquette complète à partir des visuels choisis :
 * face = jaquette verticale, dos = fond + logo + résumé + captures, tranche = couleur + logo.
 */
export function autoLayout(doc: Doc, input: AutoLayoutInput): Layer[] {
  const geo = geometry(doc);
  const { back, spine } = geo.panels;
  const s = geo.safe;
  const layers: Layer[] = [];
  const accent = input.cover ? spineColor(input.cover.img) : '#16181d';

  // ----- Face avant -----
  const frontArt = input.cover ?? input.hero;
  if (frontArt) {
    layers.push(newImageLayer(frontArt, coverRect(geo, 'front', frontArt.width, frontArt.height), 'front', 'Jaquette'));
  } else {
    layers.push({ ...newTextLayer(geo, 'front', input.name.toUpperCase()), y: geo.H * 0.4 });
  }

  // ----- Dos -----
  const backArt = input.hero ?? input.cover;
  if (backArt) {
    layers.push(newImageLayer(backArt, coverRect(geo, 'back', backArt.width, backArt.height), 'back', 'Fond du dos'));
  }
  layers.push({
    ...newRectLayer(geo, 'back'),
    name: 'Voile du dos',
    height: geo.H + 2 * geo.bleed,
    fill: '#000000',
    opacity: 0.62,
  });

  const innerX = back.x + s + 2;
  const innerW = back.w - 2 * s - 4;
  let y = 9;
  if (input.logo) {
    const box = { width: innerW * 0.7, height: 26 };
    const k = Math.min(box.width / input.logo.width, box.height / input.logo.height);
    const w = input.logo.width * k;
    const h = input.logo.height * k;
    layers.push(newImageLayer(input.logo, { x: innerX + (innerW - w) / 2, y, width: w, height: h }, 'back', 'Logo dos'));
    y += h + 7;
  } else {
    layers.push({ ...newTextLayer(geo, 'back', input.name.toUpperCase()), name: 'Titre dos', x: innerX, width: innerW, y, fontSize: 22 });
    y += 22 * PT_TO_MM * 1.2 + 7;
  }

  if (input.summary) {
    const text = truncate(input.summary, 560);
    layers.push({
      ...newTextLayer(geo, 'back', text),
      name: 'Résumé',
      x: innerX,
      y,
      width: innerW,
      fontFamily: 'Inter',
      fontSize: 8.5,
      bold: false,
      align: 'left',
      lineHeight: 1.4,
      shadow: false,
    });
    const lines = Math.ceil(text.length / 78) + (text.match(/\n/g)?.length ?? 0);
    y += lines * 8.5 * PT_TO_MM * 1.4 + 7;
  }

  const shots = input.screenshots.slice(0, 3);
  if (shots.length) {
    const gap = 3;
    const w = (innerW - gap * (shots.length - 1)) / shots.length;
    const h = (w * 9) / 16;
    const top = Math.min(Math.max(y, 95), geo.H - 24 - h);
    shots.forEach((a, i) => {
      const x = innerX + i * (w + gap);
      // Recadrage simple : la capture couvre sa case, masquée par un cadre.
      const scale = Math.max(w / a.width, h / a.height);
      layers.push({
        ...newImageLayer(a, { x: x + (w - a.width * scale) / 2, y: top + (h - a.height * scale) / 2, width: a.width * scale, height: a.height * scale }, 'back', `Capture ${i + 1}`),
      });
    });
  }

  if (input.credits) {
    layers.push({
      ...newTextLayer(geo, 'back', input.credits),
      name: 'Crédits',
      x: innerX,
      y: geo.H - s - 8,
      width: innerW,
      fontFamily: 'Inter',
      fontSize: 6.5,
      bold: false,
      fill: '#c9ccd3',
      align: 'left',
      shadow: false,
    });
  }

  // ----- Tranche -----
  layers.push({ ...newRectLayer(geo, 'spine'), name: 'Couleur tranche', fill: accent });
  if (input.logo) {
    // Logo pivoté de 90° : sa largeur suit la hauteur de la tranche.
    const maxLen = geo.H * 0.55;
    const maxThick = spine.w - 3;
    const k = Math.min(maxLen / input.logo.width, maxThick / input.logo.height);
    const len = input.logo.width * k;
    const thick = input.logo.height * k;
    layers.push({
      ...newImageLayer(input.logo, { x: spine.x + spine.w / 2 + thick / 2, y: 14, width: len, height: thick }, 'spine', 'Logo tranche'),
      rotation: 90,
    });
  } else {
    layers.push(newSpineTitle(geo, input.name));
  }

  return layers;
}

function truncate(text: string, max: number): string {
  const first = text.split(/\n\n/)[0];
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

/** Couleur de tranche : teinte dominante de la jaquette, assombrie pour rester lisible. */
export function spineColor(img: HTMLImageElement): string {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  // Moyenne pondérée par la saturation : évite un gris terne.
  let r = 0, gr = 0, b = 0, wsum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    const w = 0.15 + (max - min) / 255;
    r += d[i] * w;
    gr += d[i + 1] * w;
    b += d[i + 2] * w;
    wsum += w;
  }
  const [h, sat] = rgbToHsl(r / wsum, gr / wsum, b / wsum);
  return hslToHex(h, Math.min(0.7, sat * 1.1), 0.2);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Rondelle assortie : grand visuel en fond, logo dans la moitié haute,
 * nom et année en bas. Le fond reprend la couleur de la tranche.
 */
export function autoDiscLayout(doc: Doc, input: AutoLayoutInput): { background: string; layers: Layer[] } {
  const geo = discGeometry(doc);
  const c = geo.W / 2;
  const { outer, inner } = geo.disc!;
  const ringMid = (inner + outer) / 4; // distance du centre au milieu de l'anneau
  const layers: Layer[] = [];
  const background = input.cover ? spineColor(input.cover.img) : '#16181d';

  const art = input.hero ?? input.cover;
  if (art) {
    layers.push(newImageLayer(art, coverRect(geo, 'all', art.width, art.height), 'all', 'Fond rondelle'));
    layers.push({ ...newRectLayer(geo, 'all'), name: 'Voile rondelle', x: 0, y: 0, width: geo.W, height: geo.H, fill: '#000000', opacity: 0.3 });
  }

  if (input.logo) {
    const k = Math.min(70 / input.logo.width, 24 / input.logo.height);
    const w = input.logo.width * k;
    const h = input.logo.height * k;
    layers.push(newImageLayer(input.logo, { x: c - w / 2, y: c - ringMid - h / 2, width: w, height: h }, 'all', 'Logo rondelle'));
  } else {
    layers.push({
      ...newTextLayer(geo, 'front', input.name.toUpperCase()),
      name: 'Titre rondelle',
      x: c - 40,
      width: 80,
      y: c - ringMid - 6,
      fontSize: 22,
      clip: 'all',
    });
  }

  layers.push({
    ...newTextLayer(geo, 'front', [input.name, input.year].filter(Boolean).join(' · ')),
    name: 'Texte bas',
    x: c - 30,
    width: 60,
    y: c + outer / 2 - 13,
    fontFamily: 'Inter',
    fontSize: 7,
    bold: false,
    clip: 'all',
  });

  return { background, layers };
}
