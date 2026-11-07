<script lang="ts">
  import { deleteFromShelf, listShelf, type ShelfEntry } from './storage';

  let {
    currentId,
    version,
    onOpen,
    onNew,
  }: {
    currentId: string;
    /** Change à chaque sauvegarde, pour relire l'étagère. */
    version: number;
    onOpen: (id: string) => void;
    onNew: () => void;
  } = $props();

  let entries = $state<ShelfEntry[]>([]);
  let loaded = $state(false);
  let picked = $state<string | null>(null);

  $effect(() => {
    void version;
    listShelf().then((list) => {
      entries = list;
      loaded = true;
    });
  });

  const selected = $derived(entries.find((e) => e.id === (picked ?? currentId)) ?? entries[0]);

  function when(t: number) {
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }

  async function remove(e: ShelfEntry) {
    if (!confirm(`Retirer « ${e.title || 'Sans titre'} » de l'étagère ? Elle sera effacée de ce navigateur.`)) return;
    await deleteFromShelf(e.id);
    entries = entries.filter((x) => x.id !== e.id);
    if (picked === e.id) picked = null;
  }
</script>

<div class="shelf-view">
  <header>
    <h1>Mon étagère</h1>
    <span class="count">{entries.length} jaquette{entries.length > 1 ? 's' : ''}</span>
  </header>

  {#if loaded && entries.length === 0}
    <p class="empty">Ton étagère est vide. Chaque jaquette que tu crées vient s'y ranger toute seule.</p>
  {/if}

  <div class="rack" role="listbox" aria-label="Jaquettes">
    {#each entries as e (e.id)}
      <button
        class="spine"
        class:on={selected?.id === e.id}
        role="option"
        aria-selected={selected?.id === e.id}
        style:aspect-ratio="{Math.max(7, e.spineMm)} / 183"
        style:background-image={e.spine ? `url(${e.spine})` : undefined}
        onclick={() => (picked = e.id)}
        ondblclick={() => onOpen(e.id)}
        title={e.title || 'Sans titre'}
      >
        {#if !e.spine}<span>{e.title || 'Sans titre'}</span>{/if}
      </button>
    {/each}
    <button class="spine add" style:aspect-ratio="14 / 183" onclick={onNew} aria-label="Nouvelle jaquette">+</button>
  </div>
  <div class="plank"></div>

  {#if selected}
    <article class="detail">
      {#if selected.front}
        <img src={selected.front} alt="Face avant de {selected.title || 'la jaquette'}" />
      {/if}
      <div class="info">
        <h2>{selected.title || 'Sans titre'}</h2>
        <p class="meta">DVD · modifiée {when(selected.updatedAt)}{selected.id === currentId ? ' · ouverte' : ''}</p>
        <div class="actions">
          <button class="primary" onclick={() => onOpen(selected.id)}>
            {selected.id === currentId ? "Retourner à l'atelier" : 'Ouvrir dans l’atelier'}
          </button>
          <button class="danger" onclick={() => remove(selected)}>Retirer de l'étagère</button>
        </div>
      </div>
    </article>
  {/if}
</div>

<style>
  .shelf-view {
    height: 100%;
    overflow-y: auto;
    padding: 36px 40px 48px;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 28px;
  }
  h1 {
    margin: 0;
    font: 400 32px/1 var(--display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .count,
  .meta {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }
  .empty {
    color: var(--muted);
    margin: 0 0 20px;
  }
  .rack {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 5px;
    /* Place pour la tranche sélectionnée, qui se soulève avec son contour. */
    padding: 20px 12px 0;
    overflow-x: auto;
  }
  .spine {
    flex: none;
    /* À l'échelle : la largeur suit l'épaisseur réelle de la tranche. */
    height: clamp(180px, 46vh, 360px);
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: var(--surface-3) center / 100% 100% no-repeat;
    box-shadow: inset -2px 0 0 #0004, inset 2px 0 0 #fff1;
    transition: transform 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .spine span {
    writing-mode: vertical-rl;
    font: 400 14px 'Bebas Neue', sans-serif;
    letter-spacing: 0.1em;
    white-space: nowrap;
    overflow: hidden;
  }
  .spine:hover:not(:disabled) {
    background-color: var(--surface-3);
    transform: translateY(-6px);
  }
  .spine.on {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    transform: translateY(-10px);
  }
  .spine.add {
    background: transparent;
    border: 1.5px dashed #3a4256;
    box-shadow: none;
    color: var(--muted);
    font-size: 20px;
  }
  .plank {
    flex: none;
    height: 8px;
    margin: 0 0 32px;
    background: #2a3142;
    border-radius: 2px;
    box-shadow: 0 10px 30px #0008;
  }
  .detail {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .detail img {
    width: 180px;
    border-radius: 3px;
    box-shadow: 0 20px 50px #000a;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }
  .info h2 {
    font: 400 26px/1.1 var(--display);
    color: var(--text);
    letter-spacing: 0.02em;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .actions button {
    height: 40px;
    padding: 0 18px;
    border-radius: 999px;
  }
</style>
