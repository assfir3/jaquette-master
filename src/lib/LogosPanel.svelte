<script lang="ts">
  import { onMount } from 'svelte';
  import {
    CATALOG,
    LOGO_MIME,
    ZONE_SHORT,
    addLogo,
    loadCatalogFiles,
    searchLogos,
    type LogoFile,
    type LogoRef,
  } from './logos';
  import { uid, type PanelId } from './model';
  import { loadImage } from './render';
  import { proxied } from './search';
  import { deleteUserLogo, listUserLogos, readAsDataUrl, saveUserLogo, type UserLogo } from './storage';

  interface Props {
    notify: (text: string, kind?: 'info' | 'error') => void;
  }
  let { notify }: Props = $props();

  let files = $state<Map<string, LogoFile> | null>(null);
  let catalogError = $state<string | null>(null);
  let userLogos = $state<UserLogo[]>([]);
  let query = $state('');
  let results = $state<LogoFile[]>([]);
  let searching = $state(false);
  let searched = $state(false);
  let busy = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  const zones: PanelId[] = ['front', 'back', 'spine'];

  onMount(() => {
    loadCatalogFiles()
      .then((m) => (files = m))
      .catch((e) => (catalogError = e instanceof Error ? e.message : 'Catalogue indisponible'));
    listUserLogos().then((l) => (userLogos = l));
  });

  async function place(ref: LogoRef, zone: PanelId, key: string) {
    busy = key;
    try {
      await addLogo(ref, zone);
    } catch {
      notify('Logo indisponible pour le moment.', 'error');
    } finally {
      busy = null;
    }
  }

  async function runSearch(e: Event) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    searching = true;
    try {
      results = await searchLogos(query);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Recherche impossible', 'error');
      results = [];
    } finally {
      searching = false;
      searched = true;
    }
  }

  async function importLogos(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const list = [...(input.files ?? [])];
    input.value = '';
    for (const f of list) {
      try {
        const src = await readAsDataUrl(f);
        const img = await loadImage(src);
        const logo: UserLogo = {
          id: uid(),
          name: f.name.replace(/\.[^.]+$/, ''),
          src,
          width: img.naturalWidth || 512,
          height: img.naturalHeight || 512,
          category: 'Mes logos',
        };
        await saveUserLogo(logo);
        userLogos = [...userLogos, logo];
      } catch {
        notify(`Impossible d'importer ${f.name}.`, 'error');
      }
    }
  }

  async function removeUserLogo(l: UserLogo) {
    if (!confirm(`Retirer « ${l.name} » de tes logos ?`)) return;
    await deleteUserLogo(l.id).catch(() => {});
    userLogos = userLogos.filter((x) => x.id !== l.id);
  }

  function commonsRef(f: LogoFile, name: string): LogoRef {
    return { kind: 'commons', url: f.url, name };
  }

  function onDragStart(e: DragEvent, ref: LogoRef) {
    e.dataTransfer?.setData(LOGO_MIME, JSON.stringify(ref));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
</script>

{#snippet tile(key: string, label: string, thumb: string, ref: LogoRef, zone: PanelId, onRemove?: () => void)}
  <div class="tile" class:busy={busy === key}>
    <button
      class="img"
      draggable="true"
      ondragstart={(e) => onDragStart(e, ref)}
      onclick={() => place(ref, zone, key)}
      title="Ajouter ({ZONE_SHORT[zone]}) — ou glisser sur la jaquette"
    >
      <img src={thumb} alt={label} loading="lazy" />
    </button>
    <span class="label" title={label}>{label}</span>
    <div class="zones">
      {#each zones as z}
        <button class:def={z === zone} onclick={() => place(ref, z, key)} title="Ajouter sur : {ZONE_SHORT[z]}">{ZONE_SHORT[z][0]}</button>
      {/each}
      {#if onRemove}
        <button class="rm" onclick={onRemove} title="Retirer de mes logos" aria-label="Retirer de mes logos">×</button>
      {/if}
    </div>
  </div>
{/snippet}

<div class="logos">
  <form class="bar" onsubmit={runSearch}>
    <input placeholder="Chercher un logo (éditeur, console…)" bind:value={query} aria-label="Chercher un logo" />
    <button class="primary" disabled={searching || query.trim().length < 2}>{searching ? '…' : 'OK'}</button>
  </form>
  <p class="hint">Clique sur un logo pour le poser à l'endroit habituel, ou choisis <b>F</b>ace, <b>D</b>os, <b>T</b>ranche. Les logos se rangent côte à côte.</p>

  {#if searched}
    <h4>Résultats Wikimedia Commons</h4>
    {#if results.length}
      <div class="grid">
        {#each results as f (f.title)}
          {@render tile(f.title, f.name, proxied(f.thumb), commonsRef(f, f.name), 'back')}
        {/each}
      </div>
    {:else}
      <p class="hint">Aucun logo trouvé. Essaie le nom exact de la marque.</p>
    {/if}
  {/if}

  <h4>
    Mes logos
    <button class="link" onclick={() => fileInput.click()}>＋ Importer</button>
  </h4>
  {#if userLogos.length}
    <div class="grid">
      {#each userLogos as l (l.id)}
        {@render tile(l.id, l.name, l.src, { kind: 'user', src: l.src, name: l.name }, 'back', () => removeUserLogo(l))}
      {/each}
    </div>
  {:else}
    <p class="hint">Importe tes propres logos (PNG transparent ou SVG) : ils restent disponibles pour toutes tes jaquettes.</p>
  {/if}

  {#if catalogError}
    <p class="error">{catalogError}</p>
  {/if}
  {#each CATALOG as section}
    <h4>{section.title}</h4>
    <div class="grid">
      {#each section.entries as entry (entry.file)}
        {@const f = files?.get(entry.file)}
        {#if f}
          {@render tile(entry.file, entry.label, proxied(f.thumb), commonsRef(f, entry.label), entry.zone)}
        {:else if !files && !catalogError}
          <div class="tile skeleton"></div>
        {/if}
      {/each}
    </div>
  {/each}

  <p class="hint legal">Logos téléchargés à la demande depuis Wikimedia Commons. Ce sont des marques de leurs propriétaires : usage personnel et non commercial.</p>
</div>

<input bind:this={fileInput} type="file" accept="image/png,image/svg+xml,image/webp" multiple hidden onchange={importLogos} />

<style>
  .logos {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar {
    display: flex;
    gap: 6px;
  }
  .bar input {
    flex: 1;
    min-width: 0;
  }
  h4 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 10px 0 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    font-size: 11px;
    text-transform: none;
    letter-spacing: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .tile.busy {
    opacity: 0.5;
    pointer-events: none;
  }
  .tile.skeleton {
    height: 92px;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .img {
    aspect-ratio: 1;
    padding: 8px;
    border-radius: 6px;
    background: repeating-conic-gradient(#d9dbe0 0 25%, #f2f3f5 0 50%) 0 0 / 10px 10px;
    border: 1px solid var(--line);
    cursor: grab;
    display: grid;
    place-items: center;
  }
  .img img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .label {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zones {
    display: flex;
    gap: 2px;
  }
  .zones button {
    flex: 1;
    padding: 1px 0;
    font-size: 10px;
    border-radius: 4px;
    color: var(--muted);
  }
  .zones button.def {
    color: var(--accent);
    border-color: #ff5a3c66;
  }
  .zones .rm:hover {
    color: #ff8a80;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.45;
  }
  .legal {
    margin-top: 10px;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: #ff8a80;
  }
</style>
