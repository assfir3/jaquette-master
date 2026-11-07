import type { CoverPack, GameDetails, MobyGame, SearchResult, Visual } from '../../server/api';
import { editor } from './editor.svelte';
import type { LoadedAsset } from './render';
import { readAsDataUrl } from './storage';

export type { CoverPack, GameDetails, MobyGame, SearchResult, Visual };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

export const getStatus = () => api<{ steam: boolean; steamgriddb: boolean; mobygames: boolean }>('status');
export const findMoby = (title: string) => api<MobyGame | null>(`moby/find?title=${encodeURIComponent(title)}`);
export const getCoverPacks = (game: number, platform: number) => api<CoverPack[]>(`moby/covers?game=${game}&platform=${platform}`);
export const searchGames = (q: string) => api<SearchResult[]>(`search?q=${encodeURIComponent(q)}`);
export const getGame = (r: Pick<SearchResult, 'source' | 'id'>) => api<GameDetails>(`game/${r.source}/${r.id}`);

/** Adresse locale d'une image distante (passe par le serveur pour rester exportable). */
export function proxied(url: string): string {
  return `/api/img?url=${encodeURIComponent(url)}`;
}

const byUrl = new Map<string, Promise<LoadedAsset>>();

/** Télécharge un visuel et l'ajoute aux images du projet. */
export function loadVisual(url: string): Promise<LoadedAsset> {
  let p = byUrl.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(proxied(url));
      if (!res.ok) throw new Error('Image indisponible');
      return editor.addAsset(await readAsDataUrl(await res.blob()));
    })();
    byUrl.set(url, p);
    p.catch(() => byUrl.delete(url));
  }
  return p;
}

/** Type MIME utilisé pour glisser un visuel de la recherche vers la jaquette. */
export const VISUAL_MIME = 'application/x-jaquette-visual';
