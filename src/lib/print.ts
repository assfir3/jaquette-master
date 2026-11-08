import { jsPDF } from 'jspdf';
import { CART, DISC, TEMPLATES, geometry, usesCartridge, type Doc } from './model';
import type { LoadedAsset } from './render';
import { renderToCanvas } from './export';
import { download, slugify } from './storage';

// ---------- Formats de papier ----------

export interface Paper {
  id: string;
  label: string;
  /** Portrait, en mm. */
  w: number;
  h: number;
}

export const PAPERS: Paper[] = [
  { id: 'a4', label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  { id: 'a3', label: 'A3 (297 × 420 mm)', w: 297, h: 420 },
  { id: 'letter', label: 'US Letter (216 × 279 mm)', w: 215.9, h: 279.4 },
  { id: 'legal', label: 'US Legal (216 × 356 mm)', w: 215.9, h: 355.6 },
  { id: 'custom', label: 'Personnalisé…', w: 210, h: 297 },
];

// ---------- Planches pour la rondelle ----------

export interface DiscSheet {
  id: string;
  label: string;
  hint: string;
  page: { w: number; h: number };
  /** Diamètre de l'étiquette (ou du cercle à découper), en mm. */
  diameter: number;
  /** Diamètre du trou central de l'étiquette, en mm. */
  hole: number;
  /** Centre de chaque étiquette sur la feuille, en mm depuis le coin haut gauche. */
  centers: { x: number; y: number }[];
  /** Feuille ordinaire à découper : on suit la zone imprimable réglée pour la rondelle. */
  plain?: boolean;
}

// Les positions exactes varient d'une marque à l'autre : la planche de test sert à les vérifier.
export const DISC_SHEETS: DiscSheet[] = [
  {
    id: 'plain-a4',
    label: 'Papier ordinaire A4 · 1 rondelle à découper',
    hint: 'Cercles de découpe en pointillés, aux dimensions réglées pour la rondelle.',
    page: { w: 210, h: 297 },
    diameter: 120,
    hole: 15,
    centers: [{ x: 105, y: 80 }],
    plain: true,
  },
  {
    id: 'label-a4-full',
    label: 'Planche A4 · 2 étiquettes Ø 117 mm, plein visage',
    hint: 'Étiquettes qui couvrent presque tout le disque (trou ≈ 17 mm), type Avery L7676 / J8676. Vérifie les positions avec la planche de test.',
    page: { w: 210, h: 297 },
    diameter: 117,
    hole: 17,
    centers: [
      { x: 105, y: 74.25 },
      { x: 105, y: 222.75 },
    ],
  },
  {
    id: 'label-a4-std',
    label: 'Planche A4 · 2 étiquettes Ø 117 mm, centre 41 mm',
    hint: 'Étiquettes classiques avec un grand trou central. Vérifie les positions avec la planche de test.',
    page: { w: 210, h: 297 },
    diameter: 117,
    hole: 41,
    centers: [
      { x: 105, y: 74.25 },
      { x: 105, y: 222.75 },
    ],
  },
  {
    id: 'custom',
    label: 'Planche personnalisée…',
    hint: 'Saisis les cotes indiquées sur l’emballage de tes étiquettes.',
    page: { w: 210, h: 297 },
    diameter: 117,
    hole: 41,
    centers: [{ x: 105, y: 74.25 }],
  },
];

// ---------- Imprimantes qui impriment directement sur le disque ----------

export interface CdPrinter {
  id: string;
  label: string;
  software: string;
  /** Diamètre intérieur minimal accepté par le logiciel (mm), quand on le connaît. */
  minInner?: number;
  steps: string[];
}

export const CD_PRINTERS: CdPrinter[] = [
  {
    id: 'epson',
    label: 'Epson (tiroir CD/DVD)',
    software: 'Epson Print CD ou Epson Photo+',
    minInner: 18,
    steps: [
      'Ouvre Epson Print CD (ou Epson Photo+) et choisis un disque 12 cm.',
      'Règle les diamètres intérieur et extérieur sur ceux de tes disques (voir Rondelle).',
      'Importe l’image PNG en arrière-plan : elle fait exactement 120 mm.',
      'Imprime avec le type de support « CD/DVD ».',
    ],
  },
  {
    id: 'canon',
    label: 'Canon PIXMA (plateau disque)',
    software: 'Easy-PhotoPrint Editor',
    steps: [
      'Dans Easy-PhotoPrint Editor, choisis « Étiquette de disque (CD/DVD/BD) ».',
      'Dans Avancé… › Zone d’impression, règle les diamètres sur ceux de tes disques.',
      'Ajoute l’image PNG et ajuste-la au disque : elle fait exactement 120 mm.',
      'Place le disque sur le plateau quand l’imprimante le demande.',
    ],
  },
  {
    id: 'other',
    label: 'Autre imprimante / logiciel',
    software: 'le logiciel de ton imprimante',
    steps: [
      'Utilise l’image PNG de 120 mm (300 dpi, transparente autour et au centre)…',
      '…ou le PDF au format exact 120 × 120 mm, imprimé à 100 % sans mise à l’échelle.',
    ],
  },
];

// ---------- Réglages (gardés dans le navigateur : ils dépendent de l'imprimante, pas du projet) ----------

export interface Calibration {
  /** Décalage de l'impression, en mm (positif : vers la droite / vers le bas). */
  dx: number;
  dy: number;
  /** Échelle en % (100 = taille réelle). */
  scale: number;
}

export interface PrintSettings {
  case: {
    paper: string;
    customW: number;
    customH: number;
    bleed: boolean;
    marks: boolean;
    calib: Calibration;
  };
  disc: {
    mode: 'sheet' | 'direct';
    sheet: string;
    custom: { pageW: number; pageH: number; diameter: number; hole: number; count: 1 | 2; x: number; y: number; pitch: number };
    /** Remplir toutes les étiquettes de la planche (sinon une seule). */
    fill: boolean;
    outline: boolean;
    printer: string;
    calib: Calibration;
  };
}

const KEY = 'jaquette-master:print';

export function defaultPrintSettings(): PrintSettings {
  return {
    case: { paper: 'a4', customW: 210, customH: 297, bleed: true, marks: true, calib: { dx: 0, dy: 0, scale: 100 } },
    disc: {
      mode: 'sheet',
      sheet: 'plain-a4',
      custom: { pageW: 210, pageH: 297, diameter: 117, hole: 41, count: 2, x: 105, y: 74.25, pitch: 148.5 },
      fill: true,
      outline: false,
      printer: 'epson',
      calib: { dx: 0, dy: 0, scale: 100 },
    },
  };
}

export function loadPrintSettings(): PrintSettings {
  const base = defaultPrintSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved) return base;
    return {
      case: { ...base.case, ...saved.case, calib: { ...base.case.calib, ...saved.case?.calib } },
      disc: {
        ...base.disc,
        ...saved.disc,
        custom: { ...base.disc.custom, ...saved.disc?.custom },
        calib: { ...base.disc.calib, ...saved.disc?.calib },
      },
    };
  } catch {
    return base;
  }
}

export function savePrintSettings(s: PrintSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Stockage indisponible : les réglages durent le temps de la session.
  }
}

// ---------- Plan d'une feuille : ce qu'on imprime, et où ----------

export type ArtId = 'case' | 'disc' | 'disc-label';

export interface SheetPlan {
  page: { w: number; h: number };
  images: { art: ArtId; x: number; y: number; w: number; h: number; crop?: { x: number; y: number; w: number; h: number } }[];
  circles: { cx: number; cy: number; r: number; dashed: boolean }[];
  lines: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }[];
  texts: { x: number; y: number; text: string; align?: 'left' | 'center' }[];
  warnings: string[];
}

function emptyPlan(w: number, h: number): SheetPlan {
  return { page: { w, h }, images: [], circles: [], lines: [], texts: [], warnings: [] };
}

/** Marge sous laquelle beaucoup d'imprimantes de bureau n'impriment plus. */
const PRINTER_MARGIN = 4;

/** Applique le calibrage (échelle autour du centre de la page, puis décalage) à tout le plan. */
function calibrate(plan: SheetPlan, c: Calibration): SheetPlan {
  const k = c.scale / 100;
  const cx = plan.page.w / 2;
  const cy = plan.page.h / 2;
  const X = (x: number) => cx + (x - cx) * k + c.dx;
  const Y = (y: number) => cy + (y - cy) * k + c.dy;
  return {
    ...plan,
    images: plan.images.map((i) => ({ ...i, x: X(i.x), y: Y(i.y), w: i.w * k, h: i.h * k })),
    circles: plan.circles.map((o) => ({ ...o, cx: X(o.cx), cy: Y(o.cy), r: o.r * k })),
    lines: plan.lines.map((l) => ({ ...l, x1: X(l.x1), y1: Y(l.y1), x2: X(l.x2), y2: Y(l.y2) })),
  };
}

export function paperSize(s: PrintSettings['case']): { w: number; h: number } {
  if (s.paper === 'custom') return { w: s.customW, h: s.customH };
  const p = PAPERS.find((x) => x.id === s.paper) ?? PAPERS[0];
  return { w: p.w, h: p.h };
}

/** La jaquette sur une feuille : orientation choisie automatiquement, centrée, avec ses traits de coupe. */
export function casePlan(doc: Doc, s: PrintSettings['case'], test = false): SheetPlan {
  const geo = geometry(doc);
  const b = s.bleed ? geo.bleed : 0;
  const cw = geo.W + 2 * b;
  const ch = geo.H + 2 * b;
  const p = paperSize(s);
  // Paysage si la jaquette y tient mieux.
  const landscape = Math.min(p.h - cw, p.w - ch) > Math.min(p.w - cw, p.h - ch);
  const page = landscape ? { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h) } : { w: Math.min(p.w, p.h), h: Math.max(p.w, p.h) };
  const plan = emptyPlan(page.w, page.h);
  const ox = (page.w - cw) / 2;
  const oy = (page.h - ch) / 2;
  const margin = Math.min(ox, oy);

  if (margin < 0) {
    plan.warnings.push(
      `La jaquette (${round(cw)} × ${round(ch)} mm) ne tient pas sur ce papier (${round(page.w)} × ${round(page.h)} mm). Choisis un format plus grand${s.bleed ? ' ou retire le fond perdu' : ''}.`,
    );
  } else if (margin < PRINTER_MARGIN) {
    plan.warnings.push(
      `Il ne reste que ${round(margin)} mm de marge : beaucoup d’imprimantes n’impriment pas si près du bord. Active l’impression sans marge${s.bleed ? ' ou retire le fond perdu' : ''}.`,
    );
  }

  const trim = { x: ox + b, y: oy + b, w: geo.W, h: geo.H };
  if (test) {
    // Planche de test : seulement les contours, pour vérifier la position et l'échelle.
    rect(plan, trim.x, trim.y, trim.w, trim.h, false);
    for (const x of [trim.x + geo.panels.spine.x, trim.x + geo.panels.front.x]) plan.lines.push({ x1: x, y1: trim.y, x2: x, y2: trim.y + trim.h, dashed: true });
  } else {
    plan.images.push({
      art: 'case',
      x: ox,
      y: oy,
      w: cw,
      h: ch,
      crop: b === geo.bleed ? undefined : { x: geo.bleed, y: geo.bleed, w: geo.W, h: geo.H },
    });
  }

  if (s.marks && margin >= 3) {
    const gap = s.bleed ? 1 : 2;
    const len = Math.max(2, Math.min(6, margin - gap - 1));
    const top = oy - gap;
    const bottom = oy + ch + gap;
    const left = ox - gap;
    const right = ox + cw + gap;
    for (const x of [trim.x, trim.x + trim.w]) {
      plan.lines.push({ x1: x, y1: top, x2: x, y2: top - len }, { x1: x, y1: bottom, x2: x, y2: bottom + len });
    }
    for (const y of [trim.y, trim.y + trim.h]) {
      plan.lines.push({ x1: left, y1: y, x2: left - len, y2: y }, { x1: right, y1: y, x2: right + len, y2: y });
    }
    for (const x of [trim.x + geo.panels.spine.x, trim.x + geo.panels.front.x]) {
      plan.lines.push({ x1: x, y1: top, x2: x, y2: top - len, dashed: true }, { x1: x, y1: bottom, x2: x, y2: bottom + len, dashed: true });
    }
    if (margin >= 9) {
      plan.texts.push({
        x: trim.x,
        y: bottom + len + 2.5,
        text: `${doc.title || 'Sans titre'} · ${TEMPLATES[doc.template].name} ${round(geo.W)} × ${geo.H} mm · tranche ${geo.panels.spine.w} mm · imprimer à 100 %`,
      });
    }
  } else if (s.marks) {
    plan.warnings.push('Pas assez de marge pour les traits de coupe : ils sont omis.');
  }
  // Règle au milieu de la jaquette, là où il n'y a rien d'autre.
  if (test) addRuler(plan, trim.y + trim.h / 2);
  return calibrate(plan, s.calib);
}

export function sheetOf(s: PrintSettings['disc']): DiscSheet {
  if (s.sheet === 'custom') {
    const c = s.custom;
    const centers = [{ x: c.x, y: c.y }];
    if (c.count === 2) centers.push({ x: c.x, y: c.y + c.pitch });
    const base = DISC_SHEETS.find((d) => d.id === 'custom')!;
    return { ...base, page: { w: c.pageW, h: c.pageH }, diameter: c.diameter, hole: c.hole, centers };
  }
  return DISC_SHEETS.find((d) => d.id === s.sheet) ?? DISC_SHEETS[0];
}

/**
 * Étiquettes de cartouche (Switch) sur une feuille A4 de papier autocollant :
 * une seule ou la feuille remplie (4 × 6), contour de coupe en pointillés.
 */
export function cartPlan(doc: Doc, s: PrintSettings['disc'], test = false): SheetPlan {
  const plan = emptyPlan(210, 297);
  const b = CART.bleed;
  const w = CART.width + 2 * b;
  const h = CART.height + 2 * b;
  const gap = 10;
  const cols = s.fill ? 4 : 1;
  const rows = s.fill ? 6 : 1;
  const x0 = (210 - (cols * w + (cols - 1) * gap)) / 2;
  const y0 = 30;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gap);
      const y = y0 + r * (h + gap);
      if (!test) plan.images.push({ art: 'disc', x, y, w, h });
      // Contour de coupe : le bord de l'étiquette (sans le fond perdu).
      const L = x + b, T = y + b, R = L + CART.width, B = T + CART.height;
      plan.lines.push(
        { x1: L, y1: T, x2: R, y2: T, dashed: true },
        { x1: R, y1: T, x2: R, y2: B, dashed: true },
        { x1: R, y1: B, x2: L, y2: B, dashed: true },
        { x1: L, y1: B, x2: L, y2: T, dashed: true },
      );
    }
  const bottom = y0 + rows * (h + gap);
  plan.texts.push({
    x: 105,
    y: bottom + 2,
    align: 'center',
    text: `${doc.title || 'Sans titre'} · cartouche ${CART.width} × ${CART.height} mm · découper sur les pointillés · 100 %`,
  });
  if (test) addRuler(plan, Math.min(bottom + 14, 280));
  return calibrate(plan, s.calib);
}

/** La rondelle sur une planche d'étiquettes ou une feuille à découper (ou l'étiquette de cartouche, pour la Switch). */
export function discPlan(doc: Doc, s: PrintSettings['disc'], test = false): SheetPlan {
  if (usesCartridge(doc)) return cartPlan(doc, s, test);
  const sheet = sheetOf(s);
  const plan = emptyPlan(sheet.page.w, sheet.page.h);
  const centers = s.fill ? sheet.centers : sheet.centers.slice(0, 1);
  const outer = sheet.plain ? doc.disc.outer : sheet.diameter;
  const inner = sheet.plain ? doc.disc.inner : sheet.hole;

  for (const c of centers) {
    const size = DISC.size;
    if (c.x - outer / 2 < 0 || c.y - outer / 2 < 0 || c.x + outer / 2 > sheet.page.w || c.y + outer / 2 > sheet.page.h) {
      plan.warnings.push('Une étiquette dépasse de la feuille : vérifie les cotes de la planche.');
    }
    if (!test) plan.images.push({ art: sheet.plain ? 'disc' : 'disc-label', x: c.x - size / 2, y: c.y - size / 2, w: size, h: size });
    if (test || s.outline || sheet.plain) {
      plan.circles.push({ cx: c.x, cy: c.y, r: outer / 2, dashed: true }, { cx: c.x, cy: c.y, r: inner / 2, dashed: true });
    }
    if (test) {
      plan.lines.push({ x1: c.x - 4, y1: c.y, x2: c.x + 4, y2: c.y }, { x1: c.x, y1: c.y - 4, x2: c.x, y2: c.y + 4 });
    }
  }

  const last = centers[centers.length - 1];
  if (sheet.plain && last.y + outer / 2 + 10 < sheet.page.h) {
    plan.texts.push({
      x: last.x,
      y: last.y + outer / 2 + 8,
      align: 'center',
      text: `${doc.title || 'Sans titre'} · rondelle ${doc.disc.outer} mm, centre ${doc.disc.inner} mm · découper sur les pointillés · imprimer à 100 %`,
    });
  }
  if (test) {
    // Règle sous la dernière étiquette s'il y a la place, sinon entre les deux.
    const below = last.y + outer / 2 + 18;
    const y = below < sheet.page.h - 10 ? below : centers.length > 1 ? (centers[0].y + centers[1].y) / 2 : sheet.page.h - 10;
    addRuler(plan, y);
  }
  return calibrate(plan, s.calib);
}

/** Règle de 100 mm sur la planche de test : pour vérifier que l'imprimante ne réduit pas. */
function addRuler(plan: SheetPlan, y: number) {
  const x = (plan.page.w - 100) / 2;
  plan.lines.push({ x1: x, y1: y, x2: x + 100, y2: y });
  for (let i = 0; i <= 10; i++) plan.lines.push({ x1: x + i * 10, y1: y, x2: x + i * 10, y2: y - (i % 5 === 0 ? 4 : 2) });
  plan.texts.push({ x: plan.page.w / 2, y: y + 5, align: 'center', text: 'Cette règle doit mesurer exactement 100 mm. Sinon, corrige l’échelle.' });
}

function rect(plan: SheetPlan, x: number, y: number, w: number, h: number, dashed: boolean) {
  plan.lines.push(
    { x1: x, y1: y, x2: x + w, y2: y, dashed },
    { x1: x + w, y1: y, x2: x + w, y2: y + h, dashed },
    { x1: x + w, y1: y + h, x2: x, y2: y + h, dashed },
    { x1: x, y1: y + h, x2: x, y2: y, dashed },
  );
}

const round = (v: number) => Math.round(v * 10) / 10;

// ---------- Images à imprimer ----------

/**
 * Prépare les images d'un plan à la résolution voulue.
 * « disc-label » : la rondelle sur tout le disque (sans la zone imprimable réglée), détourée à l'étiquette + 1,5 mm.
 */
export async function renderArts(
  doc: Doc,
  assets: Map<string, LoadedAsset>,
  arts: Set<ArtId>,
  dpi: number,
  sheet?: DiscSheet,
): Promise<Map<ArtId, HTMLCanvasElement>> {
  const out = new Map<ArtId, HTMLCanvasElement>();
  if (arts.has('case')) out.set('case', await renderToCanvas(doc, assets, dpi, 'case'));
  if (arts.has('disc')) out.set('disc', await renderToCanvas(doc, assets, dpi, 'disc'));
  if (arts.has('disc-label') && sheet) {
    const full: Doc = { ...doc, disc: { ...doc.disc, outer: DISC.size, inner: DISC.hole } };
    const art = await renderToCanvas(full, assets, dpi, 'disc');
    const k = art.width / DISC.size;
    const c = document.createElement('canvas');
    c.width = art.width;
    c.height = art.height;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(c.width / 2, c.height / 2, Math.min(DISC.size, sheet.diameter + 3) / 2 * k, 0, Math.PI * 2);
    g.arc(c.width / 2, c.height / 2, Math.max(0, sheet.hole - 2) / 2 * k, 0, Math.PI * 2, true);
    g.clip('evenodd');
    g.drawImage(art, 0, 0);
    out.set('disc-label', c);
  }
  return out;
}

export function artsOf(plan: SheetPlan): Set<ArtId> {
  return new Set(plan.images.map((i) => i.art));
}

/** Image sur fond blanc (JPEG compact pour le PDF), éventuellement recadrée (en mm). */
function flatten(src: HTMLCanvasElement, crop: SheetPlan['images'][number]['crop'], mmW: number): string {
  const k = src.width / mmW;
  const sx = crop ? crop.x * k : 0;
  const sy = crop ? crop.y * k : 0;
  const sw = crop ? crop.w * k : src.width;
  const sh = crop ? crop.h * k : src.height;
  const c = document.createElement('canvas');
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.95);
}

/** Largeur réelle (mm) de chaque image source, pour retrouver l'échelle au recadrage. */
function artWidthMm(doc: Doc, art: ArtId): number {
  if (art === 'case') {
    const g = geometry(doc);
    return g.W + 2 * g.bleed;
  }
  return DISC.size;
}

export function planToPdf(plan: SheetPlan, arts: Map<ArtId, HTMLCanvasElement>, doc: Doc, title: string): jsPDF {
  const { w, h } = plan.page;
  const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'mm', format: [w, h], compress: true });
  pdf.setProperties({ title, creator: 'Jaquette Master' });
  const cache = new Map<string, string>();
  plan.images.forEach((im) => {
    const src = arts.get(im.art);
    if (!src) return;
    const key = `${im.art}:${JSON.stringify(im.crop ?? null)}`;
    if (!cache.has(key)) cache.set(key, flatten(src, im.crop, artWidthMm(doc, im.art)));
    // L'alias évite d'intégrer plusieurs fois la même image (planche de 2 étiquettes).
    pdf.addImage(cache.get(key)!, 'JPEG', im.x, im.y, im.w, im.h, key, 'NONE');
  });
  pdf.setDrawColor(120);
  pdf.setLineWidth(0.15);
  for (const c of plan.circles) {
    pdf.setLineDashPattern(c.dashed ? [1, 0.8] : [], 0);
    pdf.circle(c.cx, c.cy, c.r, 'S');
  }
  for (const l of plan.lines) {
    pdf.setDrawColor(l.dashed ? 120 : 0);
    pdf.setLineDashPattern(l.dashed ? [0.8, 0.6] : [], 0);
    pdf.line(l.x1, l.y1, l.x2, l.y2);
  }
  pdf.setLineDashPattern([], 0);
  pdf.setFontSize(7);
  pdf.setTextColor(100);
  for (const t of plan.texts) pdf.text(t.text, t.x, t.y, { align: t.align ?? 'left' });
  return pdf;
}

/** Dessine le plan dans un canvas (aperçu à l'écran). */
export function drawPlan(
  ctx: CanvasRenderingContext2D,
  plan: SheetPlan,
  arts: Map<ArtId, HTMLCanvasElement>,
  doc: Doc,
  k: number,
  /** Feuille de papier (fond blanc, marges de l'imprimante) ou disque seul. */
  paper = true,
) {
  ctx.clearRect(0, 0, plan.page.w * k, plan.page.h * k);
  if (paper) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, plan.page.w * k, plan.page.h * k);
    // Zone où beaucoup d'imprimantes n'impriment pas.
    ctx.strokeStyle = '#e4e6eb';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(PRINTER_MARGIN * k, PRINTER_MARGIN * k, (plan.page.w - 2 * PRINTER_MARGIN) * k, (plan.page.h - 2 * PRINTER_MARGIN) * k);
    ctx.setLineDash([]);
  }
  for (const im of plan.images) {
    const src = arts.get(im.art);
    if (!src) continue;
    const s = src.width / artWidthMm(doc, im.art);
    const c = im.crop;
    if (c) ctx.drawImage(src, c.x * s, c.y * s, c.w * s, c.h * s, im.x * k, im.y * k, im.w * k, im.h * k);
    else ctx.drawImage(src, im.x * k, im.y * k, im.w * k, im.h * k);
  }
  ctx.lineWidth = 1;
  for (const c of plan.circles) {
    ctx.strokeStyle = '#8a8f99';
    ctx.setLineDash(c.dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.arc(c.cx * k, c.cy * k, c.r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const l of plan.lines) {
    ctx.strokeStyle = l.dashed ? '#8a8f99' : '#111111';
    ctx.setLineDash(l.dashed ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(l.x1 * k, l.y1 * k);
    ctx.lineTo(l.x2 * k, l.y2 * k);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#666a73';
  ctx.font = `${Math.max(7, 2.6 * k)}px Inter, sans-serif`;
  for (const t of plan.texts) {
    ctx.textAlign = t.align === 'center' ? 'center' : 'left';
    ctx.fillText(t.text, t.x * k, t.y * k);
  }
}

// ---------- Exports ----------

export async function exportSheet(
  doc: Doc,
  assets: Map<string, LoadedAsset>,
  kind: 'case' | 'disc',
  settings: PrintSettings,
  test: boolean,
) {
  const plan = kind === 'case' ? casePlan(doc, settings.case, test) : discPlan(doc, settings.disc, test);
  const arts = await renderArts(doc, assets, artsOf(plan), 300, kind === 'disc' ? sheetOf(settings.disc) : undefined);
  const what = kind === 'case' ? 'jaquette' : usesCartridge(doc) ? 'cartouche' : 'rondelle';
  const name = `${slugify(doc.title)}-${what}${test ? '-planche-de-test' : ''}.pdf`;
  planToPdf(plan, arts, doc, `${doc.title || 'Jaquette'} — ${what}`).save(name);
}

/** Impression directe sur CD : image de 120 mm à 300 dpi, transparente, avec sa résolution inscrite. */
export async function exportDirectPng(doc: Doc, assets: Map<string, LoadedAsset>) {
  const canvas = await renderToCanvas(doc, assets, 300, 'disc');
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export PNG impossible'))), 'image/png'),
  );
  download(await withDpi(blob, 300), `${slugify(doc.title)}-rondelle-120mm.png`);
}

/** Impression directe sur CD : PDF au format exact 120 × 120 mm. */
export async function exportDirectPdf(doc: Doc, assets: Map<string, LoadedAsset>) {
  const art = await renderToCanvas(doc, assets, 300, 'disc');
  const pdf = new jsPDF({ unit: 'mm', format: [DISC.size, DISC.size], compress: true });
  pdf.setProperties({ title: `${doc.title || 'Rondelle'} — rondelle 120 mm`, creator: 'Jaquette Master' });
  // Fond blanc : l'imprimante ne dépose pas d'encre sur le blanc, et le JPEG reste léger.
  pdf.addImage(flatten(art, undefined, DISC.size), 'JPEG', 0, 0, DISC.size, DISC.size, undefined, 'NONE');
  pdf.save(`${slugify(doc.title)}-rondelle-120mm.pdf`);
}

/**
 * Inscrit la résolution dans le PNG (bloc pHYs) : sans elle, les logiciels d'impression
 * supposent 72 ou 96 dpi et l'image n'arrive pas à 120 mm.
 */
export async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // « pHYs »
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unité : le mètre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Juste après l'en-tête PNG (8 octets) et le bloc IHDR (25 octets).
  const at = 33;
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(bytes.subarray(at), at + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
