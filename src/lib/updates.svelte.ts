// État des mises à jour de l'appli de bureau, lu par /api/update (absent dans la version web).
export type UpdateState = {
  current: string;
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  auto: boolean;
  version?: string;
  page?: string;
  percent?: number;
  file?: string;
  error?: string;
};

const HIDDEN = 'jaquette-master:update-later';

export const updates = $state<{ s: UpdateState | null; later: string | null }>({ s: null, later: null });
try {
  updates.later = localStorage.getItem(HIDDEN);
} catch {}

export async function callUpdate(action = ''): Promise<void> {
  try {
    const res = await fetch(`/api/update${action ? `/${action}` : ''}`, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return;
    updates.s = await res.json();
  } catch {}
}

/** « Plus tard » : cache la carte jusqu'à la version suivante (null pour la remontrer). */
export function remindLater(version: string | null) {
  updates.later = version;
  try {
    if (version) localStorage.setItem(HIDDEN, version);
    else localStorage.removeItem(HIDDEN);
  } catch {}
}

/** Suit l'état : souvent tant qu'une vérification ou un téléchargement est en cours, sinon toutes les 30 s. */
export function watchUpdates(): () => void {
  let t: ReturnType<typeof setTimeout>;
  let stopped = false;
  const loop = async () => {
    await callUpdate();
    // Version web : pas de /api/update, on arrête.
    if (stopped || !updates.s) return;
    const busy = ['idle', 'checking', 'downloading'].includes(updates.s.state);
    t = setTimeout(loop, busy ? 1000 : 30_000);
  };
  loop();
  return () => {
    stopped = true;
    clearTimeout(t);
  };
}
