<script lang="ts">
  // Choix du thème : automatique (comme le système) → clair → sombre.
  import { setTheme, theme, type ThemeChoice } from './theme.svelte';

  const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' };
  const LABEL: Record<ThemeChoice, string> = { auto: 'Automatique (comme le système)', light: 'Clair', dark: 'Sombre' };
</script>

<button
  class="theme"
  onclick={() => setTheme(NEXT[theme.choice])}
  title={`Thème : ${LABEL[theme.choice]} — cliquer pour ${LABEL[NEXT[theme.choice]].toLowerCase()}`}
  aria-label={`Thème : ${LABEL[theme.choice]}`}
>
  {#if theme.choice === 'auto'}
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" /></svg>
  {:else if theme.choice === 'light'}
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor" /><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></g></svg>
  {:else}
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3z" fill="currentColor" /></svg>
  {/if}
</button>

<style>
  .theme {
    display: grid;
    place-items: center;
    width: 32px;
    padding: 6px 0;
  }
  svg {
    width: 15px;
    height: 15px;
  }
</style>
