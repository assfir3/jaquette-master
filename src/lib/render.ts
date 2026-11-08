import Konva from 'konva';
import { PT_TO_MM, clipRect, type Geometry, type Gradient, type Layer, type RectLayer } from './model';

export interface LoadedAsset {
  id: string;
  src: string;
  width: number;
  height: number;
  img: HTMLImageElement;
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** Version unie de l'image (garde la transparence, remplace les couleurs). */
function tinted(a: LoadedAsset, color: string): HTMLCanvasElement {
  const key = `${a.id}:${color}`;
  let c = tintCache.get(key);
  if (!c) {
    const k = Math.min(1, 2400 / Math.max(a.width, a.height));
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(a.width * k));
    c.height = Math.max(1, Math.round(a.height * k));
    const g = c.getContext('2d')!;
    g.drawImage(a.img, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    if (tintCache.size > 200) tintCache.clear();
    tintCache.set(key, c);
  }
  return c;
}

export function fontStyle(l: { bold: boolean; italic: boolean }): string {
  return [l.italic ? 'italic' : '', l.bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal';
}

/** Propriétés Konva d'un dégradé appliqué à une boîte de w × h mm. */
export function gradientFill(g: Gradient, w: number, h: number): Konva.ShapeConfig {
  const stops = g.via ? [0, g.from, 0.5, g.via, 1, g.to] : [0, g.from, 1, g.to];
  const c = { x: w / 2, y: h / 2 };
  if (g.kind === 'radial') {
    return {
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: c,
      fillRadialGradientEndPoint: c,
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.hypot(w, h) / 2,
      fillRadialGradientColorStops: stops,
    };
  }
  // Comme en CSS : la ligne du dégradé passe par le centre et touche les coins opposés.
  const a = ((g.angle ?? 180) * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: c.x - dx * half, y: c.y - dy * half },
    fillLinearGradientEndPoint: { x: c.x + dx * half, y: c.y + dy * half },
    fillLinearGradientColorStops: stops,
  };
}

type Pen = { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void };

function polygon(ctx: Pen, pts: [number, number][]) {
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

/** Points d'un polygone régulier ou d'une étoile inscrit dans la boîte w × h. */
function radial(w: number, h: number, n: number, inner?: number): [number, number][] {
  const count = inner === undefined ? n : n * 2;
  return Array.from({ length: count }, (_, i) => {
    const r = inner !== undefined && i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)];
  });
}

/** Trace le contour d'une forme dans sa boîte (0, 0) – (w, h). */
export function tracePath(ctx: Pen, l: Pick<RectLayer, 'shape' | 'sides' | 'innerRatio'>, w: number, h: number) {
  switch (l.shape) {
    case 'ellipse': {
      // Quatre arcs de Bézier (k ≈ 0,5523 : approximation standard du cercle).
      const k = 0.5523, rx = w / 2, ry = h / 2;
      ctx.moveTo(w, ry);
      ctx.bezierCurveTo(w, ry + k * ry, rx + k * rx, h, rx, h);
      ctx.bezierCurveTo(rx - k * rx, h, 0, ry + k * ry, 0, ry);
      ctx.bezierCurveTo(0, ry - k * ry, rx - k * rx, 0, rx, 0);
      ctx.bezierCurveTo(rx + k * rx, 0, w, ry - k * ry, w, ry);
      return;
    }
    case 'triangle':
      return polygon(ctx, [[w / 2, 0], [w, h], [0, h]]);
    case 'diamond':
      return polygon(ctx, [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'polygon':
      return polygon(ctx, radial(w, h, Math.max(3, l.sides ?? 6)));
    case 'star':
      return polygon(ctx, radial(w, h, Math.max(3, l.sides ?? 5), l.innerRatio ?? 0.45));
    case 'arrow':
      return polygon(ctx, [[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]]);
    case 'heart':
      ctx.moveTo(w / 2, h);
      ctx.bezierCurveTo(w * 0.15, h * 0.72, 0, h * 0.5, 0, h * 0.28);
      ctx.bezierCurveTo(0, h * 0.08, w * 0.15, 0, w * 0.28, 0);
      ctx.bezierCurveTo(w * 0.4, 0, w * 0.48, h * 0.08, w / 2, h * 0.2);
      ctx.bezierCurveTo(w * 0.52, h * 0.08, w * 0.6, 0, w * 0.72, 0);
      ctx.bezierCurveTo(w * 0.85, 0, w, h * 0.08, w, h * 0.28);
      ctx.bezierCurveTo(w, h * 0.5, w * 0.85, h * 0.72, w / 2, h);
      return;
    default:
      return polygon(ctx, [[0, 0], [w, 0], [w, h], [0, h]]);
  }
}

function makeNode(l: Layer, assets: Map<string, LoadedAsset>): Konva.Shape {
  const common = {
    x: l.x,
    y: l.y,
    rotation: l.rotation,
    opacity: l.opacity,
  };
  switch (l.type) {
    case 'image': {
      const a = assets.get(l.assetId);
      if (!a) {
        return new Konva.Rect({ ...common, width: l.width, height: l.height, fill: '#ff00ff55' });
      }
      const src = l.tint ? tinted(a, l.tint) : a.img;
      // Taille réelle de la source (un SVG sans taille déclarée renvoie 0).
      const sw = l.tint ? src.width : a.width;
      const sh = l.tint ? src.height : a.height;
      return new Konva.Image({
        ...common,
        image: src,
        width: l.width,
        height: l.height,
        crop: l.crop
          ? { x: l.crop.x * sw, y: l.crop.y * sh, width: l.crop.width * sw, height: l.crop.height * sh }
          : undefined,
        cornerRadius: l.cornerRadius ?? 0,
        stroke: l.borderWidth ? l.borderColor ?? '#ffffff' : undefined,
        strokeWidth: l.borderWidth ?? 0,
        shadowEnabled: !!l.shadow,
        shadowColor: '#000000',
        shadowBlur: 3,
        shadowOffset: { x: 0.6, y: 0.8 },
        shadowOpacity: 0.55,
      });
    }
    case 'rect': {
      const look: Konva.ShapeConfig = {
        ...common,
        width: l.width,
        height: l.height,
        fill: l.fill,
        ...(l.gradient ? gradientFill(l.gradient, l.width, l.height) : {}),
        stroke: l.strokeWidth ? l.strokeColor ?? '#ffffff' : undefined,
        strokeWidth: l.strokeWidth ?? 0,
        lineJoin: 'round',
      };
      if (!l.shape || l.shape === 'rect') return new Konva.Rect({ ...look, cornerRadius: l.cornerRadius });
      return new Konva.Shape({
        ...look,
        sceneFunc(ctx, shape) {
          ctx.beginPath();
          tracePath(ctx, l, shape.width(), shape.height());
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        },
      });
    }
    case 'text': {
      const node = new Konva.Text({
        ...common,
        width: l.width,
        height: l.height > 0 ? l.height : undefined,
        text: l.text,
        fontFamily: `"${l.fontFamily}"`,
        fontSize: l.fontSize * PT_TO_MM,
        fontStyle: fontStyle(l),
        fill: l.fill,
        align: l.align,
        verticalAlign: l.verticalAlign,
        letterSpacing: l.letterSpacing,
        lineHeight: l.lineHeight,
        stroke: l.strokeWidth > 0 ? l.strokeColor : undefined,
        strokeWidth: l.strokeWidth,
        fillAfterStrokeEnabled: true,
        shadowEnabled: l.shadow,
        shadowColor: '#000000',
        shadowBlur: 1.2,
        shadowOffset: { x: 0.35, y: 0.35 },
        shadowOpacity: 0.7,
      });
      if (l.gradient) node.setAttrs(gradientFill(l.gradient, node.width(), node.height()));
      return node;
    }
  }
}

export interface Scene {
  background: string;
  layers: Layer[];
}

/** Masque en anneau de la rondelle (zone imprimable autour du trou). */
function discClip(geo: Geometry) {
  const c = geo.W / 2;
  const R = geo.disc!.outer / 2;
  const r = geo.disc!.inner / 2;
  return (ctx: Konva.Context) => {
    ctx.arc(c, c, R, 0, Math.PI * 2, false);
    ctx.moveTo(c + r, c);
    ctx.arc(c, c, r, 0, Math.PI * 2, true);
  };
}

/**
 * Construit une surface (boîtier ou rondelle) dans `root`, en coordonnées mm.
 * Utilisé à la fois pour l'écran et pour l'export haute définition.
 */
export function buildScene(
  root: Konva.Group,
  scene: Scene,
  geo: Geometry,
  assets: Map<string, LoadedAsset>,
  interactive: boolean,
): Map<string, Konva.Shape> {
  const nodes = new Map<string, Konva.Shape>();
  const b = geo.bleed;
  const target = geo.disc ? new Konva.Group({ clipFunc: discClip(geo) }) : root;
  if (target !== root) root.add(target);
  target.add(
    new Konva.Rect({
      x: -b,
      y: -b,
      width: geo.W + 2 * b,
      height: geo.H + 2 * b,
      fill: scene.background,
      listening: false,
    }),
  );
  for (const l of scene.layers) {
    if (l.hidden) continue;
    const node = makeNode(l, assets);
    node.id(l.id);
    node.draggable(interactive && !l.locked);
    node.listening(interactive && !l.locked);
    const group = new Konva.Group({ clip: clipRect(geo, l.clip) });
    group.add(node);
    target.add(group);
    nodes.set(l.id, node);
  }
  return nodes;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

/** Attend que les polices utilisées soient prêtes avant de dessiner. */
export async function ensureFonts(layers: Layer[]): Promise<void> {
  const loads = layers
    .filter((l) => l.type === 'text')
    .map((l) => document.fonts.load(`${fontStyle(l)} 20px "${l.fontFamily}"`, l.text || 'A').catch(() => []));
  await Promise.all(loads);
}
