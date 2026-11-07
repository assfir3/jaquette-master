<script lang="ts">
  import { onMount } from 'svelte';
  import { autoDiscLayout, autoLayout } from './autolayout';
  import { editor } from './editor.svelte';
  import { coverRect, geometry, newImageLayer, newTextLayer, PANEL_LABELS, type ClipTarget } from './model';
  import { placeLogo } from './logos';
  import {
    VISUAL_MIME,
    getGame,
    getStatus,
    loadVisual,
    proxied,
    searchGames,
    type GameDetails,
    type SearchResult,
    type Visual,
  } from './search';

  interface Props {
    notify: (text: string, kind?: 'info' | 'error') => void;
  }
  let { notify }: Props = $props();

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let searching = $state(false);
  let searched = $state(false);
  let game = $state<GameDetails | null>(null);
  let loadingGame = $state(false);
  let building = $state(false);
  let hasSgdb = $state(false);
  let error = $state<string | null>(null);

  // Choix pour la mise en page automatique.
  let coverUrl = $state<string | null>(null);
  let heroUrl = $state<string | null>(null);
  let logoUrl = $state<string | null>(null);
  let shotUrls = $state<string[]>([]);
  let studioUrl = $state<string | null>(null);
  let summary = $state('');
  let broken = $state<Record<string, true>>({});
  let placing = $state<string | null>(null);

  onMount(() => {
    if (!query && editor.doc.title) query = editor.doc.title;
    getStatus()
      .then((s) => (hasSgdb = s.steamgriddb))
      .catch(() => {});
  });

  async function runSearch(e?: Event) {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    searching = true;
    error = null;
    game = null;
    try {
      results = await searchGames(query);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Recherche impossible';
      results = [];
    } finally {
      searching = false;
      searched = true;
    }
  }

  async function openGame(r: SearchResult) {
    loadingGame = true;
    error = null;
    try {
      const g = await getGame(r);
      game = g;
      broken = {};
      coverUrl = g.covers[0]?.url ?? null;
      heroUrl = g.heroes[0]?.url ?? null;
      logoUrl = g.logos[0]?.url ?? null;
      shotUrls = g.screenshots.slice(0, 3).map((s) => s.url);
      studioUrl = g.studios?.[0]?.url ?? null;
      summary = g.summary;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fiche introuvable';
    } finally {
      loadingGame = false;
    }
  }

  function markBroken(v: Visual) {
    broken[v.url] = true;
    if (logoUrl === v.url) logoUrl = game?.logos.find((l) => !broken[l.url])?.url ?? null;
    if (coverUrl === v.url) coverUrl = game?.covers.find((l) => !broken[l.url])?.url ?? null;
    if (heroUrl === v.url) heroUrl = game?.heroes.find((l) => !broken[l.url])?.url ?? null;
  }

  function toggleShot(url: string) {
    if (shotUrls.includes(url)) shotUrls = shotUrls.filter((u) => u !== url);
    else shotUrls = [...shotUrls, url].slice(-3);
  }

  function credits(g: GameDetails): string {
    const parts: string[] = [];
    if (g.developers.length) parts.push(`Développé par ${g.developers.join(', ')}`);
    const pubs = g.publishers.filter((p) => !g.developers.includes(p));
    if (pubs.length) parts.push(`Édité par ${pubs.join(', ')}`);
    if (g.year) parts.push(g.year);
    if (g.genres.length) parts.push(g.genres.slice(0, 3).join(', '));
    return parts.join('  ·  ');
  }

  async function build() {
    if (!game) return;
    if ((editor.doc.layers.length || editor.doc.disc.layers.length) && !confirm('Remplacer la jaquette et la rondelle actuelles par une mise en page automatique ? (⌘Z pour revenir en arrière)')) return;
    building = true;
    try {
      const load = (url: string | null) => (url && !broken[url] ? loadVisual(url).catch(() => undefined) : Promise.resolve(undefined));
      const [cover, hero, logo, studio, ...shots] = await Promise.all([
        load(coverUrl),
        load(heroUrl),
        load(logoUrl),
        load(studioUrl),
        ...shotUrls.map((u) => load(u)),
      ]);
      const g = game;
      const input = {
        name: g.name,
        year: g.year,
        summary: summary.trim(),
        credits: credits(g),
        cover,
        hero,
        logo,
        screenshots: shots.filter((s) => !!s),
      };
      const layers = autoLayout(editor.doc, input);
      const disc = autoDiscLayout(editor.doc, input);
      if (studio) {
        // Logo du studio en blanc, rangé en bas du dos.
        const label = game.studios.find((s) => s.url === studioUrl)?.label ?? 'Studio';
        editor.setSurface('case');
        layers.push({ ...placeLogo(geometry(editor.doc), layers, studio, 'back', label), tint: '#ffffff' });
      }
      editor.update((d) => {
        d.title = g.name;
        d.layers = layers;
        d.disc.layers = disc.layers;
        d.disc.background = disc.background;
      });
      editor.selectedId = null;
      editor.renderVersion++;
      notify(`Jaquette et rondelle de « ${g.name} » créées. Tout reste modifiable.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise en page impossible', 'error');
    } finally {
      building = false;
    }
  }

  async function place(v: Visual, target: ClipTarget | 'disc') {
    placing = null;
    try {
      const asset = await loadVisual(v.url);
      if (target === 'disc') editor.setSurface('disc');
      else editor.setSurface('case');
      const t = target === 'disc' ? 'all' : target;
      editor.addLayer(newImageLayer(asset, coverRect(editor.geo, t, asset.width, asset.height), t, game?.name ?? 'Visuel'));
    } catch {
      notify('Image indisponible.', 'error');
    }
  }

  function addSummary() {
    // Le résumé va au dos du boîtier.
    editor.setSurface('case');
    const geo = editor.geo;
    editor.addLayer({
      ...newTextLayer(geo, 'back', summary),
      name: 'Résumé',
      fontFamily: 'Inter',
      fontSize: 8.5,
      bold: false,
      align: 'left',
      lineHeight: 1.4,
      shadow: false,
      y: 40,
    });
  }

  function onDragStart(e: DragEvent, v: Visual) {
    e.dataTransfer?.setData(VISUAL_MIME, v.url);
    e.dataTransfer!.effectAllowed = 'copy';
  }

  const targets: ClipTarget[] = ['front', 'back', 'spine', 'all'];
</script>

{#snippet visualGrid(list: Visual[], selected: string | null, onPick: (v: Visual) => void, kind: string)}
  <div class="grid {kind}">
    {#each list as v (v.url)}
      {#if !broken[v.url]}
        <div class="vis" class:on={selected === v.url || (kind === 'shots' && shotUrls.includes(v.url))}>
          <button
            class="thumb"
            draggable="true"
            ondragstart={(e) => onDragStart(e, v)}
            onclick={() => onPick(v)}
            title={v.label ? `${v.label} — cliquer pour choisir, glisser sur la jaquette pour placer` : 'Cliquer pour choisir, glisser sur la jaquette pour placer'}
          >
            <img src={proxied(v.thumb)} alt="" loading="lazy" onerror={() => markBroken(v)} />
          </button>
          <button class="add" title="Placer sur la jaquette" aria-label="Placer sur la jaquette" onclick={() => (placing = placing === v.url ? null : v.url)}>＋</button>
          {#if placing === v.url}
            <div class="place">
              {#each targets as t}<button onclick={() => place(v, t)}>{PANEL_LABELS[t]}</button>{/each}
              <button onclick={() => place(v, 'disc')}>Rondelle</button>
            </div>
          {/if}
          {#if kind === 'logos' || kind === 'studios'}
            {#if v.official}<span class="src official">Officiel</span>{:else if v.source === 'steamgriddb'}<span class="src">Fan</span>{/if}
          {:else if v.source === 'steamgriddb'}<span class="src">SGDB</span>{/if}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<div class="search">
  <form onsubmit={runSearch} class="bar">
    <input placeholder="Nom du jeu…" bind:value={query} aria-label="Nom du jeu à rechercher" />
    <button class="primary" disabled={searching || query.trim().length < 2}>{searching ? '…' : 'Chercher'}</button>
  </form>

  {#if error}<p class="error">{error}</p>{/if}

  {#if game}
    <div class="game">
      <button class="back" onclick={() => (game = null)}>← Résultats</button>
      <h3>{game.name}</h3>
      <p class="meta">{credits(game)}{#if game.pegi} · PEGI {game.pegi}{/if}</p>

      <button class="primary build" onclick={build} disabled={building}>
        {building ? 'Téléchargement des visuels…' : '✦ Créer la jaquette automatiquement'}
      </button>
      <p class="hint">Clique sur un visuel pour le choisir, ou glisse-le directement sur la jaquette.</p>

      {#if game.covers.length}
        <h4>Jaquette (face avant)</h4>
        {@render visualGrid(game.covers, coverUrl, (v) => (coverUrl = v.url), 'covers')}
      {/if}
      {#if game.heroes.length}
        <h4>Fond (dos)</h4>
        {@render visualGrid(game.heroes, heroUrl, (v) => (heroUrl = v.url), 'heroes')}
      {/if}
      {#if game.logos.some((l) => !broken[l.url])}
        <h4>Logo (tranche et dos)</h4>
        {@render visualGrid(game.logos, logoUrl, (v) => (logoUrl = logoUrl === v.url ? null : v.url), 'logos')}
      {/if}
      {#if game.screenshots.length}
        {#if game.studios?.some((s) => !broken[s.url])}
          <h4>Studio et éditeur (au dos)</h4>
          {@render visualGrid(game.studios, studioUrl, (v) => (studioUrl = studioUrl === v.url ? null : v.url), 'studios')}
        {/if}
        <h4>Captures (3 au dos)</h4>
        {@render visualGrid(game.screenshots, null, (v) => toggleShot(v.url), 'shots')}
      {/if}

      <h4>Résumé</h4>
      <textarea rows="6" bind:value={summary}></textarea>
      <div class="row">
        {#if game.about && game.about !== summary}
          <button onclick={() => (summary = game!.about)}>Version longue</button>
        {/if}
        {#if game.summary && summary !== game.summary}
          <button onclick={() => (summary = game!.summary)}>Version courte</button>
        {/if}
        <button onclick={addSummary} disabled={!summary.trim()}>Ajouter au dos</button>
      </div>
      {#if game.storeUrl}<p class="hint"><a href={game.storeUrl} target="_blank" rel="noreferrer">Voir la page du jeu</a></p>{/if}
    </div>
  {:else if loadingGame}
    <p class="hint">Chargement de la fiche…</p>
  {:else}
    <ul class="results">
      {#each results as r (r.source + r.id)}
        <li>
          <button onclick={() => openGame(r)}>
            {#if r.thumb}<img src={proxied(r.thumb)} alt="" />{:else}<span class="noimg">?</span>{/if}
            <span class="nm">{r.name}{#if r.year}<small> ({r.year})</small>{/if}</span>
            <span class="badge">{r.source === 'steam' ? 'Steam' : 'SGDB'}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if searched && !results.length && !searching && !error}
      <p class="hint">Aucun jeu trouvé. Essaie le titre anglais, ou un mot plus court.</p>
    {/if}
    {#if !hasSgdb}
      <p class="note">
        Recherche via Steam uniquement. Ajoute une clé <strong>SteamGridDB</strong> (gratuite) dans
        <code>.env.local</code> pour plus de jaquettes et de logos, et les jeux hors Steam.
      </p>
    {/if}
  {/if}
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bar {
    display: flex;
    gap: 6px;
  }
  .bar input {
    flex: 1;
    min-width: 0;
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .results button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 5px;
  }
  .results img,
  .noimg {
    width: 76px;
    height: 29px;
    object-fit: cover;
    border-radius: 4px;
    flex: none;
    background: var(--bg);
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .nm {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nm small {
    color: var(--muted);
  }
  .badge,
  .src {
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .game h3 {
    font-size: 15px;
    margin: 6px 0 2px;
  }
  .game h4 {
    margin: 14px 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .meta {
    margin: 0 0 10px;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.4;
  }
  .back {
    background: transparent;
    border: 0;
    padding: 0;
    color: var(--muted);
  }
  .build {
    width: 100%;
    padding: 9px;
  }
  .grid {
    display: grid;
    gap: 6px;
    grid-template-columns: repeat(3, 1fr);
  }
  .grid.heroes,
  .grid.shots,
  .grid.studios,
  .grid.logos {
    grid-template-columns: repeat(2, 1fr);
  }
  .vis {
    position: relative;
    border-radius: 6px;
    outline: 2px solid transparent;
    outline-offset: 1px;
  }
  .vis.on {
    outline-color: var(--accent);
  }
  .thumb {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    cursor: grab;
  }
  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .covers .thumb {
    aspect-ratio: 2 / 3;
  }
  .heroes .thumb {
    aspect-ratio: 3 / 1;
  }
  .shots .thumb {
    aspect-ratio: 16 / 9;
  }
  .studios .thumb,
  .logos .thumb {
    aspect-ratio: 2 / 1;
    background: repeating-conic-gradient(#7d8089 0 25%, #8e9199 0 50%) 0 0 / 12px 12px;
  }
  .studios .thumb img,
  .logos .thumb img {
    object-fit: contain;
    padding: 6px;
  }
  .add {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    font-size: 13px;
    line-height: 1;
    background: #000a;
    border-color: #fff3;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .vis:hover .add,
  .add:focus-visible {
    opacity: 1;
  }
  .place {
    position: absolute;
    top: 30px;
    right: 4px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--surface-3);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px #0009;
  }
  .place button {
    white-space: nowrap;
    text-align: left;
    padding: 4px 8px;
    font-size: 12px;
  }
  .src {
    position: absolute;
    left: 4px;
    bottom: 4px;
    background: #000a;
  }
  .src.official {
    color: #5fd38d;
    border-color: #5fd38d66;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font-size: 12px;
    line-height: 1.4;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .hint,
  .note {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.45;
  }
  .note {
    padding: 8px;
    border: 1px dashed var(--line);
    border-radius: 8px;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: #ff8a80;
  }
  a {
    color: var(--accent);
  }
</style>
