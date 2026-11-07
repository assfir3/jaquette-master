import {
  newDoc,
  normalizeDoc,
  surfaceGeometry,
  surfaceLayers,
  uid,
  type Asset,
  type Doc,
  type Geometry,
  type Layer,
  type SurfaceId,
} from './model';
import { loadImage, type LoadedAsset } from './render';

const HISTORY_LIMIT = 100;

/** Liste (boîtier ou rondelle) qui contient le calque. */
function listOf(d: Doc, id: string): Layer[] | undefined {
  if (d.layers.some((l) => l.id === id)) return d.layers;
  if (d.disc.layers.some((l) => l.id === id)) return d.disc.layers;
  return undefined;
}

class Editor {
  doc = $state<Doc>(newDoc());
  /** Surface affichée : le boîtier ou la rondelle. */
  surface = $state<SurfaceId>('case');
  selectedId = $state<string | null>(null);
  showGuides = $state(true);
  /** Incrémenté quand une image ou une police finit de charger. */
  renderVersion = $state(0);
  canUndo = $state(false);
  canRedo = $state(false);

  /** Les images restent hors de l'historique pour qu'il reste léger. */
  assets = new Map<string, LoadedAsset>();

  #undo: string[] = [];
  #redo: string[] = [];
  #lastKey: string | null = null;
  #lastTime = 0;

  /** Calques de la surface affichée. */
  get layers(): Layer[] {
    return surfaceLayers(this.doc, this.surface);
  }

  get geo(): Geometry {
    return surfaceGeometry(this.doc, this.surface);
  }

  get selected(): Layer | undefined {
    return this.layers.find((l) => l.id === this.selectedId);
  }

  setSurface(s: SurfaceId) {
    this.surface = s;
    this.selectedId = null;
  }

  /**
   * Modifie le document en gardant une étape d'annulation.
   * Les modifications successives avec la même `key` (frappe au clavier, curseur)
   * sont regroupées en une seule étape.
   */
  update(fn: (doc: Doc) => void, key?: string) {
    const now = Date.now();
    const merge = key !== undefined && key === this.#lastKey && now - this.#lastTime < 1500;
    if (!merge) {
      this.#undo.push(JSON.stringify($state.snapshot(this.doc)));
      if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
      this.#redo = [];
    }
    this.#lastKey = key ?? null;
    this.#lastTime = now;
    fn(this.doc);
    this.#syncFlags();
  }

  updateLayer(id: string, patch: Partial<Layer>, key?: string) {
    this.update((d) => {
      const l = listOf(d, id)?.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    }, key);
  }

  undo() {
    const prev = this.#undo.pop();
    if (!prev) return;
    this.#redo.push(JSON.stringify($state.snapshot(this.doc)));
    this.doc = normalizeDoc(JSON.parse(prev));
    this.#afterHistoryJump();
  }

  redo() {
    const next = this.#redo.pop();
    if (!next) return;
    this.#undo.push(JSON.stringify($state.snapshot(this.doc)));
    this.doc = normalizeDoc(JSON.parse(next));
    this.#afterHistoryJump();
  }

  /** Remplace tout le document (nouveau projet, ouverture d'un fichier). */
  load(doc: Doc, assets: LoadedAsset[]) {
    this.assets = new Map(assets.map((a) => [a.id, a]));
    this.doc = normalizeDoc(doc);
    this.selectedId = null;
    this.#undo = [];
    this.#redo = [];
    this.#lastKey = null;
    this.#syncFlags();
    this.renderVersion++;
  }

  /** Ajoute un calque sur la surface affichée. */
  addLayer(layer: Layer) {
    const surface = this.surface;
    this.update((d) => surfaceLayers(d, surface).push(layer));
    this.selectedId = layer.id;
  }

  removeLayer(id: string) {
    this.update((d) => {
      const list = listOf(d, id);
      if (list) list.splice(list.findIndex((l) => l.id === id), 1);
    });
    if (this.selectedId === id) this.selectedId = null;
  }

  duplicateLayer(id: string) {
    const l = listOf(this.doc, id)?.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...$state.snapshot(l), id: uid(), x: l.x + 3, y: l.y + 3, name: `${l.name} (copie)` } as Layer;
    this.update((d) => {
      const list = listOf(d, id)!;
      list.splice(list.findIndex((x) => x.id === id) + 1, 0, copy);
    });
    this.selectedId = copy.id;
  }

  /** Déplace un calque dans la pile : +1 vers l'avant, -1 vers l'arrière. */
  moveLayer(id: string, delta: number | 'front' | 'back') {
    this.update((d) => {
      const list = listOf(d, id);
      if (!list) return;
      const i = list.findIndex((x) => x.id === id);
      const [l] = list.splice(i, 1);
      const j = delta === 'front' ? list.length : delta === 'back' ? 0 : Math.max(0, Math.min(list.length, i + delta));
      list.splice(j, 0, l);
    });
  }

  async addAsset(src: string): Promise<LoadedAsset> {
    for (const a of this.assets.values()) if (a.src === src) return a;
    const img = await loadImage(src);
    // Un SVG sans taille déclarée renvoie 0 : on prend une taille par défaut.
    const asset: LoadedAsset = { id: uid(), src, width: img.naturalWidth || 512, height: img.naturalHeight || 512, img };
    this.assets.set(asset.id, asset);
    return asset;
  }

  /** Images réellement utilisées par le document (pour l'enregistrement). */
  usedAssets(): Asset[] {
    const ids = new Set(
      [...this.doc.layers, ...this.doc.disc.layers].flatMap((l) => (l.type === 'image' ? [l.assetId] : [])),
    );
    return [...this.assets.values()]
      .filter((a) => ids.has(a.id))
      .map(({ id, src, width, height }) => ({ id, src, width, height }));
  }

  #afterHistoryJump() {
    this.#lastKey = null;
    if (this.selectedId && !this.layers.some((l) => l.id === this.selectedId)) this.selectedId = null;
    this.#syncFlags();
  }

  #syncFlags() {
    this.canUndo = this.#undo.length > 0;
    this.canRedo = this.#redo.length > 0;
  }
}

export const editor = new Editor();
