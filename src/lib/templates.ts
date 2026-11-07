// Modèles de mise en page automatique. Chaque modèle compose le boîtier entier
// (face, tranche, dos) à partir des visuels choisis ; tout reste modifiable ensuite.
// Les styles s'inspirent des boîtes de jeux du commerce sans reprendre la charte d'une marque.

import { autoDiscLayout, spineColor, truncate, type AutoLayoutInput } from './autolayout';
import {
  PT_TO_MM,
  coverCrop,
  coverRect,
  geometry,
  newImageLayer,
  newRectLayer,
  newTextLayer,
  rgba,
  type ClipTarget,
  type Doc,
  type Geometry,
  type ImageLayer,
  type Layer,
  type PanelId,
  type RectLayer,
  type TextLayer,
} from './model';
import type { LoadedAsset } from './render';

export type TemplateStyle = 'affiche' | 'bandeau' | 'epure' | 'magazine' | 'officiel';

export const TEMPLATE_STYLES: { id: TemplateStyle; name: string; hint: string }[] = [
  { id: 'affiche', name: 'Affiche', hint: 'Grand visuel en haut du dos qui se fond dans la couleur du jeu' },
  { id: 'bandeau', name: 'Bandeau PC', hint: 'Bandeau clair en haut, façon boîte PC des années 2000' },
  { id: 'epure', name: 'Épuré', hint: 'Fond uni, texte centré, mosaïque de captures' },
  { id: 'magazine', name: 'Magazine', hint: 'Bannière en haut, captures en colonne, texte à côté' },
];

export interface TemplateInput extends AutoLayoutInput {
  /** Texte du bandeau plateforme (« PC DVD-ROM »…). */
  platform: string;
  /** Scans officiels (MobyGames) pour le modèle « officiel ». */
  official?: { front?: LoadedAsset; back?: LoadedAsset; spine?: LoadedAsset; media?: LoadedAsset };
}

export interface TemplateResult {
  layers: Layer[];
  disc: { background: string; layers: Layer[] };
  /** Couleur à donner aux logos rangés au dos (blanc sur fond sombre…). */
  logoTint?: string;
}

// ---------- Petites briques ----------

function image(asset: LoadedAsset, rect: { x: number; y: number; width: number; height: number }, clip: ClipTarget, name: string, extra: Partial<ImageLayer> = {}): ImageLayer {
  return { ...newImageLayer(asset, rect, clip, name), ...extra };
}

/** Image recadrée pour remplir exactement une case (captures, bannières). */
function framed(asset: LoadedAsset, x: number, y: number, w: number, h: number, clip: ClipTarget, name: string, extra: Partial<ImageLayer> = {}): ImageLayer {
  return image(asset, { x, y, width: w, height: h }, clip, name, { crop: coverCrop(asset.width, asset.height, w, h), ...extra });
}

/** Logo contenu dans une boîte, centré. */
function logoIn(asset: LoadedAsset, box: { x: number; y: number; w: number; h: number }, clip: ClipTarget, name: string, align: 'center' | 'left' = 'center'): ImageLayer {
  const k = Math.min(box.w / asset.width, box.h / asset.height);
  const w = asset.width * k;
  const h = asset.height * k;
  const x = align === 'center' ? box.x + (box.w - w) / 2 : box.x;
  return image(asset, { x, y: box.y + (box.h - h) / 2, width: w, height: h }, clip, name);
}

function rect(geo: Geometry, clip: ClipTarget, r: { x: number; y: number; width: number; height: number }, fill: string, name: string, extra: Partial<RectLayer> = {}): RectLayer {
  return { ...newRectLayer(geo, clip), ...r, fill, name, clip, ...extra };
}

function text(geo: Geometry, value: string, x: number, y: number, width: number, name: string, extra: Partial<TextLayer> = {}): TextLayer {
  return {
    ...newTextLayer(geo, 'back', value),
    name,
    x,
    y,
    width,
    fontFamily: 'Inter',
    fontSize: 8.5,
    bold: false,
    align: 'left',
    lineHeight: 1.4,
    shadow: false,
    clip: 'back',
    ...extra,
  };
}

/** Hauteur estimée d'un paragraphe (pour enchaîner les blocs sans chevauchement). */
function textHeight(value: string, width: number, pt: number, lineHeight: number): number {
  const charsPerLine = Math.max(10, width / (pt * PT_TO_MM * 0.5));
  const lines = value.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
  return lines * pt * PT_TO_MM * lineHeight;
}

function panelRect(geo: Geometry, id: PanelId) {
  const b = geo.bleed;
  const p = geo.panels[id];
  const left = id === 'back' ? -b : p.x;
  const right = id === 'front' ? p.x + p.w + b : p.x + p.w;
  return { x: left, y: -b, width: right - left, height: geo.H + 2 * b };
}

function frontArt(geo: Geometry, input: TemplateInput, layers: Layer[]) {
  const art = input.cover ?? input.hero;
  if (art) layers.push(image(art, coverRect(geo, 'front', art.width, art.height), 'front', 'Jaquette'));
  else layers.push({ ...newTextLayer(geo, 'front', input.name.toUpperCase()), y: geo.H * 0.4, fontSize: 34 });
}

/** Tranche : couleur, logo pivoté (ou titre), année en bas. */
function spineBlock(geo: Geometry, input: TemplateInput, layers: Layer[], fill: string, topBand?: { fill: string; label: string; color: string }) {
  const s = geo.panels.spine;
  const top = topBand ? 24 : 6;
  layers.push(rect(geo, 'spine', panelRect(geo, 'spine'), fill, 'Couleur tranche'));
  if (topBand) {
    layers.push(rect(geo, 'spine', { x: s.x, y: -geo.bleed, width: s.w, height: 20 + geo.bleed }, topBand.fill, 'Bandeau tranche'));
    layers.push(
      text(geo, topBand.label, s.x, 8, s.w, 'Plateforme tranche', {
        clip: 'spine', fontFamily: 'Oswald', bold: true, fontSize: Math.min(9, s.w * 0.7 / PT_TO_MM), align: 'center', fill: topBand.color,
      }),
    );
  }
  const maxLen = geo.H - top - 34;
  if (input.logo) {
    const k = Math.min(Math.min(maxLen, geo.H * 0.55) / input.logo.width, (s.w - 3) / input.logo.height);
    const len = input.logo.width * k;
    const thick = input.logo.height * k;
    layers.push({ ...image(input.logo, { x: s.x + s.w / 2 + thick / 2, y: top + 6, width: len, height: thick }, 'spine', 'Logo tranche'), rotation: 90 });
  } else {
    layers.push(
      text(geo, input.name.toUpperCase(), s.x + s.w, top + 4, maxLen, 'Titre tranche', {
        clip: 'spine', rotation: 90, height: s.w, verticalAlign: 'middle', fontFamily: 'Oswald', bold: true,
        fontSize: Math.min(20, (s.w * 0.5) / PT_TO_MM), fill: '#ffffff',
      }),
    );
  }
  if (input.year) {
    layers.push(
      text(geo, input.year, s.x + s.w, geo.H - 22, 16, 'Année tranche', {
        clip: 'spine', rotation: 90, height: s.w, verticalAlign: 'middle', align: 'center', fontSize: 7, fill: '#ffffffcc',
      }),
    );
  }
}

const SHOT_STYLE: Partial<ImageLayer> = { cornerRadius: 1.2, borderColor: '#ffffff', borderWidth: 0.35, shadow: true };

// ---------- Modèles ----------

export function buildTemplate(doc: Doc, style: TemplateStyle, input: TemplateInput): TemplateResult {
  const geo = geometry(doc);
  const dark = input.cover ? spineColor(input.cover.img, 0.16) : '#15161a';
  const light = input.cover ? spineColor(input.cover.img, 0.55) : '#3a7bd5';
  const disc = autoDiscLayout(doc, input);
  switch (style) {
    case 'bandeau':
      return { layers: bandeau(geo, input, dark), disc, logoTint: undefined };
    case 'epure':
      return { layers: epure(geo, input, dark, light), disc, logoTint: '#ffffff' };
    case 'magazine':
      return { layers: magazine(geo, input, dark), disc, logoTint: '#ffffff' };
    case 'officiel':
      return official(geo, input, dark, disc);
    default:
      return { layers: affiche(geo, input, dark), disc, logoTint: '#ffffff' };
  }
}

/** Grand visuel en haut du dos qui se fond dans la couleur du jeu. */
function affiche(geo: Geometry, input: TemplateInput, dark: string): Layer[] {
  const layers: Layer[] = [];
  const b = geo.bleed;
  const p = geo.panels.back;
  const s = geo.safe;
  const innerX = p.x + s + 2;
  const innerW = p.w - 2 * s - 4;
  frontArt(geo, input, layers);

  layers.push(rect(geo, 'back', panelRect(geo, 'back'), dark, 'Fond du dos'));
  const heroH = geo.H * 0.52;
  const art = input.hero ?? input.cover;
  if (art) layers.push(framed(art, -b, -b, p.w + b, heroH + b, 'back', 'Visuel du dos'));
  layers.push(rect(geo, 'back', { x: -b, y: -b, width: p.w + b, height: 34 + b }, '#000', 'Ombre haute', { gradient: { from: rgba('#000000', 0.55), to: rgba('#000000', 0) } }));
  layers.push(rect(geo, 'back', { x: -b, y: heroH - 34, width: p.w + b, height: 35 }, dark, 'Fondu', { gradient: { from: rgba(dark, 0), to: dark } }));

  if (input.logo) layers.push(logoIn(input.logo, { x: innerX + 10, y: 7, w: innerW - 20, h: 24 }, 'back', 'Logo dos'));
  else layers.push(text(geo, input.name.toUpperCase(), innerX, 10, innerW, 'Titre dos', { fontFamily: 'Oswald', bold: true, fontSize: 22, align: 'center', fill: '#fff', shadow: true }));

  let y = heroH - 4;
  if (input.summary) {
    const t = truncate(input.summary, 520);
    layers.push(text(geo, t, innerX, y, innerW, 'Résumé', { fill: '#ffffff' }));
    y += textHeight(t, innerW, 8.5, 1.4) + 5;
  }
  const n = Math.min(3, input.screenshots.length);
  if (n) {
    const gap = 3;
    const w = (innerW - gap * (n - 1)) / n;
    const h = (w * 9) / 16;
    const top = Math.min(Math.max(y, heroH + 26), geo.H - s - 26 - h);
    input.screenshots.slice(0, n).forEach((a, i) => layers.push(framed(a, innerX + i * (w + gap), top, w, h, 'back', `Capture ${i + 1}`, SHOT_STYLE)));
  }
  layers.push(rect(geo, 'back', { x: -b, y: geo.H - 26, width: p.w + b, height: 26 + b }, '#000', 'Bas du dos', { gradient: { from: rgba('#000000', 0), to: rgba('#000000', 0.6) } }));
  if (input.credits) layers.push(text(geo, input.credits, innerX, geo.H - s - 8, innerW, 'Crédits', { fontSize: 6.5, fill: '#c9ccd3' }));
  spineBlock(geo, input, layers, dark);
  return layers;
}

/** Bandeau clair en haut, façon boîte PC des années 2000. */
function bandeau(geo: Geometry, input: TemplateInput, dark: string): Layer[] {
  const layers: Layer[] = [];
  const b = geo.bleed;
  const p = geo.panels.back;
  const f = geo.panels.front;
  const s = geo.safe;
  const bandH = 15;
  const bandFill = '#f4f4f2';
  const bandText = '#1b1d22';
  const innerX = p.x + s + 2;
  const innerW = p.w - 2 * s - 4;

  frontArt(geo, input, layers);
  layers.push(rect(geo, 'front', { x: f.x, y: -b, width: f.w + b, height: bandH + b }, bandFill, 'Bandeau face'));
  layers.push(text(geo, input.platform, f.x + s + 1, 3.5, f.w - 2 * s, 'Plateforme face', { clip: 'front', fontFamily: 'Oswald', bold: true, fontSize: 18, fill: bandText, letterSpacing: 0.4 }));

  layers.push(rect(geo, 'back', panelRect(geo, 'back'), dark, 'Fond du dos'));
  layers.push(rect(geo, 'back', { x: -b, y: -b, width: p.w + b, height: bandH + b }, bandFill, 'Bandeau dos'));
  layers.push(text(geo, input.platform, innerX, 3.5, innerW, 'Plateforme dos', { fontFamily: 'Oswald', bold: true, fontSize: 18, fill: bandText, letterSpacing: 0.4 }));

  const art = input.hero ?? input.cover;
  const heroTop = bandH;
  const heroH = 40;
  if (art) layers.push(framed(art, -b, heroTop, p.w + b, heroH, 'back', 'Visuel du dos'));
  layers.push(rect(geo, 'back', { x: -b, y: heroTop + heroH - 22, width: p.w + b, height: 23 }, dark, 'Fondu', { gradient: { from: rgba(dark, 0), to: dark } }));
  if (input.logo) layers.push(logoIn(input.logo, { x: innerX, y: heroTop + heroH - 24, w: innerW * 0.75, h: 20 }, 'back', 'Logo dos', 'left'));

  // Texte à gauche, deux captures empilées à droite, une grande dessous.
  const colGap = 4;
  const shotW = innerW * 0.44;
  const textW = innerW - shotW - colGap;
  const top = heroTop + heroH + 4;
  if (input.summary) layers.push(text(geo, truncate(input.summary, 420), innerX, top, textW, 'Résumé', { fill: '#ffffff', fontSize: 8 }));
  const shots = input.screenshots;
  const sh = (shotW * 9) / 16;
  shots.slice(0, 2).forEach((a, i) => layers.push(framed(a, innerX + textW + colGap, top + i * (sh + 3), shotW, sh, 'back', `Capture ${i + 1}`, SHOT_STYLE)));
  if (input.genres?.length) {
    const g = input.genres.slice(0, 4).map((x) => `▸ ${x}`).join('\n');
    layers.push(text(geo, g, innerX, top + 2 * (sh + 3) + 2, textW, 'Points forts', { fill: '#ffffff', fontFamily: 'Oswald', bold: true, fontSize: 9, lineHeight: 1.5 }));
  }
  // La 3e capture seulement si elle ne mord pas sur le bandeau du bas.
  if (shots[2] && top + 3 * sh + 6 < geo.H - 27) layers.push(framed(shots[2], innerX + textW + colGap, top + 2 * (sh + 3), shotW, sh, 'back', 'Capture 3', SHOT_STYLE));

  layers.push(rect(geo, 'back', { x: -b, y: geo.H - 25, width: p.w + b, height: 25 + b }, bandFill, 'Bandeau bas'));
  if (input.credits) layers.push(text(geo, input.credits, innerX, geo.H - s - 8, innerW, 'Crédits', { fontSize: 6.5, fill: '#4a4d55' }));
  spineBlock(geo, input, layers, dark, { fill: bandFill, label: input.platform.split(/\s+/)[0] ?? 'PC', color: bandText });
  return layers;
}

/** Fond uni, texte centré, mosaïque de captures. */
function epure(geo: Geometry, input: TemplateInput, dark: string, light: string): Layer[] {
  const layers: Layer[] = [];
  const p = geo.panels.back;
  const s = geo.safe;
  const innerX = p.x + s + 4;
  const innerW = p.w - 2 * s - 8;
  frontArt(geo, input, layers);
  layers.push(rect(geo, 'back', panelRect(geo, 'back'), dark, 'Fond du dos'));

  if (input.logo) layers.push(logoIn(input.logo, { x: innerX + 12, y: 12, w: innerW - 24, h: 24 }, 'back', 'Logo dos'));
  else layers.push(text(geo, input.name.toUpperCase(), innerX, 16, innerW, 'Titre dos', { fontFamily: 'Cinzel', bold: true, fontSize: 20, align: 'center', fill: '#fff' }));
  layers.push(rect(geo, 'back', { x: p.x + p.w / 2 - 12, y: 42, width: 24, height: 0.5 }, light, 'Filet'));

  let y = 48;
  if (input.summary) {
    const t = truncate(input.summary, 420);
    layers.push(text(geo, t, innerX, y, innerW, 'Résumé', { align: 'center', fill: '#e8e8ea', lineHeight: 1.5 }));
    y += textHeight(t, innerW, 8.5, 1.5) + 8;
  }
  const shots = input.screenshots;
  if (shots.length) {
    const gap = 2.5;
    const bigW = shots.length > 1 ? innerW * 0.64 : innerW;
    const bigH = (bigW * 9) / 16;
    const top = Math.min(Math.max(y, 92), geo.H - s - 22 - bigH);
    layers.push(framed(shots[0], innerX, top, bigW, bigH, 'back', 'Capture 1', { cornerRadius: 1.5 }));
    const smallW = innerW - bigW - gap;
    const smallH = (bigH - gap) / 2;
    shots.slice(1, 3).forEach((a, i) => layers.push(framed(a, innerX + bigW + gap, top + i * (smallH + gap), smallW, smallH, 'back', `Capture ${i + 2}`, { cornerRadius: 1.5 })));
  }
  if (input.credits) layers.push(text(geo, input.credits, innerX, geo.H - s - 8, innerW, 'Crédits', { fontSize: 6.5, fill: '#b9bcc4', align: 'center' }));
  spineBlock(geo, input, layers, dark);
  return layers;
}

/** Bannière en haut, captures en colonne à gauche, texte à droite. */
function magazine(geo: Geometry, input: TemplateInput, dark: string): Layer[] {
  const layers: Layer[] = [];
  const b = geo.bleed;
  const p = geo.panels.back;
  const s = geo.safe;
  const innerX = p.x + s + 2;
  const innerW = p.w - 2 * s - 4;
  frontArt(geo, input, layers);
  layers.push(rect(geo, 'back', panelRect(geo, 'back'), dark, 'Fond du dos'));

  const bannerH = 50;
  const art = input.hero ?? input.cover;
  if (art) layers.push(framed(art, -b, -b, p.w + b, bannerH + b, 'back', 'Bannière'));
  layers.push(rect(geo, 'back', { x: -b, y: bannerH - 28, width: p.w + b, height: 29 }, dark, 'Fondu', { gradient: { from: rgba(dark, 0), to: dark } }));
  if (input.logo) layers.push(logoIn(input.logo, { x: innerX, y: bannerH - 26, w: innerW * 0.7, h: 22 }, 'back', 'Logo dos', 'left'));
  else layers.push(text(geo, input.name.toUpperCase(), innerX, bannerH - 18, innerW, 'Titre dos', { fontFamily: 'Anton', fontSize: 24, fill: '#fff', bold: false }));

  const top = bannerH + 5;
  const colW = innerW * 0.46;
  const gap = 4;
  const shotH = (colW * 9) / 16;
  input.screenshots.slice(0, 3).forEach((a, i) => layers.push(framed(a, innerX, top + i * (shotH + 3), colW, shotH, 'back', `Capture ${i + 1}`, SHOT_STYLE)));
  const tx = innerX + colW + gap;
  const tw = innerW - colW - gap;
  let y = top;
  if (input.genres?.length) {
    layers.push(text(geo, input.genres.slice(0, 3).join(' · ').toUpperCase(), tx, y, tw, 'Genres', { fontFamily: 'Oswald', bold: true, fontSize: 8, fill: '#ffffffaa', letterSpacing: 0.3 }));
    y += 7;
  }
  if (input.summary) layers.push(text(geo, truncate(input.summary, 480), tx, y, tw, 'Résumé', { fill: '#ffffff', fontSize: 8 }));
  if (input.credits) layers.push(text(geo, input.credits, innerX, geo.H - s - 8, innerW, 'Crédits', { fontSize: 6.5, fill: '#b9bcc4' }));
  spineBlock(geo, input, layers, dark);
  return layers;
}

/** Scans officiels (MobyGames) : face, dos, tranche et disque tels qu'en magasin. */
function official(geo: Geometry, input: TemplateInput, dark: string, fallbackDisc: TemplateResult['disc']): TemplateResult {
  const o = input.official ?? {};
  const layers: Layer[] = [];
  const place = (a: LoadedAsset | undefined, id: PanelId, name: string) => {
    if (a) layers.push(image(a, coverRect(geo, id, a.width, a.height), id, name));
  };
  if (o.front) place(o.front, 'front', 'Face officielle');
  else frontArt(geo, input, layers);
  if (o.back) place(o.back, 'back', 'Dos officiel');
  else layers.push(...affiche(geo, input, dark).filter((l) => l.clip === 'back'));
  if (o.spine) place(o.spine, 'spine', 'Tranche officielle');
  else spineBlock(geo, input, layers, dark);

  let disc = fallbackDisc;
  if (o.media) {
    // Le scan du disque couvre le carré de 120 mm ; le masque de la rondelle fait le reste.
    const k = Math.max(120 / o.media.width, 120 / o.media.height);
    const w = o.media.width * k;
    const h = o.media.height * k;
    disc = {
      background: '#ffffff',
      layers: [image(o.media, { x: (120 - w) / 2, y: (120 - h) / 2, width: w, height: h }, 'all', 'Disque officiel')],
    };
  }
  return { layers, disc, logoTint: undefined };
}
