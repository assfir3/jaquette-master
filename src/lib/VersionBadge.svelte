<script lang="ts">
  // Numéro de version de l'appli de bureau ; un clic vérifie s'il y a une mise à jour.
  import { callUpdate, remindLater, updates } from './updates.svelte';

  let note = $state('');
  let timer: ReturnType<typeof setTimeout>;

  async function check() {
    clearTimeout(timer);
    note = 'vérification…';
    remindLater(null); // une nouvelle version déjà connue réaffiche sa carte
    await callUpdate('check');
    const s = updates.s;
    note =
      s?.state === 'none' ? 'à jour ✓'
      : s?.state === 'error' ? 'GitHub injoignable'
      : s?.version ? `${s.version} disponible`
      : '';
    timer = setTimeout(() => (note = ''), 5000);
  }

  const s = $derived(updates.s);
  const fresh = $derived(!!s?.version && s.state !== 'none');
</script>

{#if s}
  <button class="ver" class:fresh onclick={check} title="Rechercher une mise à jour">
    v{s.current}{#if note}<span>&nbsp;· {note}</span>{:else if fresh}<span>&nbsp;· {s.version} disponible</span>{/if}
  </button>
{/if}

<style>
  .ver {
    background: none;
    border: 1px solid transparent;
    border-radius: 99px;
    padding: 2px 8px;
    font: 500 11px/1.4 var(--mono);
    color: var(--muted);
    white-space: nowrap;
  }
  .ver:hover {
    border-color: var(--line-strong);
    color: var(--text);
  }
  .fresh span {
    color: var(--accent-text);
  }
</style>
