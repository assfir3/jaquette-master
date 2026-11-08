import Konva from 'konva';
import { jsPDF } from 'jspdf';
import {
  CART,
  DISC,
  usesCartridge,
  TEMPLATES,
  geometry,
  surfaceBackground,
  surfaceGeometry,
  surfaceLayers,
  type Doc,
  type SurfaceId,
} from './model';
import { buildScene, ensureFonts, type LoadedAsset } from './render';
import { download, slugify } from './storage';

export const EXPORT_DPI = 300;

/** Dessine une surface entière (fond perdu compris) à la résolution d'impression. */
export async function renderToCanvas(
  doc: Doc,
  assets: Map<string, LoadedAsset>,
  dpi = EXPORT_DPI,
  surface: SurfaceId = 'case',
): Promise<HTMLCanvasElement> {
  const layers = surfaceLayers(doc, surface);
  await ensureFonts(layers);
  const geo = surfaceGeometry(doc, surface);
  const k = dpi / 25.4;
  const b = geo.bleed;
  const width = Math.round((geo.W + 2 * b) * k);
  const height = Math.round((geo.H + 2 * b) * k);
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  const root = new Konva.Group({ x: b * k, y: b * k, scaleX: k, scaleY: k });
  layer.add(root);
  buildScene(root, { background: surfaceBackground(doc, surface), layers }, geo, assets, false);
  layer.draw();
  const canvas = stage.toCanvas({ pixelRatio: 1 });
  stage.destroy();
  return canvas;
}

/** Petits aperçus de la tranche et de la face pour l'étagère. */
export async function shelfPreviews(doc: Doc, assets: Map<string, LoadedAsset>): Promise<{ spine: string; front: string }> {
  const dpi = 90;
  const canvas = await renderToCanvas(doc, assets, dpi);
  const geo = geometry(doc);
  const k = dpi / 25.4;
  const crop = (x: number, w: number) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.round(geo.H * k);
    c.getContext('2d')!.drawImage(canvas, Math.round((x + geo.bleed) * k), Math.round(geo.bleed * k), c.width, c.height, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  };
  return {
    spine: crop(geo.panels.spine.x, geo.panels.spine.w),
    front: crop(geo.panels.front.x, geo.panels.front.w),
  };
}

export type PdfMode = 'a4' | 'exact' | 'marks';

export const PDF_MODES: { id: PdfMode; label: string; hint: string }[] = [
  { id: 'a4', label: 'PDF A4 paysage', hint: 'Pour une imprimante maison, avec traits de coupe' },
  { id: 'marks', label: 'PDF avec traits de coupe', hint: 'Format exact + marge de 12 mm pour les repères' },
  { id: 'exact', label: 'PDF format exact', hint: 'Fond perdu compris, sans repères (imprimeur)' },
];

const A4 = { w: 297, h: 210 };
const SLUG = 12;

export async function exportPdf(doc: Doc, assets: Map<string, LoadedAsset>, mode: PdfMode): Promise<string | null> {
  const { pdf, warning } = await buildPdf(doc, assets, mode);
  pdf.save(`${slugify(doc.title)}-jaquette.pdf`);
  return warning;
}

export async function buildPdf(
  doc: Doc,
  assets: Map<string, LoadedAsset>,
  mode: PdfMode,
): Promise<{ pdf: jsPDF; warning: string | null }> {
  const geo = geometry(doc);
  const b = geo.bleed;
  const bw = geo.W + 2 * b;
  const bh = geo.H + 2 * b;
  let warning: string | null = null;

  if (mode === 'a4' && (bw > A4.w || bh > A4.h)) {
    mode = 'marks';
    warning = "La jaquette dépasse d'une feuille A4 : export au format exact avec traits de coupe.";
  }

  const pageW = mode === 'a4' ? A4.w : mode === 'marks' ? bw + 2 * SLUG : bw;
  const pageH = mode === 'a4' ? A4.h : mode === 'marks' ? bh + 2 * SLUG : bh;
  const ox = (pageW - bw) / 2;
  const oy = (pageH - bh) / 2;

  const canvas = await renderToCanvas(doc, assets);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageW, pageH], compress: true });
  pdf.setProperties({ title: doc.title || 'Jaquette', creator: 'Jaquette Master' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', ox, oy, bw, bh, undefined, 'NONE');

  if (mode !== 'exact') drawMarks(pdf, doc, ox, oy, Math.min(ox, oy));
  return { pdf, warning };
}

/** Traits de coupe aux coins et repères de pliage de la tranche. */
function drawMarks(pdf: jsPDF, doc: Doc, ox: number, oy: number, margin: number) {
  const geo = geometry(doc);
  const b = geo.bleed;
  const left = ox + b;
  const top = oy + b;
  const right = left + geo.W;
  const bottom = top + geo.H;
  const gap = 1; // écart entre le fond perdu et le trait
  const len = Math.max(2, Math.min(6, margin - gap - 2));

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.15);
  const outTop = oy - gap;
  const outBottom = oy + geo.H + 2 * b + gap;
  const outLeft = ox - gap;
  const outRight = ox + geo.W + 2 * b + gap;

  for (const x of [left, right]) {
    pdf.line(x, outTop, x, outTop - len);
    pdf.line(x, outBottom, x, outBottom + len);
  }
  for (const y of [top, bottom]) {
    pdf.line(outLeft, y, outLeft - len, y);
    pdf.line(outRight, y, outRight + len, y);
  }

  // Plis de la tranche, en pointillés.
  pdf.setLineDashPattern([0.8, 0.6], 0);
  for (const x of [left + geo.panels.spine.x, left + geo.panels.front.x]) {
    pdf.line(x, outTop, x, outTop - len);
    pdf.line(x, outBottom, x, outBottom + len);
  }
  pdf.setLineDashPattern([], 0);

  if (margin >= 8) {
    const t = TEMPLATES[doc.template];
    pdf.setFontSize(6);
    pdf.setTextColor(90);
    const caption = `${doc.title || 'Sans titre'} · ${t.name} ${geo.W} × ${geo.H} mm · tranche ${geo.panels.spine.w} mm · Jaquette Master`;
    pdf.text(caption, left, outBottom + len + 2.5);
  }
}

export async function exportPng(doc: Doc, assets: Map<string, LoadedAsset>) {
  const canvas = await renderToCanvas(doc, assets);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export PNG impossible'))), 'image/png'),
  );
  download(blob, `${slugify(doc.title)}-jaquette.png`);
}

// ---------- Rondelle ----------

/** PNG carré de 120 mm, transparent autour du disque et dans le trou (pour les logiciels d'impression sur CD). */
export async function exportDiscPng(doc: Doc, assets: Map<string, LoadedAsset>) {
  const canvas = await renderToCanvas(doc, assets, EXPORT_DPI, 'disc');
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export PNG impossible'))), 'image/png'),
  );
  download(blob, `${slugify(doc.title)}-${usesCartridge(doc) ? 'cartouche' : 'rondelle'}.png`);
}

/** Étiquettes de cartouche à taille réelle sur une feuille A4 (6 exemplaires), contour de coupe en pointillés. */
export async function buildCartPdf(doc: Doc, assets: Map<string, LoadedAsset>): Promise<jsPDF> {
  const art = await renderToCanvas(doc, assets, EXPORT_DPI, 'disc');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `${doc.title || 'Cartouche'} — étiquettes de cartouche`, creator: 'Jaquette Master' });
  const b = CART.bleed;
  const w = CART.width + 2 * b;
  const h = CART.height + 2 * b;
  const gap = 8;
  const cols = 3;
  const rows = 2;
  const x0 = (210 - (cols * w + (cols - 1) * gap)) / 2;
  const y0 = 25;
  const data = art.toDataURL('image/png');
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.15);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (w + gap);
      const y = y0 + r * (h + gap);
      // Même image réutilisée : le PDF ne la contient qu'une fois.
      pdf.addImage(data, 'PNG', x, y, w, h, 'cart', 'NONE');
      pdf.setLineDashPattern([0.8, 0.6], 0);
      pdf.roundedRect(x + b, y + b, CART.width, CART.height, CART.radius, CART.radius, 'S');
      pdf.setLineDashPattern([], 0);
    }
  pdf.setFontSize(7);
  pdf.setTextColor(110);
  pdf.text(
    `${doc.title || 'Sans titre'} · cartouche ${CART.width} × ${CART.height} mm · découper sur les pointillés · imprimer à 100 %`,
    105,
    y0 + rows * (h + gap) + 4,
    { align: 'center' },
  );
  return pdf;
}

/** Rondelle à taille réelle sur une feuille A4, avec cercles de découpe (papier autocollant). */
export async function buildDiscPdf(doc: Doc, assets: Map<string, LoadedAsset>): Promise<jsPDF> {
  const art = await renderToCanvas(doc, assets, EXPORT_DPI, 'disc');
  // Fond blanc pour un JPEG compact (le PNG transparent serait bien plus lourd).
  const flat = document.createElement('canvas');
  flat.width = art.width;
  flat.height = art.height;
  const g = flat.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, flat.width, flat.height);
  g.drawImage(art, 0, 0);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: `${doc.title || 'Rondelle'} — rondelle`, creator: 'Jaquette Master' });
  const size = DISC.size;
  const x = (210 - size) / 2;
  const y = 20;
  pdf.addImage(flat.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, size, size, undefined, 'NONE');

  const c = { x: x + size / 2, y: y + size / 2 };
  pdf.setDrawColor(150);
  pdf.setLineWidth(0.15);
  pdf.setLineDashPattern([1, 0.8], 0);
  pdf.circle(c.x, c.y, doc.disc.outer / 2, 'S');
  pdf.circle(c.x, c.y, doc.disc.inner / 2, 'S');
  pdf.setLineDashPattern([], 0);

  pdf.setFontSize(7);
  pdf.setTextColor(110);
  pdf.text(
    `${doc.title || 'Sans titre'} · rondelle ${doc.disc.outer} mm, centre ${doc.disc.inner} mm · découper sur les pointillés · Jaquette Master`,
    105,
    y + size + 8,
    { align: 'center' },
  );
  return pdf;
}

export async function exportDiscPdf(doc: Doc, assets: Map<string, LoadedAsset>) {
  if (usesCartridge(doc)) return (await buildCartPdf(doc, assets)).save(`${slugify(doc.title)}-cartouche.pdf`);
  const pdf = await buildDiscPdf(doc, assets);
  pdf.save(`${slugify(doc.title)}-rondelle.pdf`);
}
