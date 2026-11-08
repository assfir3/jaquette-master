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
  /** Section dépliée à l'ouverture du panneau. */
  open?: boolean;
  entries: CatalogEntry[];
}

const e = (label: string, file: string, zone: PanelId): CatalogEntry => ({ label, file: `File:${file}`, zone });

// Les logos sont des marques déposées : on ne les livre pas avec l'outil,
// ils sont téléchargés à la demande depuis Wikimedia Commons.
export const CATALOG: CatalogSection[] = [
  {
    title: 'PEGI · Europe',
    open: true,
    entries: [
      ...[3, 7, 12, 16, 18].map((age) => e(`PEGI ${age}`, `PEGI ${age}.svg`, 'front')),
      e('Langage grossier', 'PEGI Bad language.svg', 'back'),
      e('Sexe', 'PEGI Sex.svg', 'back'),
      e('PEGI Online', 'PEGI Online - Logo.svg', 'back'),
    ],
  },
  {
    title: 'USK · Allemagne',
    entries: [0, 6, 12, 16, 18].map((age) => e(`USK ${age}`, `USK ${age}.svg`, 'front')),
  },
  {
    title: 'ESRB · Amérique du Nord',
    entries: [
      e('Early Childhood', 'ESRB Early Childhood.svg', 'front'),
      e('Everyone', 'ESRB 2013 Everyone.svg', 'front'),
      e('Everyone 10+', 'ESRB 2013 Everyone 10+.svg', 'front'),
      e('Teen', 'ESRB 2013 Teen.svg', 'front'),
      e('Mature 17+', 'ESRB 2013 Mature.svg', 'front'),
      e('Adults Only 18+', 'ESRB 2013 Adults Only 18+.svg', 'front'),
      e('Rating Pending', 'ESRB RP.svg', 'front'),
    ],
  },
  {
    title: 'CERO · Japon',
    entries: ['A', 'B', 'C', 'D', 'Z'].map((r) => e(`CERO ${r}`, `CERO ${r}.svg`, 'front')),
  },
  {
    title: 'ClassInd · Brésil',
    entries: ['AL', 'A10', 'A12', 'A14', 'A16', 'A18'].map((r) => e(r === 'AL' ? 'Livre (L)' : r.slice(1) + ' ans', `Classind ${r}.svg`, 'front')),
  },
  {
    title: 'Boutiques',
    open: true,
    entries: [
      e('Steam', 'Steam 2016 logo black.svg', 'back'),
      e('Steam (icône)', 'Steam icon logo.svg', 'spine'),
      e('GOG.com', 'GOG.com logo.svg', 'back'),
      e('GOG.com blanc', 'GOG.com logo white.svg', 'back'),
      e('GOG Galaxy', 'GOG Galaxy logo.svg', 'back'),
      e('Epic Games', 'Epic Games Store logo 2023 vertical black.svg', 'back'),
      e('Epic Games blanc', 'Epic Games Store logo 2023 vertical white.svg', 'back'),
      e('EA', 'Electronic Arts 2020.svg', 'back'),
      e('Ubisoft Connect', 'Ubisoft Connect logo.svg', 'back'),
      e('Ubisoft', 'Ubisoft logo.svg', 'back'),
      e('Battle.net', 'Battle.net logo.svg', 'back'),
      e('Rockstar Launcher', 'Rockstar Games Launcher logo.png', 'back'),
      e('Microsoft Store', 'Microsoft Store logo.svg', 'back'),
      e('Xbox Game Pass', 'Xbox Game Pass new logo - colored version.svg', 'back'),
      e('Game Pass noir', 'Xbox Game Pass new logo - black color version.svg', 'back'),
      e('PC Game Pass', 'PC Game Pass logo.svg', 'back'),
      e('PlayStation Store', 'PlayStation Store.svg', 'back'),
      e('Nintendo eShop', 'Nintendo eShop logo.svg', 'back'),
      e('Humble Bundle', 'Humble Bundle logo.svg', 'back'),
      e('Amazon Games', 'Amazon Games logo.svg', 'back'),
      e('Green Man Gaming', 'Green Man Gaming logo.svg', 'back'),
      e('itch.io', 'Itch.io logo.svg', 'back'),
    ],
  },
  {
    title: 'PC et mobile',
    open: true,
    entries: [
      e('Windows', 'Windows logo - 2021.svg', 'spine'),
      e('Windows blanc', 'Windows logo - 2021 (White).svg', 'spine'),
      e('Windows (nom)', 'Windows logo and wordmark - 2021.svg', 'back'),
      e('macOS', 'MacOS logo (2017).svg', 'back'),
      e('Apple', 'Apple logo black.svg', 'spine'),
      e('Apple blanc', 'Apple logo white.svg', 'spine'),
      e('Linux (Tux)', 'Tux.svg', 'spine'),
      e('SteamOS', 'SteamOS logo.svg', 'back'),
      e('Steam Deck', 'Steam Deck colored logo.svg', 'back'),
      e('Android', 'Android logo 2019 (stacked).svg', 'back'),
      e('iOS', 'IOS logo.svg', 'back'),
      e('Meta Quest', 'Meta Quest logo.svg', 'back'),
    ],
  },
  {
    title: 'PlayStation',
    entries: [
      e('PlayStation', 'PlayStation logo.svg', 'spine'),
      e('PlayStation 2', 'PlayStation 2 logo.svg', 'front'),
      e('PlayStation 3', 'PlayStation 3 logo (2009).svg', 'front'),
      e('PlayStation 4', 'PlayStation 4 logo and wordmark.svg', 'front'),
      e('PlayStation 5', 'PlayStation 5 logo and wordmark.svg', 'front'),
      e('PSP', 'PSP Logo.svg', 'front'),
      e('PS Vita', 'PlayStation Vita logo.svg', 'front'),
    ],
  },
  {
    title: 'Xbox',
    entries: [
      e('Xbox', 'Xbox logo (2019).svg', 'spine'),
      e('Xbox 360', 'Xbox 360 logo.svg', 'front'),
      e('Xbox One', 'Xbox one logo.svg', 'front'),
      e('Xbox Series X', 'Xbox Series X Logo.svg', 'front'),
      e('Xbox Series X|S', 'Xbox Series X S color.svg', 'front'),
    ],
  },
  {
    title: 'Nintendo',
    entries: [
      e('Nintendo Switch', 'Nintendo Switch logo.svg', 'front'),
      e('Nintendo Switch 2', 'Nintendo Switch 2 logo.svg', 'front'),
      e('Wii', 'Wii.svg', 'front'),
      e('Wii U', 'Nintendo-Wii-U-Logo.png', 'front'),
      e('GameCube', 'Nintendo Gamecube-Logo.svg', 'front'),
      e('Nintendo 64', 'Nintendo 64 logo.png', 'front'),
      e('Super Nintendo', 'SNES logo.svg', 'front'),
      e('NES', 'NES logo.svg', 'front'),
      e('Game Boy Advance', 'Game Boy Advance logo.svg', 'front'),
      e('Nintendo DS', 'Nintendo DS Logo.svg', 'front'),
      e('Nintendo 3DS', 'Nintendo 3DS logo.svg', 'front'),
    ],
  },
  {
    title: 'Sega',
    entries: [
      e('Dreamcast', 'Dreamcast logo.svg', 'front'),
      e('Dreamcast PAL', 'Dreamcast logo PAL.svg', 'front'),
    ],
  },
  {
    title: 'Supports',
    entries: [
      e('DVD', 'DVD logo.svg', 'spine'),
      e('Blu-ray', 'Blu-ray Disc.svg', 'spine'),
      e('PC CD-ROM', 'PC CD-ROM Software Logo.svg', 'front'),
      e('CD-ROM', 'CD-ROM logo.png', 'spine'),
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
  const role = geo.disc || geo.cart ? 'logo:disc' : `logo:${zone}`;
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
  } else if (geo.cart) {
    // Étiquette de cartouche : petite rangée centrée en bas.
    height = 3;
    width = Math.min(height * ratio, geo.W - 2 * s);
    height = width / ratio;
    x = siblings.length ? Math.max(...siblings.map((l) => l.x + l.width + 0.8)) : (geo.W - width) / 2;
    y = geo.H - s - height;
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
    catalogFiles = (async () => {
      // Le serveur accepte 50 fichiers par requête ; on enchaîne pour ménager Wikimedia.
      const map = new Map<string, LogoFile>();
      for (let i = 0; i < titles.length; i += 50) {
        const part = titles.slice(i, i + 50);
        const list = await api<LogoFile[]>(`logos/files?titles=${encodeURIComponent(part.join('|'))}`);
        for (const l of list) map.set(l.title, l);
      }
      return map;
    })();
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
