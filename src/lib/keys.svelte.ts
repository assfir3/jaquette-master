// Clés d'API saisies dans l'interface (SteamGridDB, MobyGames).
// Elles restent dans ce navigateur (ou dans l'appli de bureau) et ne partent que vers
// le serveur intermédiaire de Jaquette Master, dans des en-têtes, à chaque recherche.

const STORAGE = 'jaquette-master:keys';

export type KeyService = 'steamgriddb' | 'mobygames';

function load(): Partial<Record<KeyService, string>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
  } catch {
    return {};
  }
}

export const keys = $state(load());

export function setKey(service: KeyService, value: string) {
  const v = value.trim();
  if (v) keys[service] = v;
  else delete keys[service];
  try {
    localStorage.setItem(STORAGE, JSON.stringify(keys));
  } catch {
    // Stockage indisponible (navigation privée) : la clé vaut pour cette session seulement.
  }
}

/** En-têtes à joindre aux appels /api. */
export function keyHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (keys.steamgriddb) h['x-steamgriddb-key'] = keys.steamgriddb;
  if (keys.mobygames) h['x-mobygames-key'] = keys.mobygames;
  return h;
}
