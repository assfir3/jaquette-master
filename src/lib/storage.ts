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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(LOGO_STORE)) db.createObjectStore(LOGO_STORE, { keyPath: 'id' });
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
