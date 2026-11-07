<script lang="ts">
  import Konva from 'konva';
  import { onMount, untrack } from 'svelte';
  import { editor } from './editor.svelte';
  import {
    PANEL_LABELS,
    DISC,
    panelAt,
    surfaceBackground,
    surfaceGeometry,
    surfaceLayers,
    type Geometry,
    type Layer,
    type PanelId,
  } from './model';
  import { buildScene, ensureFonts, fontStyle } from './render';
  import { VISUAL_MIME } from './search';
  import { LOGO_MIME, type LogoRef } from './logos';

  interface Props {
    onDropFiles: (files: File[], panel: PanelId) => void;
    onDropVisual: (url: string, panel: PanelId) => void;
    onDropLogo: (ref: LogoRef, panel: PanelId) => void;
  }
  let { onDropFiles, onDropVisual, onDropLogo }: Props = $props();

  let host: HTMLDivElement;
  let stage: Konva.Stage;
  let content: Konva.Group;
  let guides: Konva.Group;
  let snapLines: Konva.Group;
  let transformer: Konva.Transformer;
  let nodes = new Map<string, Konva.Shape>();
  let scale = $state(1);
  let size = $state({ w: 0, h: 0 });
  let dropPanel = $state<PanelId | null>(null);

  const PAD = 36;
  const triedFonts = new Set<string>();

  onMount(() => {
    stage = new Konva.Stage({ container: host, width: host.clientWidth, height: host.clientHeight });
    const main = new Konva.Layer();
    const overlay = new Konva.Layer({ listening: true });
    stage.add(main, overlay);
    content = new Konva.Group();
    guides = new Konva.Group({ listening: false });
    snapLines = new Konva.Group({ listening: false });
    main.add(content);
    overlay.add(guides, snapLines);
    transformer = new Konva.Transformer({
      rotationSnaps: [0, 90, 180, 270],
      rotationSnapTolerance: 4,
      borderStroke: '#f5b431',
      anchorStroke: '#f5b431',
      anchorFill: '#1b1d22',
      anchorSize: 9,
      anchorCornerRadius: 2,
      ignoreStroke: true,
    });
    overlay.add(transformer);

    stage.on('mousedown touchstart', (e) => {
      if (e.target.findAncestor('Transformer')) return;
      if (e.target === stage || !e.target.id()) editor.selectedId = null;
    });

    const ro = new ResizeObserver(() => {
      size = { w: host.clientWidth, h: host.clientHeight };
    });
    ro.observe(host);
    const onFonts = () => editor.renderVersion++;
    document.fonts.addEventListener('loadingdone', onFonts);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', onFonts);
      stage.destroy();
    };
  });

  // Mise à l'échelle et reconstruction de la scène quand le document change.
  $effect(() => {
    const doc = $state.snapshot(editor.doc);
    const surface = editor.surface;
    const layers = surfaceLayers(doc, surface);
    const showGuides = editor.showGuides;
    void editor.renderVersion;
    const { w, h } = size;
    if (!stage || w === 0) return;

    const geo = surfaceGeometry(doc, surface);
    const b = geo.bleed;
    const k = Math.max(0.5, Math.min((w - 2 * PAD) / (geo.W + 2 * b), (h - 2 * PAD) / (geo.H + 2 * b)));
    scale = k;
    stage.size({ width: w, height: h });
    const ox = (w - (geo.W + 2 * b) * k) / 2 + b * k;
    const oy = (h - (geo.H + 2 * b) * k) / 2 + b * k;
    for (const g of [content, guides, snapLines]) {
      g.position({ x: ox, y: oy });
      g.scale({ x: k, y: k });
    }

    // Police pas encore chargée : on redessine une fois qu'elle est prête.
    // (une seule tentative par police, pour ne pas boucler hors connexion)
    const missing = layers.filter((l) => {
      if (l.type !== 'text' || l.hidden) return false;
      const font = `${fontStyle(l)} 20px "${l.fontFamily}"`;
      if (triedFonts.has(font) || document.fonts.check(font)) return false;
      triedFonts.add(font);
      return true;
    });
    if (missing.length) ensureFonts(layers).then(() => editor.renderVersion++);

    content.destroyChildren();
    nodes = buildScene(content, { background: surfaceBackground(doc, surface), layers }, geo, editor.assets, true);
    for (const [id, node] of nodes) wireNode(id, node, geo);

    guides.destroyChildren();
    if (showGuides) (geo.disc ? drawDiscGuides : drawGuides)(geo, k);
    // Hors suivi : sinon un simple clic de sélection reconstruirait la scène en plein glisser.
    untrack(attachTransformer);
    stage.batchDraw();
  });

  $effect(() => {
    void editor.selectedId;
    attachTransformer();
  });

  function attachTransformer() {
    if (!transformer) return;
    const l = editor.selected;
    const node = l ? nodes.get(l.id) : undefined;
    if (!l || !node || l.locked) {
      transformer.nodes([]);
      return;
    }
    transformer.keepRatio(l.type === 'image');
    transformer.enabledAnchors(
      l.type === 'text'
        ? ['middle-left', 'middle-right']
        : l.type === 'image'
          ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
    );
    transformer.nodes([node]);
    transformer.getLayer()?.batchDraw();
  }

  function wireNode(id: string, node: Konva.Shape, geo: Geometry) {
    node.on('mousedown touchstart', () => {
      editor.selectedId = id;
    });
    node.on('mouseenter', () => (stage.container().style.cursor = 'move'));
    node.on('mouseleave', () => (stage.container().style.cursor = ''));
    node.on('dragmove', (e) => snap(node, geo, (e.evt as MouseEvent).altKey));
    node.on('dragend', () => {
      snapLines.destroyChildren();
      editor.updateLayer(id, { x: node.x(), y: node.y() });
    });
    node.on('transform', () => {
      // Le texte s'élargit au lieu de se déformer.
      if (node instanceof Konva.Text) {
        node.width(Math.max(5, node.width() * node.scaleX()));
        node.scaleX(1);
      }
    });
    node.on('transformend', () => {
      const patch: Partial<Layer> = { x: node.x(), y: node.y(), rotation: Math.round(node.rotation() * 100) / 100 };
      if (node instanceof Konva.Text) {
        patch.width = node.width() * node.scaleX();
      } else {
        patch.width = node.width() * node.scaleX();
        patch.height = node.height() * node.scaleY();
      }
      node.scale({ x: 1, y: 1 });
      editor.updateLayer(id, patch);
    });
  }

  /** Aimante les bords et le centre du calque sur les plis, les marges et les centres de panneaux. */
  function snap(node: Konva.Shape, geo: Geometry, disabled: boolean) {
    snapLines.destroyChildren();
    if (disabled) return;
    const tol = 6 / scale;
    const { panels: p, W, H, bleed: b, safe: s } = geo;
    const xs = geo.disc ? [0, W / 2, W] : [
      -b, 0, W, W + b,
      p.back.w / 2, p.spine.x, p.spine.x + p.spine.w / 2, p.front.x, p.front.x + p.front.w / 2,
      s, p.back.w - s, p.front.x + s, W - s,
    ];
    const ys = geo.disc ? [0, H / 2, H] : [-b, 0, s, H / 2, H - s, H, H + b];
    const box = node.getClientRect({ relativeTo: content });
    const bestX = closest([box.x, box.x + box.width / 2, box.x + box.width], xs, tol);
    const bestY = closest([box.y, box.y + box.height / 2, box.y + box.height], ys, tol);
    if (bestX) {
      node.x(node.x() + bestX.delta);
      snapLines.add(new Konva.Line({ points: [bestX.line, -b - 6, bestX.line, H + b + 6], stroke: '#ff4fa3', strokeWidth: 1 / scale }));
    }
    if (bestY) {
      node.y(node.y() + bestY.delta);
      snapLines.add(new Konva.Line({ points: [-b - 6, bestY.line, W + b + 6, bestY.line], stroke: '#ff4fa3', strokeWidth: 1 / scale }));
    }
  }

  function closest(edges: number[], lines: number[], tol: number) {
    let best: { delta: number; line: number } | null = null;
    for (const e of edges)
      for (const line of lines) {
        const d = line - e;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line };
      }
    return best;
  }

  function drawGuides(geo: Geometry, k: number) {
    const { W, H, bleed: b, safe: s, panels: p } = geo;
    const px = 1 / k;
    // Voile sur le fond perdu (la partie coupée).
    const veil = '#0b0c0fb0';
    guides.add(
      new Konva.Rect({ x: -b, y: -b, width: W + 2 * b, height: b, fill: veil }),
      new Konva.Rect({ x: -b, y: H, width: W + 2 * b, height: b, fill: veil }),
      new Konva.Rect({ x: -b, y: 0, width: b, height: H, fill: veil }),
      new Konva.Rect({ x: W, y: 0, width: b, height: H, fill: veil }),
      new Konva.Rect({ x: 0, y: 0, width: W, height: H, stroke: '#f5b431', strokeWidth: px }),
      new Konva.Rect({ x: -b, y: -b, width: W + 2 * b, height: H + 2 * b, stroke: '#ffffff33', strokeWidth: px, dash: [4 * px, 4 * px] }),
    );
    for (const x of [p.spine.x, p.front.x]) {
      guides.add(new Konva.Line({ points: [x, -b, x, H + b], stroke: '#f5b431', strokeWidth: px, dash: [6 * px, 4 * px] }));
    }
    for (const id of ['back', 'front'] as const) {
      guides.add(
        new Konva.Rect({
          x: p[id].x + s, y: s, width: p[id].w - 2 * s, height: H - 2 * s,
          stroke: '#5ec8ff66', strokeWidth: px, dash: [2 * px, 3 * px],
        }),
      );
    }
    const labelY = -b - 16 * px;
    for (const id of ['back', 'spine', 'front'] as const) {
      const text = id === 'spine' ? 'TRANCHE' : PANEL_LABELS[id].toUpperCase();
      const t = new Konva.Text({
        text, fontSize: 10 * px, fontFamily: 'Inter', fill: '#8b8f99', letterSpacing: 1.5 * px,
        x: p[id].x + p[id].w / 2 - 50 * px, width: 100 * px, y: labelY, align: 'center', wrap: 'none',
      });
      guides.add(t);
    }
  }

  function drawDiscGuides(geo: Geometry, k: number) {
    const px = 1 / k;
    const c = geo.W / 2;
    const { outer, inner } = geo.disc!;
    const circle = (d: number, stroke: string, dash?: number[]) =>
      new Konva.Circle({ x: c, y: c, radius: d / 2, stroke, strokeWidth: px, dash: dash?.map((v) => v * px) });
    guides.add(
      circle(DISC.size, '#ffffff40', [4, 4]),
      circle(outer, '#f5b431'),
      circle(inner, '#f5b431'),
      circle(outer - 2 * geo.safe, '#5ec8ff66', [2, 3]),
      circle(inner + 2 * geo.safe, '#5ec8ff66', [2, 3]),
      new Konva.Circle({ x: c, y: c, radius: DISC.hole / 2, fill: '#17181c', stroke: '#ffffff40', strokeWidth: px }),
      new Konva.Text({
        text: `RONDELLE · ${outer} / ${inner} mm`, fontSize: 10 * px, fontFamily: 'Inter', fill: '#8b8f99',
        letterSpacing: 1.5 * px, x: 0, width: geo.W, y: -16 * px, align: 'center', wrap: 'none',
      }),
    );
  }

  function panelFromEvent(e: DragEvent): PanelId {
    stage.setPointersPositions(e);
    const pos = content.getRelativePointerPosition();
    return panelAt(editor.geo, pos?.x ?? 0);
  }

  function onDragOver(e: DragEvent) {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes('Files') && !types.includes(VISUAL_MIME) && !types.includes(LOGO_MIME)) return;
    e.preventDefault();
    dropPanel = panelFromEvent(e);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const panel = panelFromEvent(e);
    dropPanel = null;
    const logo = e.dataTransfer?.getData(LOGO_MIME);
    if (logo) {
      onDropLogo(JSON.parse(logo) as LogoRef, panel);
      return;
    }
    const visual = e.dataTransfer?.getData(VISUAL_MIME);
    if (visual) {
      onDropVisual(visual, panel);
      return;
    }
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) onDropFiles(files, panel);
  }
</script>

<div
  class="canvas"
  bind:this={host}
  role="application"
  aria-label="Zone de travail de la jaquette"
  ondragover={onDragOver}
  ondragleave={() => (dropPanel = null)}
  ondrop={onDrop}
>
  {#if dropPanel}
    <div class="drop-hint">Déposer sur : <strong>{editor.surface === 'disc' ? 'la rondelle' : PANEL_LABELS[dropPanel]}</strong></div>
  {/if}
  <div class="zoom">{Math.round((scale / (96 / 25.4)) * 100)} %</div>
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 40%, #23252b 0%, #17181c 70%);
  }
  .drop-hint {
    position: absolute;
    top: 52px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    pointer-events: none;
    background: var(--accent);
    color: #1b1d22;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
  }
  .zoom {
    position: absolute;
    right: 12px;
    bottom: 10px;
    z-index: 2;
    pointer-events: none;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
