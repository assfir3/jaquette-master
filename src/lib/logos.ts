import type { LogoFile } from '../../server/api';
import { uid, type Geometry, type ImageLayer, type Layer, type PanelId } from './model';
import { editor } from './editor.svelte';
import type { LoadedAsset } from './render';
import { loadVisual } from './search';

export type { LogoFile };

export interface CatalogEntry {
  label: string;
  /** Nom du fichier sur Wikimedia Commons. */
  file: string;
  /** Zone proposée par défaut. */
  zone: PanelId;
}

export interface CatalogSection {
  title: string;
  entries: CatalogEntry[];
}

// Les logos sont des marques déposées : on ne les livre pas avec l'outil,
// ils sont téléchargés à la demande depuis Wikimedia Commons.
export const CATALOG: CatalogSection[] = [
  {
    title: 'Classification',
    entries: [3, 7, 12, 16, 18].map((age) => ({ label: `PEGI ${age}`, file: `File:PEGI ${age}.svg`, zone: 'front' as const })),
  },
  {
    title: 'Boutiques',
    entries: [
      { label: 'Steam', file: 'File:Steam 2016 logo black.svg', zone: 'back' },
      { label: 'Steam (icône)', file: 'File:Steam icon logo.svg', zone: 'spine' },
      { label: 'GOG.com', file: 'File:GOG.com logo.svg', zone: 'back' },
      { label: 'GOG.com blanc', file: 'File:GOG.com logo white.svg', zone: 'back' },
      { label: 'Epic Games', file: 'File:Epic Games Store logo 2023 vertical black.svg', zone: 'back' },
      { label: 'Epic Games blanc', file: 'File:Epic Games Store logo 2023 vertical white.svg', zone: 'back' },
      { label: 'Ubisoft Connect', file: 'File:Ubisoft Connect logo.svg', zone: 'back' },
      { label: 'Battle.net', file: 'File:Battle.net logo.svg', zone: 'back' },
      { label: 'itch.io', file: 'File:Itch.io logo.svg', zone: 'back' },
    ],
  },
  {
    title: 'Plateformes',
    entries: [
      { label: 'Windows', file: 'File:Windows logo - 2021.svg', zone: 'spine' },
      { label: 'Windows blanc', file: 'File:Windows logo - 2021 (White).svg', zone: 'spine' },
      { label: 'Xbox', file: 'File:Xbox logo (2019).svg', zone: 'spine' },
      { label: 'Steam Deck', file: 'File:Steam Deck colored logo.svg', zone: 'back' },
      { label: 'Linux (Tux)', file: 'File:Tux.svg', zone: 'spine' },
    ],
  },
];

export const ZONE_SHORT: Record<PanelId, string> = { front: 'Face', back: 'Dos', spine: 'Tranche' };

/** Hauteur par défaut d'un logo selon la zone, en mm. */
const HEIGHT: Record<PanelId, number> = { front: 15, back: 10, spine: 9 };
const GAP = 3;

/**
 * Place un logo dans une zone, à côté de ceux déjà posés au même endroit :
 * en bas à gauche de la face (comme le PEGI), en rangée en bas du dos, empilés en bas de la tranche.
 */
export function placeLogo(geo: Geometry, layers: Layer[], asset: LoadedAsset, zone: PanelId, name: string): ImageLayer {
  const p = geo.panels[zone];
  const s = geo.safe;
  const role = geo.disc ? 'logo:disc' : `logo:${zone}`;
  const siblings = layers.filter((l) => l.role === role && !l.hidden);
  const ratio = asset.width / asset.height;

  let width: number;
  let height: number;
  let x: number;
  let y: number;

  if (geo.disc) {
    // Rondelle : rangée centrée sous le trou, à mi-chemin du bord.
    height = 8;
    width = Math.min(height * ratio, 40);
    height = width / ratio;
    const c = geo.W / 2;
    // Le premier est centré, les suivants se rangent à sa droite.
    x = siblings.length ? Math.max(...siblings.map((l) => l.x + l.width + GAP)) : c - width / 2;
    y = c + (geo.disc.inner + geo.disc.outer) / 4 - height / 2;
  } else if (zone === 'spine') {
    const maxW = p.w - 3;
    height = HEIGHT.spine;
    width = height * ratio;
    if (width > maxW) {
      width = maxW;
      height = width / ratio;
    }
    x = p.x + (p.w - width) / 2;
    const top = Math.min(geo.H - s, ...siblings.map((l) => l.y));
    y = top - GAP - height;
    if (!siblings.length) y = geo.H - s - height;
  } else {
    height = HEIGHT[zone];
    width = Math.min(height * ratio, p.w * (zone === 'back' ? 0.3 : 0.45));
    height = width / ratio;
    const right = Math.max(p.x + s, ...siblings.map((l) => l.x + l.width + GAP));
    x = siblings.length ? right : p.x + s;
    // Au dos, on laisse la place à la ligne de crédits en bas.
    const bottom = zone === 'back' ? geo.H - s - 10 : geo.H - s;
    y = bottom - height;
    if (x + width > p.x + p.w - s) {
      // Plus de place sur la ligne : on remonte d'un cran.
      x = p.x + s;
      y -= HEIGHT[zone] + GAP;
    }
  }

  return {
    id: uid(),
    type: 'image',
    name,
    assetId: asset.id,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    clip: zone,
    role,
  };
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

let catalogFiles: Promise<Map<string, LogoFile>> | null = null;

/** Adresses des logos du catalogue (une seule requête, gardée en mémoire). */
export function loadCatalogFiles(): Promise<Map<string, LogoFile>> {
  if (!catalogFiles) {
    const titles = CATALOG.flatMap((s) => s.entries.map((e) => e.file));
    catalogFiles = api<LogoFile[]>(`logos/files?titles=${encodeURIComponent(titles.join('|'))}`).then(
      (list) => new Map(list.map((l) => [l.title, l])),
    );
    catalogFiles.catch(() => (catalogFiles = null));
  }
  return catalogFiles;
}

export const searchLogos = (q: string) => api<LogoFile[]>(`logos/search?q=${encodeURIComponent(q)}`);

/** Type MIME pour glisser un logo vers la jaquette. */
export const LOGO_MIME = 'application/x-jaquette-logo';

// ---------- Glisser-déposer et chargement ----------

export type LogoRef = { kind: 'commons'; url: string; name: string } | { kind: 'user'; src: string; name: string };

export async function loadLogo(ref: LogoRef): Promise<LoadedAsset> {
  return ref.kind === 'commons' ? loadVisual(ref.url) : editor.addAsset(ref.src);
}

/** Ajoute un logo dans une zone, rangé à côté des autres. */
export async function addLogo(ref: LogoRef, zone: PanelId) {
  const asset = await loadLogo(ref);
  editor.addLayer(placeLogo(editor.geo, editor.layers, asset, zone, ref.name));
}
