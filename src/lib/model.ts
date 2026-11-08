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
  /** Partie de l'image affichée, en fractions (0–1) de sa largeur et hauteur. */
  crop?: { x: number; y: number; width: number; height: number };
  cornerRadius?: number;
  /** Cadre autour de l'image (épaisseur en mm, 0 = aucun). */
  borderColor?: string;
  borderWidth?: number;
  shadow?: boolean;
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
  gradient?: Gradient;
}

/**
 * Dégradé de couleur ; remplace la couleur unie quand il est présent.
 * Les couleurs acceptent la transparence (#rrggbbaa ou rgba()).
 */
export interface Gradient {
  from: string;
  to: string;
  /** Couleur intermédiaire facultative, au milieu. */
  via?: string;
  /** Linéaire (par défaut) ou radial (du centre vers les bords). */
  kind?: 'linear' | 'radial';
  /** Direction du dégradé linéaire, comme en CSS : 0° vers le haut, 90° vers la droite, 180° (par défaut) vers le bas. */
  angle?: number;
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'diamond' | 'polygon' | 'star' | 'arrow' | 'heart';

export const SHAPES: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: 'rect', label: 'Rectangle', icon: '■' },
  { kind: 'ellipse', label: 'Ellipse', icon: '●' },
  { kind: 'triangle', label: 'Triangle', icon: '▲' },
  { kind: 'diamond', label: 'Losange', icon: '◆' },
  { kind: 'polygon', label: 'Polygone', icon: '⬢' },
  { kind: 'star', label: 'Étoile', icon: '★' },
  { kind: 'arrow', label: 'Flèche', icon: '➜' },
  { kind: 'heart', label: 'Cœur', icon: '♥' },
];

/** Forme géométrique (rectangle, ellipse, étoile…). Le type reste « rect » pour les anciens fichiers. */
export interface RectLayer extends LayerBase {
  type: 'rect';
  /** Rectangle quand absent. */
  shape?: ShapeKind;
  fill: string;
  cornerRadius: number;
  gradient?: Gradient;
  /** Nombre de côtés (polygone) ou de branches (étoile). */
  sides?: number;
  /** Creux de l'étoile : rayon intérieur / rayon extérieur. */
  innerRatio?: number;
  strokeColor?: string;
  /** Épaisseur du contour, en mm (0 = aucun). */
  strokeWidth?: number;
}

export type Layer = ImageLayer | TextLayer | RectLayer;

export interface Doc {
  version: 1;
  title: string;
  template: TemplateId;
  /** Mesures du format « Personnalisé » (mm). */
  custom?: { height: number; panelWidth: number };
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
  if (!(doc.template in TEMPLATES)) doc.template = 'dvd';
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

export type TemplateId = 'dvd' | 'bluray' | 'ps3' | 'ps4' | 'switch' | 'switch2' | 'custom';

export interface CaseTemplate {
  id: TemplateId;
  name: string;
  /** Consoles et supports qui utilisent ce boîtier. */
  hint: string;
  height: number;
  /** Largeur de la face avant (identique au dos). */
  panelWidth: number;
  spineDefault: number;
  spinePresets: { label: string; value: number }[];
  bleed: number;
  /** Marge de sécurité conseillée pour le texte. */
  safe: number;
}

// Dimensions de la jaquette glissée sous le film (format fini, sans fond perdu).
// Les fabricants varient de 1 à 2 mm : en cas de doute, mesure ta boîte et choisis « Personnalisé ».
export const TEMPLATES: Record<TemplateId, CaseTemplate> = {
  dvd: {
    id: 'dvd',
    name: 'DVD / PS2 / Xbox 360 / Wii',
    hint: 'Boîtier DVD standard : PC, PS2, Xbox, Xbox 360, Wii, Wii U, films DVD',
    height: 183,
    panelWidth: 129.5,
    spineDefault: 14,
    spinePresets: [
      { label: 'Standard (14 mm)', value: 14 },
      { label: 'Fin (7 mm)', value: 7 },
      { label: 'Double (22 mm)', value: 22 },
    ],
    bleed: 3,
    safe: 4,
  },
  bluray: {
    id: 'bluray',
    name: 'Blu-ray',
    hint: 'Boîtier Blu-ray de film (bandeau bleu moulé en haut du boîtier)',
    height: 148,
    panelWidth: 128.5,
    spineDefault: 12,
    spinePresets: [
      { label: 'Standard (12 mm)', value: 12 },
      { label: 'Fin (7 mm)', value: 7 },
      { label: 'Épais (14 mm)', value: 14 },
    ],
    bleed: 3,
    safe: 4,
  },
  ps3: {
    id: 'ps3',
    name: 'PS3',
    hint: 'Boîtier PlayStation 3 (taille Blu-ray, bandeau PS3 imprimé sur la jaquette)',
    height: 150,
    panelWidth: 128,
    spineDefault: 14,
    spinePresets: [{ label: 'Standard (14 mm)', value: 14 }],
    bleed: 3,
    safe: 4,
  },
  ps4: {
    id: 'ps4',
    name: 'PS4 / PS5 / Xbox One / Series',
    hint: 'Boîtiers PS4, PS5, Xbox One et Xbox Series (jaquette sur toute la hauteur)',
    height: 160,
    panelWidth: 130,
    spineDefault: 13,
    spinePresets: [
      { label: 'Standard (13 mm)', value: 13 },
      { label: '14 mm', value: 14 },
    ],
    bleed: 3,
    safe: 4,
  },
  switch: {
    id: 'switch',
    name: 'Nintendo Switch',
    hint: 'Boîtier Nintendo Switch (cartouche grise)',
    height: 161,
    panelWidth: 99,
    spineDefault: 10,
    spinePresets: [
      { label: 'Standard (10 mm)', value: 10 },
      { label: 'Double (14 mm)', value: 14 },
    ],
    bleed: 3,
    safe: 3,
  },
  switch2: {
    id: 'switch2',
    name: 'Nintendo Switch 2',
    hint: 'Boîtier Nintendo Switch 2 (cartouche rouge)',
    height: 161,
    panelWidth: 99,
    spineDefault: 10,
    spinePresets: [
      { label: 'Standard (10 mm)', value: 10 },
      { label: 'Double (14 mm)', value: 14 },
    ],
    bleed: 3,
    safe: 3,
  },
  custom: {
    id: 'custom',
    name: 'Personnalisé',
    hint: 'Mesure ta jaquette (hauteur, largeur d\'une face, tranche)',
    height: 183,
    panelWidth: 129.5,
    spineDefault: 14,
    spinePresets: [],
    bleed: 3,
    safe: 4,
  },
};

/** Hauteur et largeur d'une face : celles du gabarit, ou les mesures saisies pour « Personnalisé ». */
export function caseSize(doc: Doc): { height: number; panelWidth: number } {
  const t = TEMPLATES[doc.template] ?? TEMPLATES.dvd;
  if (doc.template === 'custom' && doc.custom) return doc.custom;
  return { height: t.height, panelWidth: t.panelWidth };
}

/** Hauteur approximative d'un texte sans hauteur fixe (lignes × interligne). */
function textHeight(l: Layer): number {
  if (l.type !== 'text') return l.height;
  return l.text.split('\n').length * l.fontSize * PT_TO_MM * l.lineHeight;
}

/**
 * Change de format en gardant la mise en page : chaque élément suit son panneau
 * (dos, tranche, face) et s'adapte à la nouvelle taille.
 */
export function applyFormat(doc: Doc, template: TemplateId, size: { height: number; panelWidth: number }, spine: number) {
  const old = geometry(doc);
  const oldMedia = surfaceGeometry(doc, 'disc');
  doc.template = template;
  if (template === 'custom') doc.custom = { ...size };
  doc.spine = spine;
  const geo = geometry(doc);
  const sy = geo.H / old.H;
  for (const l of doc.layers) {
    // Centre réel de l'élément, rotation comprise (un logo de tranche est tourné de 90° autour de son coin).
    const rad = (l.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const h0 = l.height > 0 ? l.height : textHeight(l);
    const cx = l.x + (l.width / 2) * cos - (h0 / 2) * sin;
    const cy = l.y + (l.width / 2) * sin + (h0 / 2) * cos;
    // Encombrement à l'écran (largeur et hauteur une fois tourné).
    const vx = Math.abs(l.width * cos) + Math.abs(h0 * sin);
    const vy = Math.abs(l.width * sin) + Math.abs(h0 * cos);

    // Un élément « toute la jaquette » plus large qu'une face (fond, image panoramique) suit l'ensemble.
    const panel: ClipTarget = l.clip !== 'all' ? l.clip : vx > old.panels.front.w ? 'all' : panelAt(old, cx);
    const from = panel === 'all' ? { x: 0, w: old.W } : old.panels[panel];
    const to = panel === 'all' ? { x: 0, w: geo.W } : geo.panels[panel];
    const sx = to.w / from.w;
    // Échelle le long de la largeur et de la hauteur propres de l'élément (inversées s'il est vertical).
    const upright = Math.abs(cos) >= Math.abs(sin);
    const sw = upright ? sx : sy;
    const sh = upright ? sy : sx;

    if (l.type === 'image') {
      // Une image garde ses proportions. Un fond qui couvre son panneau grandit pour le couvrir encore ;
      // un logo ou une capture rétrécit pour tenir.
      const covers = vx >= from.w * 0.9 && vy >= old.H * 0.9;
      const k = covers ? Math.max(sx, sy) : Math.min(sx, sy);
      l.width *= k;
      l.height *= k;
    } else if (l.type === 'text') {
      l.width *= sw;
      if (l.height > 0) l.height *= sh;
      l.fontSize = Math.max(4, Math.round(l.fontSize * Math.min(sx, sy) * 10) / 10);
    } else {
      l.width *= sw;
      l.height *= sh;
    }

    if (l.type === 'image' && l.rotation === 0 && vx >= from.w * 0.9 && vy >= old.H * 0.9) {
      // Fond qui couvre son panneau : recadré exactement sur le nouveau panneau (comme « Remplir »),
      // pour ne pas grossir à chaque changement de format.
      Object.assign(l, coverRect(geo, panel, l.width, l.height));
    } else if (l.rotation === 0 && l.type === 'text' && l.height === 0) {
      // Texte droit sans hauteur fixe : on garde son coin haut-gauche (sa hauteur réelle dépend de la police).
      l.x = to.x + (l.x - from.x) * sx;
      l.y *= sy;
    } else {
      // On replace l'élément autour de son nouveau centre, avec la même rotation.
      const ncx = to.x + (cx - from.x) * sx;
      const ncy = cy * sy;
      const h1 = l.height > 0 ? l.height : textHeight(l);
      l.x = ncx - (l.width / 2) * cos + (h1 / 2) * sin;
      l.y = ncy - (l.width / 2) * sin - (h1 / 2) * cos;
    }
  }
  // Disque ↔ cartouche : la deuxième surface change de taille, ses éléments suivent.
  const media = surfaceGeometry(doc, 'disc');
  if (media.W !== oldMedia.W || media.H !== oldMedia.H) {
    const kx = media.W / oldMedia.W;
    const ky = media.H / oldMedia.H;
    const k = Math.max(kx, ky);
    for (const l of doc.disc.layers) {
      if (l.type === 'image') {
        const cx = (l.x + l.width / 2) * kx;
        const cy = (l.y + l.height / 2) * ky;
        l.width *= k;
        l.height *= k;
        l.x = cx - l.width / 2;
        l.y = cy - l.height / 2;
      } else {
        l.x *= kx;
        l.y *= ky;
        l.width *= kx;
        if (l.height > 0) l.height *= ky;
        if (l.type === 'text') l.fontSize = Math.max(3, Math.round(l.fontSize * Math.min(kx, ky) * 10) / 10);
        if (l.type === 'rect') l.cornerRadius *= Math.min(kx, ky);
      }
    }
  }
}

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
  /** Présent pour l'étiquette de cartouche : rayon des coins. */
  cart?: { radius: number };
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

// Étiquette collée sur une cartouche Switch (21 × 31 mm). Pas de cote officielle :
// 18,5 × 25 mm est une mesure de la communauté, à vérifier sur une vraie cartouche.
export const CART = { width: 18.5, height: 25, radius: 1.2, bleed: 1, body: { width: 21, height: 31 } };

/** Les jeux Switch sont sur cartouche : la deuxième surface devient l'étiquette de la cartouche. */
export function usesCartridge(doc: Pick<Doc, 'template'>): boolean {
  return doc.template === 'switch' || doc.template === 'switch2';
}

/**
 * Habillage d'une étiquette de cartouche comme celles du commerce : bandeau rouge et logo en haut,
 * visuel au milieu, bandeau noir avec le code du jeu en bas. Tout reste modifiable.
 */
export function cartLabelFrame(doc: Pick<Doc, 'template'>): Layer[] {
  const geo = cartGeometry();
  const top = 5.2;
  const bottom = 2.6;
  const two = doc.template === 'switch2';
  const text = (name: string, value: string, y: number, extra: Partial<TextLayer>): TextLayer => ({
    ...newTextLayer(geo, 'front', value),
    name,
    x: 0.6,
    y,
    width: geo.W - 1.2,
    clip: 'all',
    shadow: false,
    role: 'cart-frame',
    ...extra,
  });
  return [
    { ...newRectLayer(geo, 'all'), name: 'Bandeau logo', x: -CART.bleed, y: -CART.bleed, width: geo.W + 2 * CART.bleed, height: top + CART.bleed, fill: '#e60012', role: 'cart-frame' },
    text('Logo console', two ? 'NINTENDO SWITCH 2' : 'NINTENDO\nSWITCH', two ? 1.9 : 1.1, { fontFamily: 'Montserrat', fontSize: two ? 4.2 : 4.6, lineHeight: 0.95, letterSpacing: 0.05 }),
    { ...newRectLayer(geo, 'all'), name: 'Bandeau code', x: -CART.bleed, y: geo.H - bottom, width: geo.W + 2 * CART.bleed, height: bottom + CART.bleed, fill: '#111111', role: 'cart-frame' },
    text('Code du jeu', two ? 'LB-XXXXX-FRA' : 'LA-H-XXXXX-FRA', geo.H - bottom + 0.55, { fontFamily: 'Roboto Condensed', fontSize: 3.6, bold: false, letterSpacing: 0.12 }),
  ];
}

/** Zone du visuel sur l'étiquette, entre les deux bandeaux. */
export const CART_ART = { y: 5.2, height: CART.height - 5.2 - 2.6 };

export function cartGeometry(): Geometry {
  const full = { x: 0, w: CART.width };
  return {
    W: CART.width,
    H: CART.height,
    bleed: CART.bleed,
    safe: 1,
    panels: { back: full, spine: full, front: full },
    cart: { radius: CART.radius },
  };
}

export function surfaceGeometry(doc: Doc, surface: SurfaceId): Geometry {
  if (surface === 'case') return geometry(doc);
  return usesCartridge(doc) ? cartGeometry() : discGeometry(doc);
}

/** Nom de la deuxième surface : la rondelle du disque, ou l'étiquette de la cartouche. */
export function mediaName(doc: Pick<Doc, 'template'>): { title: string; lower: string } {
  return usesCartridge(doc) ? { title: 'Cartouche', lower: "l'étiquette de la cartouche" } : { title: 'Rondelle', lower: 'la rondelle' };
}

export function surfaceLayers(doc: Doc, surface: SurfaceId): Layer[] {
  return surface === 'disc' ? doc.disc.layers : doc.layers;
}

export function surfaceBackground(doc: Doc, surface: SurfaceId): string {
  return surface === 'disc' ? doc.disc.background : doc.background;
}

export function geometry(doc: Doc): Geometry {
  const t = TEMPLATES[doc.template] ?? TEMPLATES.dvd;
  const { height, panelWidth: pw } = caseSize(doc);
  const s = doc.spine;
  return {
    W: pw * 2 + s,
    H: height,
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

/** Nouveau projet, dans le format du précédent (on enchaîne souvent les jeux d'une même console). */
export function newDoc(format?: Pick<Doc, 'template' | 'custom' | 'spine'>): Doc {
  const template = format && format.template in TEMPLATES ? format.template : 'dvd';
  return {
    version: 1,
    title: '',
    template,
    custom: template === 'custom' ? format?.custom : undefined,
    spine: template === 'custom' ? format!.spine : TEMPLATES[template].spineDefault,
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

/** Forme posée au centre d'un panneau (ou de la rondelle). */
export function newShapeLayer(geo: Geometry, kind: ShapeKind, panel: PanelId = 'front'): RectLayer {
  const p = geo.disc || geo.cart ? { x: 0, w: geo.W } : geo.panels[panel];
  const size = Math.min(40, p.w * 0.4);
  const width = kind === 'arrow' ? size * 1.5 : size;
  const label = SHAPES.find((s) => s.kind === kind)?.label ?? 'Forme';
  return {
    id: uid(),
    type: 'rect',
    shape: kind,
    name: label,
    x: p.x + (p.w - width) / 2,
    y: (geo.H - size) / 2,
    width,
    height: size,
    rotation: 0,
    opacity: 1,
    clip: 'all',
    fill: '#ff5a3c',
    cornerRadius: 0,
    sides: kind === 'star' ? 5 : 6,
    innerRatio: 0.45,
    strokeColor: '#ffffff',
    strokeWidth: 0,
  };
}

/** Résolution réelle d'une image une fois imprimée à sa taille. */
export function effectiveDpi(asset: Asset, layer: { width: number }): number {
  return Math.round(asset.width / (layer.width / 25.4));
}

/** Recadrage qui remplit une case de proportions w × h (centré, comme « couvrir »). */
export function coverCrop(iw: number, ih: number, w: number, h: number): ImageLayer['crop'] {
  const target = w / h;
  const ratio = iw / ih;
  if (ratio > target) {
    const width = target / ratio;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = ratio / target;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Décompose une couleur (#rgb, #rrggbb, #rrggbbaa ou rgba()) en teinte hexadécimale et opacité. */
export function parseColor(c: string): { hex: string; alpha: number } {
  const m = c.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/);
  if (m) {
    const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('');
    return { hex, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  }
  let h = c.replace('#', '');
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  return { hex: '#' + (h.slice(0, 6) || '000000'), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}

/** Couleur au format #rrggbb, ou #rrggbbaa si elle est transparente. */
export function formatColor(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return a === 255 ? hex : hex + a.toString(16).padStart(2, '0');
}

/** Couleur hexadécimale avec transparence, au format rgba(). */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
