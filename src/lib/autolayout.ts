import {
  coverRect,
  CART_ART,
  cartGeometry,
  cartLabelFrame,
  discGeometry,
  usesCartridge,
  newImageLayer,
  newRectLayer,
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
  genres?: string[];
  cover?: LoadedAsset;
  hero?: LoadedAsset;
  logo?: LoadedAsset;
  screenshots: LoadedAsset[];
}

export function truncate(text: string, max: number): string {
  const first = text.split(/\n\n/)[0];
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

/** Couleur de tranche : teinte dominante de la jaquette, assombrie pour rester lisible. */
export function spineColor(img: HTMLImageElement, lightness = 0.2): string {
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
  return hslToHex(h, Math.min(0.7, sat * 1.1), lightness);
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
  if (usesCartridge(doc)) return autoCartLayout(doc, input);
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

/**
 * Étiquette de cartouche (Switch) comme celles du commerce : bandeau rouge et logo console en haut,
 * jaquette du jeu au milieu, bandeau noir et code du jeu en bas.
 */
function autoCartLayout(doc: Doc, input: AutoLayoutInput): { background: string; layers: Layer[] } {
  const geo = cartGeometry();
  const layers: Layer[] = [];
  const art = input.cover ?? input.hero;
  if (art) {
    // Le visuel déborde sur les côtés dans le fond perdu, pour ne pas laisser de filet blanc à la découpe.
    const zone = { x: -geo.bleed, y: CART_ART.y, width: geo.W + 2 * geo.bleed, height: CART_ART.height };
    const k = Math.max(zone.width / art.width, zone.height / art.height);
    const w = art.width * k;
    const h = art.height * k;
    layers.push(newImageLayer(art, { x: zone.x + (zone.width - w) / 2, y: zone.y + (zone.height - h) / 2, width: w, height: h }, 'all', 'Visuel cartouche'));
  } else if (input.logo) {
    const k = Math.min((geo.W - 3) / input.logo.width, 8 / input.logo.height);
    const w = input.logo.width * k;
    const h = input.logo.height * k;
    layers.push(newImageLayer(input.logo, { x: (geo.W - w) / 2, y: CART_ART.y + (CART_ART.height - h) / 2, width: w, height: h }, 'all', 'Logo cartouche'));
  }
  layers.push(...cartLabelFrame(doc));
  return { background: '#ffffff', layers };
}
