// Toutes les mesures sont en millimètres, l'origine (0,0) est le coin haut-gauche
// du format fini (après coupe). Le fond perdu s'étend de -bleed à W + bleed.

export type PanelId = 'back' | 'spine' | 'front';
export type ClipTarget = PanelId | 'all';

export const PT_TO_MM = 25.4 / 72;

/** Polices chargées depuis Google Fonts (voir index.html). */
export const FONTS = [
  'Oswald', 'Bebas Neue', 'Anton', 'Montserrat', 'Inter', 'Roboto Condensed', 'Cinzel', 'Orbitron', 'Press Start 2P',
];

interface LayerBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  /** Zone hors de laquelle le calque est masqué. */
  clip: ClipTarget;
  hidden?: boolean;
  locked?: boolean;
  /** Rôle libre (ex. « logo:back ») pour ranger les logos côte à côte. */
  role?: string;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  assetId: string;
  /** Recolore l'image d'une seule teinte (logo blanc sur fond sombre…). */
  tint?: string;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  /** Taille en points. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fill: string;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  /** Espacement des lettres, en mm. */
  letterSpacing: number;
  lineHeight: number;
  strokeColor: string;
  /** Épaisseur du contour, en mm (0 = aucun). */
  strokeWidth: number;
  shadow: boolean;
}

export interface RectLayer extends LayerBase {
  type: 'rect';
  fill: string;
  cornerRadius: number;
}

export type Layer = ImageLayer | TextLayer | RectLayer;

export interface Doc {
  version: 1;
  title: string;
  template: TemplateId;
  spine: number;
  background: string;
  layers: Layer[];
  /** Rondelle du CD/DVD : une deuxième surface dans le même projet. */
  disc: DiscSettings;
}

export type SurfaceId = 'case' | 'disc';

export interface DiscSettings {
  /** Diamètre extérieur imprimable, en mm. */
  outer: number;
  /** Diamètre intérieur imprimable (zone autour du trou), en mm. */
  inner: number;
  background: string;
  layers: Layer[];
}

// Un disque fait 120 mm, son trou 15 mm. La zone imprimable dépend des disques :
// « full face » jusqu'à ~22 mm au centre, standard autour de 41 mm.
export const DISC = {
  size: 120,
  hole: 15,
  outerDefault: 118,
  innerDefault: 22,
  outerPresets: [
    { label: '118 mm (conseillé)', value: 118 },
    { label: '116 mm (prudent)', value: 116 },
    { label: '120 mm (bord à bord)', value: 120 },
  ],
  innerPresets: [
    { label: 'Centre imprimable (22 mm)', value: 22 },
    { label: 'Centre standard (41 mm)', value: 41 },
    { label: 'Petit centre (36 mm)', value: 36 },
  ],
};

export function newDisc(): DiscSettings {
  return { outer: DISC.outerDefault, inner: DISC.innerDefault, background: '#15161a', layers: [] };
}

/** Complète un document ancien ou incomplet (fichiers enregistrés avant la rondelle). */
export function normalizeDoc(doc: Doc): Doc {
  if (!doc.disc) doc.disc = newDisc();
  if (!Array.isArray(doc.disc.layers)) doc.disc.layers = [];
  return doc;
}

export interface Asset {
  id: string;
  src: string;
  width: number;
  height: number;
}

// ---------- Gabarits ----------

export type TemplateId = 'dvd';

export interface CaseTemplate {
  id: TemplateId;
  name: string;
  height: number;
  /** Largeur de la face avant (identique au dos). */
  panelWidth: number;
  spineDefault: number;
  spinePresets: { label: string; value: number }[];
  bleed: number;
  /** Marge de sécurité conseillée pour le texte. */
  safe: number;
}

export const TEMPLATES: Record<TemplateId, CaseTemplate> = {
  dvd: {
    id: 'dvd',
    name: 'Boîtier DVD',
    height: 183,
    panelWidth: 129.5,
    spineDefault: 14,
    spinePresets: [
      { label: 'Standard (14 mm)', value: 14 },
      { label: 'Fin (7 mm)', value: 7 },
    ],
    bleed: 3,
    safe: 4,
  },
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Geometry {
  W: number;
  H: number;
  bleed: number;
  safe: number;
  panels: Record<PanelId, { x: number; w: number }>;
  /** Présent pour la rondelle : diamètres imprimables. */
  disc?: { outer: number; inner: number };
}

/** Géométrie de la rondelle : carré de 120 mm, centre en (60, 60). */
export function discGeometry(doc: Doc): Geometry {
  const n = DISC.size;
  const full = { x: 0, w: n };
  return {
    W: n,
    H: n,
    bleed: 0,
    safe: 3,
    panels: { back: full, spine: full, front: full },
    disc: { outer: doc.disc.outer, inner: doc.disc.inner },
  };
}

export function surfaceGeometry(doc: Doc, surface: SurfaceId): Geometry {
  return surface === 'disc' ? discGeometry(doc) : geometry(doc);
}

export function surfaceLayers(doc: Doc, surface: SurfaceId): Layer[] {
  return surface === 'disc' ? doc.disc.layers : doc.layers;
}

export function surfaceBackground(doc: Doc, surface: SurfaceId): string {
  return surface === 'disc' ? doc.disc.background : doc.background;
}

export function geometry(doc: Doc): Geometry {
  const t = TEMPLATES[doc.template];
  const pw = t.panelWidth;
  const s = doc.spine;
  return {
    W: pw * 2 + s,
    H: t.height,
    bleed: t.bleed,
    safe: t.safe,
    panels: {
      back: { x: 0, w: pw },
      spine: { x: pw, w: s },
      front: { x: pw + s, w: pw },
    },
  };
}

/** Zone d'un panneau, fond perdu compris sur les bords extérieurs. */
export function zoneRect(geo: Geometry, target: ClipTarget): Rect {
  const b = geo.bleed;
  const y = -b;
  const height = geo.H + 2 * b;
  switch (target) {
    case 'back':
      return { x: -b, y, width: geo.panels.back.w + b, height };
    case 'spine':
      return { x: geo.panels.spine.x, y, width: geo.panels.spine.w, height };
    case 'front':
      return { x: geo.panels.front.x, y, width: geo.panels.front.w + b, height };
    default:
      return { x: -b, y, width: geo.W + 2 * b, height };
  }
}

/** Zone de masquage : légèrement élargie vers l'intérieur pour éviter un filet blanc au pli. */
export function clipRect(geo: Geometry, target: ClipTarget): Rect {
  const r = zoneRect(geo, target);
  const o = 0.25;
  if (target === 'back') return { ...r, width: r.width + o };
  if (target === 'spine') return { ...r, x: r.x - o, width: r.width + 2 * o };
  if (target === 'front') return { ...r, x: r.x - o, width: r.width + o };
  return r;
}

export function panelAt(geo: Geometry, x: number): PanelId {
  if (x < geo.panels.spine.x) return 'back';
  if (x < geo.panels.front.x) return 'spine';
  return 'front';
}

export const PANEL_LABELS: Record<ClipTarget, string> = {
  back: 'Dos',
  spine: 'Tranche',
  front: 'Face avant',
  all: 'Toute la jaquette',
};

// ---------- Fabriques ----------

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newDoc(): Doc {
  return {
    version: 1,
    title: '',
    template: 'dvd',
    spine: TEMPLATES.dvd.spineDefault,
    background: '#15161a',
    layers: [],
    disc: newDisc(),
  };
}

/** Image qui couvre toute la zone (recadrée), centrée. */
export function coverRect(geo: Geometry, target: ClipTarget, iw: number, ih: number): Rect {
  const r = zoneRect(geo, target);
  const scale = Math.max(r.width / iw, r.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
}

/** Image entièrement visible dans la zone utile (sans fond perdu), avec une marge. */
export function containRect(geo: Geometry, target: ClipTarget, iw: number, ih: number): Rect {
  const z = zoneRect(geo, target);
  const m = target === 'spine' ? 1 : geo.safe;
  const inner =
    target === 'spine'
      ? { x: z.x + m, y: m, width: z.width - 2 * m, height: geo.H - 2 * m }
      : target === 'all'
        ? { x: m, y: m, width: geo.W - 2 * m, height: geo.H - 2 * m }
        : {
            x: geo.panels[target].x + m,
            y: m,
            width: geo.panels[target].w - 2 * m,
            height: geo.H - 2 * m,
          };
  const scale = Math.min(inner.width / iw, inner.height / ih);
  const width = iw * scale;
  const height = ih * scale;
  return { x: inner.x + (inner.width - width) / 2, y: inner.y + (inner.height - height) / 2, width, height };
}

export function newImageLayer(asset: Asset, rect: Rect, clip: ClipTarget, name = 'Image'): ImageLayer {
  return { id: uid(), type: 'image', name, assetId: asset.id, ...rect, rotation: 0, opacity: 1, clip };
}

export function newTextLayer(geo: Geometry, panel: PanelId = 'front', text = 'Texte'): TextLayer {
  const p = geo.panels[panel];
  return {
    id: uid(),
    type: 'text',
    name: 'Texte',
    text,
    x: p.x + geo.safe,
    y: geo.H * 0.1,
    width: p.w - 2 * geo.safe,
    height: 0,
    rotation: 0,
    opacity: 1,
    clip: 'all',
    fontFamily: 'Oswald',
    fontSize: 28,
    bold: true,
    italic: false,
    fill: '#ffffff',
    align: 'center',
    verticalAlign: 'top',
    letterSpacing: 0,
    lineHeight: 1.1,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: true,
  };
}

export function newSpineTitle(geo: Geometry, title: string): TextLayer {
  const s = geo.panels.spine;
  const margin = 8;
  return {
    ...newTextLayer(geo, 'spine', title || 'TITRE DU JEU'),
    name: 'Titre tranche',
    // Rotation de 90° autour du coin (x, y) : le texte se lit de haut en bas.
    x: s.x + s.w,
    y: margin,
    width: geo.H - 2 * margin,
    height: s.w,
    rotation: 90,
    clip: 'spine',
    fontSize: Math.max(6, Math.min(24, (s.w * 0.5) / PT_TO_MM)),
    verticalAlign: 'middle',
    shadow: false,
  };
}

export function newRectLayer(geo: Geometry, target: ClipTarget): RectLayer {
  const r = zoneRect(geo, target);
  return {
    id: uid(),
    type: 'rect',
    name: 'Bande de couleur',
    ...(target === 'spine' ? r : { ...r, height: 22 }),
    rotation: 0,
    opacity: 1,
    clip: target,
    fill: '#1f6feb',
    cornerRadius: 0,
  };
}

/** Résolution réelle d'une image une fois imprimée à sa taille. */
export function effectiveDpi(asset: Asset, layer: { width: number }): number {
  return Math.round(asset.width / (layer.width / 25.4));
}
