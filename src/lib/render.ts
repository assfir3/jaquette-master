import Konva from 'konva';
import { PT_TO_MM, clipRect, type Geometry, type Layer } from './model';

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
      return new Konva.Image({ ...common, image: l.tint ? tinted(a, l.tint) : a.img, width: l.width, height: l.height });
    }
    case 'rect':
      return new Konva.Rect({
        ...common,
        width: l.width,
        height: l.height,
        fill: l.fill,
        cornerRadius: l.cornerRadius,
      });
    case 'text':
      return new Konva.Text({
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
