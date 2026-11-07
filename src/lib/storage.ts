import type { Asset, Doc } from './model';
import { loadImage, type LoadedAsset } from './render';

export interface ProjectFile {
  app: 'jaquette-master';
  version: 1;
  doc: Doc;
  assets: Asset[];
}

export function toProjectFile(doc: Doc, assets: Asset[]): ProjectFile {
  return { app: 'jaquette-master', version: 1, doc, assets };
}

export async function fromProjectFile(data: unknown): Promise<{ doc: Doc; assets: LoadedAsset[] }> {
  const f = data as ProjectFile;
  if (!f || f.app !== 'jaquette-master' || !f.doc) throw new Error("Ce fichier n'est pas un projet Jaquette Master.");
  const assets = await Promise.all(
    (f.assets ?? []).map(async (a) => ({ ...a, img: await loadImage(a.src) })),
  );
  return { doc: f.doc, assets };
}

// ---------- Sauvegarde automatique dans le navigateur (IndexedDB) ----------

const DB = 'jaquette-master';
const STORE = 'autosave';
const LOGO_STORE = 'logos';
const SHELF_STORE = 'shelf';
const PROJECT_STORE = 'projects';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(LOGO_STORE)) db.createObjectStore(LOGO_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SHELF_STORE)) db.createObjectStore(SHELF_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function autosave(project: ProjectFile): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(project, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Navigation privée ou stockage bloqué : on continue sans sauvegarde auto.
  }
}

export async function loadAutosave(): Promise<ProjectFile | null> {
  try {
    const db = await openDb();
    const value = await new Promise<ProjectFile | null>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get('current');
      req.onsuccess = () => resolve((req.result as ProjectFile) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'jaquette'
  );
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ---------- Logos personnels (gardés d'un projet à l'autre) ----------

export interface UserLogo {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  category: string;
}

async function logoTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(LOGO_STORE, mode).objectStore(LOGO_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function listUserLogos(): Promise<UserLogo[]> {
  try {
    return await logoTx('readonly', (s) => s.getAll() as IDBRequest<UserLogo[]>);
  } catch {
    return [];
  }
}

export const saveUserLogo = (logo: UserLogo) => logoTx('readwrite', (s) => s.put(logo));
export const deleteUserLogo = (id: string) => logoTx('readwrite', (s) => s.delete(id));

// ---------- Étagère : toutes les jaquettes gardées dans le navigateur ----------

/** Ce que l'étagère affiche d'une jaquette, sans ses images (léger à lister). */
export interface ShelfEntry {
  id: string;
  title: string;
  updatedAt: number;
  /** Aperçus en JPEG : la tranche et la face avant. */
  spine?: string;
  front?: string;
  /** Largeur de la tranche en mm, pour dessiner l'étagère à l'échelle. */
  spineMm: number;
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const req = fn(t);
      let result: T;
      if (req) req.onsuccess = () => (result = req.result);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function listShelf(): Promise<ShelfEntry[]> {
  try {
    const all = await tx([SHELF_STORE], 'readonly', (t) => t.objectStore(SHELF_STORE).getAll() as IDBRequest<ShelfEntry[]>);
    return (all ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveToShelf(entry: ShelfEntry, project: ProjectFile): Promise<void> {
  try {
    await tx([SHELF_STORE, PROJECT_STORE, STORE], 'readwrite', (t) => {
      t.objectStore(SHELF_STORE).put(entry);
      t.objectStore(PROJECT_STORE).put(project, entry.id);
      t.objectStore(STORE).put(entry.id, 'currentId');
    });
  } catch {
    // Stockage bloqué : on continue sans étagère.
  }
}

export async function loadFromShelf(id: string): Promise<ProjectFile | null> {
  try {
    return (await tx([PROJECT_STORE], 'readonly', (t) => t.objectStore(PROJECT_STORE).get(id) as IDBRequest<ProjectFile>)) ?? null;
  } catch {
    return null;
  }
}

export async function deleteFromShelf(id: string): Promise<void> {
  await tx([SHELF_STORE, PROJECT_STORE], 'readwrite', (t) => {
    t.objectStore(SHELF_STORE).delete(id);
    t.objectStore(PROJECT_STORE).delete(id);
  });
}

export async function getCurrentId(): Promise<string | null> {
  try {
    return (await tx([STORE], 'readonly', (t) => t.objectStore(STORE).get('currentId') as IDBRequest<string>)) ?? null;
  } catch {
    return null;
  }
}

export async function setCurrentId(id: string): Promise<void> {
  try {
    await tx([STORE], 'readwrite', (t) => {
      t.objectStore(STORE).put(id, 'currentId');
    });
  } catch {
    // ignoré
  }
}
