// Thème de l'interface : automatique (suit le système), clair ou sombre.
export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'jaquette-master:theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

function load(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {}
  return 'auto';
}

export const theme = $state<{ choice: ThemeChoice; effective: 'light' | 'dark' }>({ choice: load(), effective: 'dark' });

function apply() {
  theme.effective = theme.choice === 'auto' ? (media?.matches ? 'light' : 'dark') : theme.choice;
  document.documentElement.dataset.theme = theme.effective;
}

export function setTheme(choice: ThemeChoice) {
  theme.choice = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {}
  apply();
}

/** À appeler avant le premier affichage (pas de flash de l'autre thème). */
export function initTheme() {
  apply();
  media?.addEventListener('change', () => theme.choice === 'auto' && apply());
}

/** Couleur d'une variable CSS du thème (pour le dessin du plan de travail). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
