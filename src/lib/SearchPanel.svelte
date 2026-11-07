<script lang="ts">
  import { onMount } from 'svelte';
  import { TEMPLATE_STYLES, buildTemplate, type TemplateStyle } from './templates';
  import { editor } from './editor.svelte';
  import { coverRect, geometry, newImageLayer, newTextLayer, PANEL_LABELS, type ClipTarget } from './model';
  import { placeLogo } from './logos';
  import {
    VISUAL_MIME,
    findMoby,
    getCoverPacks,
    getGame,
    getStatus,
    loadVisual,
    proxied,
    searchGames,
    type CoverPack,
    type GameDetails,
    type MobyGame,
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

  // Modèle de mise en page.
  let style = $state<TemplateStyle>('affiche');
  let platform = $state('PC DVD-ROM');

  // Jaquettes officielles scannées (MobyGames, clé facultative).
  let hasMoby = $state(false);
  let moby = $state<MobyGame | null>(null);
  let mobyPlatform = $state<number | null>(null);
  let packs = $state<CoverPack[]>([]);
  let loadingPacks = $state(false);
  let mobyError = $state<string | null>(null);

  onMount(() => {
    if (!query && editor.doc.title) query = editor.doc.title;
    getStatus()
      .then((s) => {
        hasSgdb = s.steamgriddb;
        hasMoby = s.mobygames;
      })
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
      moby = null;
      packs = [];
      mobyError = null;
      if (hasMoby) loadMoby(g.name);
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

  async function loadMoby(title: string) {
    try {
      moby = await findMoby(title);
      mobyPlatform = moby?.platforms[0]?.id ?? null;
      if (moby && mobyPlatform) await loadPacks(mobyPlatform);
    } catch (err) {
      mobyError = err instanceof Error ? err.message : 'MobyGames indisponible';
    }
  }

  async function loadPacks(platformId: number) {
    if (!moby) return;
    mobyPlatform = platformId;
    loadingPacks = true;
    mobyError = null;
    try {
      packs = await getCoverPacks(moby.id, platformId);
    } catch (err) {
      packs = [];
      mobyError = err instanceof Error ? err.message : 'Scans indisponibles';
    } finally {
      loadingPacks = false;
    }
  }

  /** Crée la jaquette avec le modèle choisi (ou les scans officiels d'une édition). */
  async function build(pack?: CoverPack) {
    if (!game) return;
    if ((editor.doc.layers.length || editor.doc.disc.layers.length) && !confirm('Remplacer la jaquette et la rondelle actuelles par une mise en page automatique ? (⌘Z pour revenir en arrière)')) return;
    building = true;
    try {
      const load = (url: string | null | undefined) => (url && !broken[url] ? loadVisual(url).catch(() => undefined) : Promise.resolve(undefined));
      const [cover, hero, logo, studio, oFront, oBack, oSpine, oMedia, ...shots] = await Promise.all([
        load(coverUrl),
        load(heroUrl),
        load(logoUrl),
        load(studioUrl),
        load(pack?.front?.url),
        load(pack?.back?.url),
        load(pack?.spine?.url),
        load(pack?.media?.url),
        ...shotUrls.map((u) => load(u)),
      ]);
      const g = game;
      const input = {
        name: g.name,
        year: g.year,
        genres: g.genres,
        summary: summary.trim(),
        credits: credits(g),
        platform: platform.trim() || 'PC',
        cover,
        hero,
        logo,
        screenshots: shots.filter((s) => !!s),
        official: pack ? { front: oFront, back: oBack, spine: oSpine, media: oMedia } : undefined,
      };
      const result = buildTemplate(editor.doc, pack ? 'officiel' : style, input);
      const layers = result.layers;
      const disc = result.disc;
      // Le dos officiel a déjà ses logos : on n'ajoute le studio que sur nos modèles.
      if (studio && !pack?.back) {
        const label = game.studios.find((s) => s.url === studioUrl)?.label ?? 'Studio';
        editor.setSurface('case');
        layers.push({ ...placeLogo(geometry(editor.doc), layers, studio, 'back', label), tint: result.logoTint });
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

      <h4>Modèle</h4>
      <div class="styles" role="radiogroup" aria-label="Modèle de mise en page">
        {#each TEMPLATE_STYLES as t}
          <button role="radio" aria-checked={style === t.id} class="style" class:on={style === t.id} onclick={() => (style = t.id)} title={t.hint}>
            <span class="mini mini-{t.id}" aria-hidden="true"><i></i><b></b><u></u><s></s></span>
            <span>{t.name}</span>
          </button>
        {/each}
      </div>
      {#if style === 'bandeau'}
        <label class="plat">Texte du bandeau <input bind:value={platform} /></label>
      {/if}
      <button class="primary build" onclick={() => build()} disabled={building}>
        {building ? 'Téléchargement des visuels…' : '✦ Créer la jaquette automatiquement'}
      </button>

      <h4>Jaquettes officielles du commerce</h4>
      {#if !hasMoby}
        <p class="note">
          Pour retrouver les vraies jaquettes françaises (face, dos et disque scannés), ajoute une clé
          <strong>MobyGames</strong> dans <code>.env.local</code> (<code>MOBYGAMES_API_KEY</code>).
        </p>
      {:else if mobyError}
        <p class="error">{mobyError}</p>
      {:else if !moby}
        <p class="hint">Recherche sur MobyGames…</p>
      {:else}
        {#if moby.platforms.length > 1}
          <div class="row">
            {#each moby.platforms as p}
              <button class="chip" class:on={mobyPlatform === p.id} onclick={() => loadPacks(p.id)}>{p.name}</button>
            {/each}
          </div>
        {/if}
        {#if loadingPacks}
          <p class="hint">Chargement des scans…</p>
        {:else if !packs.length}
          <p class="hint">Aucun scan de boîte pour cette plateforme.</p>
        {:else}
          {#each packs.slice(0, 6) as pk}
            <div class="pack" class:fr={pk.french}>
              <div class="pack-head">
                <span>{pk.countries.includes('France') ? '🇫🇷 ' : ''}{pk.label}</span>
              </div>
              <div class="pack-imgs">
                {#each [pk.front, pk.back, pk.media].filter((v) => !!v) as v}
                  <img src={proxied(v!.thumb)} alt={v!.label ?? ''} title={v!.label ?? ''} loading="lazy" />
                {/each}
              </div>
              <button onclick={() => build(pk)} disabled={building || (!pk.front && !pk.back)}>Utiliser cette édition</button>
            </div>
          {/each}
        {/if}
      {/if}
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
  .styles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .style {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 5px 2px;
    font-size: 11px;
  }
  .style.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  /* Miniatures schématiques du dos de chaque modèle. */
  .mini {
    position: relative;
    width: 34px;
    height: 46px;
    border-radius: 2px;
    background: #2b2e36;
    overflow: hidden;
  }
  .mini i, .mini b, .mini u, .mini s {
    position: absolute;
    display: block;
    text-decoration: none;
  }
  .mini-affiche i { inset: 0 0 50% 0; background: linear-gradient(#c9853a, #2b2e36); }
  .mini-affiche b { left: 5px; right: 5px; top: 26px; height: 6px; background: repeating-linear-gradient(#aaa 0 1px, transparent 1px 2.5px); }
  .mini-affiche u { left: 4px; right: 4px; bottom: 6px; height: 5px; background: linear-gradient(90deg, #6b8fd6 30%, transparent 30% 35%, #6b8fd6 35% 65%, transparent 65% 70%, #6b8fd6 70%); }
  .mini-bandeau i { left: 0; right: 0; top: 0; height: 6px; background: #f0f0ee; }
  .mini-bandeau b { left: 0; right: 0; top: 6px; height: 12px; background: #c9853a; }
  .mini-bandeau u { left: 18px; right: 3px; top: 21px; height: 16px; background: linear-gradient(#6b8fd6 45%, transparent 45% 55%, #6b8fd6 55%); }
  .mini-bandeau s { left: 0; right: 0; bottom: 0; height: 5px; background: #f0f0ee; }
  .mini-epure b { left: 9px; right: 9px; top: 5px; height: 4px; background: #ddd; }
  .mini-epure i { left: 5px; right: 5px; top: 13px; height: 8px; background: repeating-linear-gradient(#aaa 0 1px, transparent 1px 2.5px); }
  .mini-epure u { left: 4px; width: 17px; top: 26px; height: 11px; background: #6b8fd6; }
  .mini-epure s { left: 23px; right: 4px; top: 26px; height: 11px; background: linear-gradient(#6b8fd6 45%, transparent 45% 55%, #6b8fd6 55%); }
  .mini-magazine i { left: 0; right: 0; top: 0; height: 13px; background: linear-gradient(#c9853a, #2b2e36); }
  .mini-magazine b { left: 3px; width: 14px; top: 16px; height: 24px; background: linear-gradient(#6b8fd6 28%, transparent 28% 36%, #6b8fd6 36% 64%, transparent 64% 72%, #6b8fd6 72%); }
  .mini-magazine u { left: 20px; right: 3px; top: 17px; height: 18px; background: repeating-linear-gradient(#aaa 0 1px, transparent 1px 2.5px); }
  .plat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
  }
  .chip {
    padding: 3px 8px;
    font-size: 11px;
    border-radius: 999px;
  }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .pack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    margin-top: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .pack.fr {
    border-color: #f5b43166;
  }
  .pack-head {
    font-size: 11px;
    color: var(--muted);
  }
  .pack-imgs {
    display: flex;
    gap: 4px;
  }
  .pack-imgs img {
    height: 70px;
    max-width: 33%;
    object-fit: contain;
    border-radius: 3px;
    background: var(--bg);
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
