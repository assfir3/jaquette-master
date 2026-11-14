<script lang="ts">
  // Carte « Nouvelle version » de l'appli de bureau. Invisible dans la version web (pas de /api/update).
  import { onMount } from 'svelte';
  import { callUpdate as call, remindLater as hide, updates, watchUpdates } from './updates.svelte';

  const s = $derived(updates.s);
  const later = $derived(updates.later);
  onMount(watchUpdates);

  function remindLater() {
    if (s?.version) hide(s.version);
  }

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  // « Plus tard » cache la carte pour cette version ; une fois prête à installer, on la remontre.
  const visible = $derived(
    !!s?.version &&
      (s.state === 'available' || s.state === 'downloading' || s.state === 'ready' || (s.state === 'error' && !!s.page)) &&
      (later !== s.version || s.state === 'ready'),
  );
</script>

{#if visible && s}
  <aside class="update" aria-live="polite">
    <div class="head">
      <span class="dot" aria-hidden="true"></span>
      <strong>Jaquette Master {s.version}</strong>
      <button class="close" onclick={remindLater} title="Me le rappeler à la prochaine version" aria-label="Fermer">×</button>
    </div>

    {#if s.state === 'available'}
      <p>Une nouvelle version est disponible (tu as la {s.current}).</p>
      <div class="row">
        <button class="primary" onclick={() => call('download')}>Télécharger</button>
        <button onclick={() => call('page')}>Nouveautés</button>
      </div>
    {:else if s.state === 'downloading'}
      <p>Téléchargement… {s.percent ?? 0} %</p>
      <div class="bar"><span style:width={`${s.percent ?? 0}%`}></span></div>
    {:else if s.state === 'ready' && s.auto && !s.file}
      <p>La mise à jour est prête. Elle s'installera en fermant l'appli, ou tout de suite :</p>
      <div class="row">
        <button class="primary" onclick={() => call('install')}>Redémarrer et installer</button>
        <button onclick={() => call('page')}>Nouveautés</button>
      </div>
    {:else if s.state === 'ready'}
      {#if isMac}
        <p>Le fichier est dans Téléchargements et vient de s'ouvrir : quitte l'appli, puis glisse <em>Jaquette Master</em> dans <em>Applications</em> pour remplacer l'ancienne.</p>
      {:else}
        <p>L'installateur est dans Téléchargements : quitte l'appli puis lance-le.</p>
      {/if}
      <div class="row">
        <button class="primary" onclick={() => call('install')}>Ouvrir le fichier</button>
        <button onclick={() => call('page')}>Nouveautés</button>
      </div>
    {:else}
      <p class="err">Le téléchargement n'a pas abouti{s.error ? ` (${s.error})` : ''}.</p>
      <div class="row">
        <button class="primary" onclick={() => call('page')}>Télécharger sur GitHub</button>
      </div>
    {/if}
  </aside>
{/if}

<style>
  .update {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 30;
    width: 300px;
    max-width: calc(100vw - 36px);
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-3);
    border: 1px solid var(--line-strong);
    box-shadow: 0 14px 40px var(--shadow);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: rise 0.25s ease-out;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .update {
      animation: none;
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .close {
    margin-left: auto;
    background: none;
    border: none;
    padding: 0 4px;
    font-size: 16px;
    color: var(--muted);
  }
  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.4;
  }
  .err {
    color: var(--danger);
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .bar {
    height: 6px;
    border-radius: 99px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }
</style>
