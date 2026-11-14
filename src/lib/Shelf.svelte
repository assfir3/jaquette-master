<script lang="ts">
  import { untrack } from 'svelte';
  import { CART, DISC, TEMPLATES, usesCartridge, type TemplateId } from './model';
  import { deleteFromShelf, listShelf, type ShelfEntry } from './storage';

  let {
    currentId,
    version,
    onOpen,
    onNew,
    onRename,
    onDuplicate,
    onDownload,
  }: {
    currentId: string;
    /** Change à chaque sauvegarde, pour relire l'étagère. */
    version: number;
    onOpen: (id: string) => void;
    onNew: () => void;
    onRename: (id: string, title: string) => void;
    onDuplicate: (id: string) => void;
    onDownload: (id: string) => void;
  } = $props();

  let entries = $state<ShelfEntry[]>([]);
  let loaded = $state(false);
  let picked = $state<string | null>(null);

  // Recherche, filtre, tri et vue : gardés pour la prochaine visite.
  type Sort = 'recent' | 'title' | 'format' | 'created';
  type View = 'shelf' | 'grid';
  const PREFS = 'jaquette-master:shelf';
  function loadPrefs(): { sort: Sort; view: View } {
    try {
      return { sort: 'recent', view: 'shelf', ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
    } catch {
      return { sort: 'recent', view: 'shelf' };
    }
  }
  const prefs = loadPrefs();
  let query = $state('');
  let format = $state<string>('all');
  let sort = $state<Sort>(prefs.sort);
  let layout = $state<View>(prefs.view);
  $effect(() => {
    const p = { sort, view: layout };
    try {
      localStorage.setItem(PREFS, JSON.stringify(p));
    } catch {
      // Stockage indisponible : réglages pour cette visite seulement.
    }
  });

  $effect(() => {
    void version;
    listShelf().then((list) => {
      entries = list;
      loaded = true;
    });
  });

  const tid = (e: ShelfEntry) => ((e.template ?? 'dvd') in TEMPLATES ? (e.template ?? 'dvd') : 'dvd') as TemplateId;

  /** Nom du format du boîtier. */
  function formatLabel(e: ShelfEntry): string {
    const t = TEMPLATES[tid(e)];
    return t.id === 'custom' ? 'Personnalisé' : t.name;
  }

  /** Largeur de la face avant (mm) : enregistrée, sinon celle du format. */
  function frontOf(e: ShelfEntry): number {
    return e.frontMm ?? TEMPLATES[tid(e)].panelWidth;
  }

  /** Formats présents sur l'étagère, avec leur nombre de jaquettes (pour le filtre). */
  const formats = $derived.by(() => {
    const count = new Map<TemplateId, number>();
    for (const e of entries) count.set(tid(e), (count.get(tid(e)) ?? 0) + 1);
    return [...count].map(([id, n]) => ({ id, n, name: TEMPLATES[id].name }));
  });

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const shown = $derived.by(() => {
    const q = norm(query.trim());
    const list = entries.filter((e) => (format === 'all' || tid(e) === format) && (!q || norm(e.title || 'sans titre').includes(q)));
    const byTitle = (a: ShelfEntry, b: ShelfEntry) => (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
    if (sort === 'title') list.sort(byTitle);
    else if (sort === 'format') list.sort((a, b) => formatLabel(a).localeCompare(formatLabel(b), 'fr') || byTitle(a, b));
    else if (sort === 'created') list.sort((a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt));
    else list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  });

  /** Partie de la face de la dernière boîte qui n'a pas de voisine pour la cacher (mm à l'écran). */
  const lastHidden = $derived(shown.length ? frontOf(shown[shown.length - 1]) * 0.1908 * 0.4 : 0);

  const selected = $derived(entries.find((e) => e.id === (picked ?? currentId)) ?? shown[0]);

  function when(t: number) {
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `il y a ${h} h`;
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Renommer directement dans la fiche.
  let editing = $state(false);
  let draft = $state('');
  function startRename() {
    draft = untrack(() => selected?.title ?? '');
    editing = true;
  }
  function commitRename() {
    if (!editing || !selected) return;
    editing = false;
    const title = draft.trim();
    if (title !== selected.title) {
      onRename(selected.id, title);
      entries = entries.map((e) => (e.id === selected.id ? { ...e, title } : e));
    }
  }

  async function remove(e: ShelfEntry) {
    if (!confirm(`Retirer « ${e.title || 'Sans titre'} » de l'étagère ? Elle sera effacée de ce navigateur.`)) return;
    await deleteFromShelf(e.id);
    entries = entries.filter((x) => x.id !== e.id);
    if (picked === e.id) picked = null;
  }

  /** Flèches gauche et droite pour passer d'une jaquette à l'autre, Entrée pour l'ouvrir. */
  function onKey(ev: KeyboardEvent) {
    if ((ev.target as HTMLElement).closest('input, select, textarea')) return;
    const i = shown.findIndex((e) => e.id === selected?.id);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      const next = shown[Math.min(shown.length - 1, Math.max(0, i + (ev.key === 'ArrowRight' ? 1 : -1)))];
      if (next) picked = next.id;
      ev.preventDefault();
    } else if (ev.key === 'Enter' && selected) {
      onOpen(selected.id);
    }
  }

  const sizeOf = (e: ShelfEntry) => `${Math.round((frontOf(e) * 2 + e.spineMm) * 10) / 10} × ${e.heightMm ?? 183} mm`;
</script>

<svelte:window onkeydown={onKey} />

<div class="shelf-view">
  <header>
    <div class="titles">
      <h1>Mon étagère</h1>
      <span class="count">
        {entries.length} jaquette{entries.length > 1 ? 's' : ''}
        {#if formats.length > 1}· {formats.length} formats{/if}
      </span>
    </div>
    <button class="primary new" onclick={onNew}>＋ Nouvelle jaquette</button>
  </header>

  {#if loaded && entries.length === 0}
    <p class="empty">Ton étagère est vide. Chaque jaquette que tu crées vient s'y ranger toute seule.</p>
  {:else if entries.length}
    <div class="toolbar">
      <input class="search" type="search" bind:value={query} placeholder="Rechercher un jeu…" aria-label="Rechercher une jaquette" />
      <div class="chips" role="radiogroup" aria-label="Format">
        <button role="radio" aria-checked={format === 'all'} class:on={format === 'all'} onclick={() => (format = 'all')}>Tous <b>{entries.length}</b></button>
        {#each formats as f (f.id)}
          <button role="radio" aria-checked={format === f.id} class:on={format === f.id} onclick={() => (format = f.id)}>{f.name} <b>{f.n}</b></button>
        {/each}
      </div>
      <select bind:value={sort} aria-label="Trier">
        <option value="recent">Modifiées récemment</option>
        <option value="created">Créées récemment</option>
        <option value="title">Titre A → Z</option>
        <option value="format">Par format</option>
      </select>
      <div class="seg" role="radiogroup" aria-label="Affichage">
        <button role="radio" aria-checked={layout === 'shelf'} class:on={layout === 'shelf'} onclick={() => (layout = 'shelf')} title="Étagère">▥ Étagère</button>
        <button role="radio" aria-checked={layout === 'grid'} class:on={layout === 'grid'} onclick={() => (layout = 'grid')} title="Grille des faces">▦ Grille</button>
      </div>
    </div>
  {/if}

  {#if entries.length && !shown.length}
    <p class="empty">Aucune jaquette ne correspond. <button class="link" onclick={() => ((query = ''), (format = 'all'))}>Tout afficher</button></p>
  {/if}

  {#if layout === 'shelf'}
    <!-- Vitrine éclairée : spot au-dessus de l'étagère, ombres sur la planche. -->
    <div class="vitrine">
      <div class="rack" role="listbox" aria-label="Jaquettes">
        {#each shown as e (e.id)}
          <button
            class="box"
            class:on={selected?.id === e.id}
            role="option"
            aria-selected={selected?.id === e.id}
            style:--s={Math.max(7, e.spineMm)}
            style:--f={frontOf(e)}
            style:--hmm={e.heightMm ?? 183}
            onclick={() => (picked = e.id)}
            ondblclick={() => onOpen(e.id)}
            title={e.title || 'Sans titre'}
          >
            <!-- Boîte vue légèrement de biais : la tranche face à nous, la face avant qui part en profondeur à droite. -->
            <span class="cube">
              <span class="face spine" style:background-image={e.spine ? `url(${e.spine})` : undefined}>
                {#if !e.spine}<span class="t">{e.title || 'Sans titre'}</span>{/if}
              </span>
              <span class="face front" style:background-image={e.front ? `url(${e.front})` : undefined}></span>
            </span>
          </button>
        {/each}
        <button class="add" style:--gap={lastHidden} onclick={onNew} aria-label="Nouvelle jaquette">
          <span class="plus">+</span>
          <span class="lbl">Nouvelle</span>
        </button>
      </div>
      <div class="plank"></div>
    </div>
  {:else}
    <div class="grid" role="listbox" aria-label="Jaquettes">
      {#each shown as e (e.id)}
        <button
          class="card"
          class:on={selected?.id === e.id}
          role="option"
          aria-selected={selected?.id === e.id}
          onclick={() => (picked = e.id)}
          ondblclick={() => onOpen(e.id)}
        >
          <span class="cover" style:aspect-ratio="{frontOf(e)} / {e.heightMm ?? 183}">
            {#if e.front}<img src={e.front} alt="" loading="lazy" />{:else}<span class="t">{e.title || 'Sans titre'}</span>{/if}
            {#if e.id === currentId}<span class="badge">Ouverte</span>{/if}
          </span>
          <span class="name">{e.title || 'Sans titre'}</span>
          <span class="sub">{formatLabel(e)} · {when(e.updatedAt)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if selected && shown.length}
    <article class="detail">
      <div class="flat" style:--hmm={selected.heightMm ?? 183}>
        <!-- Jaquette à plat : dos, tranche, face (comme à l'impression). -->
        <div class="wrap">
          {#if selected.back}<img src={selected.back} alt="Dos" style:aspect-ratio="{frontOf(selected)} / {selected.heightMm ?? 183}" />{/if}
          {#if selected.spine}<img src={selected.spine} alt="Tranche" style:aspect-ratio="{selected.spineMm} / {selected.heightMm ?? 183}" />{/if}
          {#if selected.front}<img src={selected.front} alt="Face avant" style:aspect-ratio="{frontOf(selected)} / {selected.heightMm ?? 183}" />{/if}
        </div>
        {#if selected.media}
          <img
            class="media"
            class:cart={usesCartridge({ template: tid(selected) })}
            src={selected.media}
            alt={usesCartridge({ template: tid(selected) }) ? 'Étiquette de cartouche' : 'Rondelle'}
          />
        {/if}
      </div>

      <div class="info">
        {#if editing}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="rename"
            bind:value={draft}
            autofocus
            onfocus={(e) => e.currentTarget.select()}
            onblur={commitRename}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') editing = false;
            }}
            aria-label="Titre de la jaquette"
          />
        {:else}
          <h2>
            {selected.title || 'Sans titre'}
            <button class="icon" onclick={startRename} title="Renommer" aria-label="Renommer">✎</button>
          </h2>
        {/if}
        {#if selected.id === currentId}<span class="badge inline">Ouverte dans l'atelier</span>{/if}

        <dl>
          <dt>Format</dt><dd>{formatLabel(selected)}</dd>
          <dt>Dimensions</dt><dd>{sizeOf(selected)} · tranche {selected.spineMm} mm</dd>
          <dt>{usesCartridge({ template: tid(selected) }) ? 'Cartouche' : 'Rondelle'}</dt>
          <dd>
            {#if selected.mediaCount}
              {usesCartridge({ template: tid(selected) }) ? `étiquette ${CART.width} × ${CART.height} mm` : `disque ${DISC.size} mm`} · {selected.mediaCount} élément{selected.mediaCount > 1 ? 's' : ''}
            {:else if selected.mediaCount === 0}
              pas encore faite
            {:else}
              —
            {/if}
          </dd>
          {#if selected.layerCount !== undefined}<dt>Éléments</dt><dd>{selected.layerCount} sur la jaquette</dd>{/if}
          <dt>Modifiée</dt><dd>{when(selected.updatedAt)}</dd>
          {#if selected.createdAt}<dt>Créée</dt><dd>{when(selected.createdAt)}</dd>{/if}
        </dl>

        <div class="actions">
          <button class="primary" onclick={() => onOpen(selected.id)}>
            {selected.id === currentId ? "Retourner à l'atelier" : 'Ouvrir dans l’atelier'}
          </button>
          <button onclick={() => onDuplicate(selected.id)} title="Crée une copie modifiable (autre édition, autre plateforme…)">Dupliquer</button>
          <button onclick={() => onDownload(selected.id)} title="Fichier .jaquette.json à garder ou à partager">Enregistrer le fichier</button>
          <button class="danger" onclick={() => remove(selected)}>Retirer</button>
        </div>
        <p class="hint">Double-clic sur une jaquette pour l'ouvrir · flèches ← → pour passer à la suivante · Entrée pour ouvrir.</p>
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
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .titles {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  h1 {
    margin: 0;
    font: 400 32px/1 var(--display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  header .new {
    height: 38px;
    padding: 0 18px;
    border-radius: 999px;
  }
  .count,
  .sub,
  dt {
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
    gap: 1px;
    /* Place pour la boîte sélectionnée, qui se soulève avec son contour ;
       en bas, place pour l'ombre des boîtes, dessinée par-dessus la planche. */
    position: relative;
    z-index: 1;
    padding: 20px 12px 8px;
    margin-bottom: -8px;
    overflow-x: auto;
    /* La perspective déborde un peu en hauteur : pas de barre de défilement verticale. */
    overflow-y: hidden;
    /* Échelle commune : 1 mm de boîte = --u pixels (un DVD de 183 mm occupe toute la hauteur). */
    --u: calc(clamp(180px, 46vh, 360px) / 183);
  }
  /*
   * Boîte tournée de 11° : à l'écran, la tranche occupe s·cos11° et la face avant f·sin11°.
   * Les boîtes sont serrées comme sur une vraie étagère : la suivante cache le fond de la face
   * (qui part en profondeur), on n'en réserve que 60 %.
   */
  .box {
    flex: none;
    position: relative;
    width: calc(var(--u) * (var(--s) * 0.9816 + var(--f) * 0.1908 * 0.6));
    height: calc(var(--u) * var(--hmm));
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    perspective: 1400px;
    perspective-origin: 20% 40%;
    z-index: 0;
    /* Léger rebond en fin de course, comme une boîte qu'on tire de l'étagère. */
    transition:
      transform 0.35s cubic-bezier(0.2, 0.8, 0.25, 1.25),
      margin-right 0.4s cubic-bezier(0.2, 0.8, 0.25, 1);
  }
  .cube {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(var(--u) * var(--s));
    height: 100%;
    transform-style: preserve-3d;
    transform-origin: left center;
    transform: rotateY(-11deg);
    transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.25, 1.15);
  }
  .face {
    position: absolute;
    top: 0;
    height: 100%;
    background: var(--surface-3) center / 100% 100% no-repeat;
    backface-visibility: hidden;
  }
  .face.spine {
    left: 0;
    width: 100%;
    border-radius: 1.5px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 1px 0 0 #fff2, inset -1px 0 0 #0005;
  }
  /* Reflet du film plastique sur la tranche. */
  /* Lumière qui tombe du spot (haut plus clair, bas dans l'ombre) et reflet du film plastique. */
  .face.spine::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, #fff3e033 0%, transparent 26%, transparent 68%, #00000055 100%),
      linear-gradient(90deg, #ffffff26, transparent 35%, transparent 70%, #0000002e);
    pointer-events: none;
  }
  /* La face avant part à angle droit depuis le bord droit de la tranche ; un peu plus sombre (moins éclairée). */
  .face.front {
    left: 100%;
    width: calc(var(--u) * var(--f));
    transform-origin: left center;
    transform: rotateY(90deg);
    filter: brightness(0.7) saturate(0.92);
  }
  .face.front::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, #fff3e026 0%, transparent 30%, transparent 70%, #00000059 100%),
      linear-gradient(90deg, #00000040, transparent 30%, #ffffff14);
  }
  .face {
    transition: filter 0.3s ease;
  }
  /* La boîte survolée passe dans la lumière. */
  .box:hover .face.spine,
  .box.on .face.spine {
    filter: brightness(1.12);
  }
  .box:hover .face.front,
  .box.on .face.front {
    filter: brightness(0.92) saturate(1);
  }
  /* Ombre douce de la boîte sur la planche. */
  .box::before {
    content: '';
    position: absolute;
    left: -4%;
    right: -12%;
    bottom: -7px;
    height: 14px;
    z-index: -1;
    background: radial-gradient(ellipse at 45% 50%, #000000d0, transparent 70%);
    filter: blur(2px);
    pointer-events: none;
  }
  .t {
    writing-mode: vertical-rl;
    font: 400 14px 'Bebas Neue', sans-serif;
    letter-spacing: 0.1em;
    white-space: nowrap;
    overflow: hidden;
  }
  /*
   * Survol : comme quand on feuillette un bac à disques, la boîte pivote pour montrer sa face
   * et les boîtes à sa droite glissent pour lui laisser la place (rien ne se chevauche).
   * Place supplémentaire = (s·cos45° + f·sin45°) − (s·cos11° + 0,6·f·sin11°) = f·0,5926 − s·0,2745.
   */
  .box {
    margin-right: 0;
  }
  /* La jaquette sélectionnée reste ouverte de la même façon, jusqu'à ce qu'on en choisisse une autre. */
  .box:hover,
  .box.on {
    z-index: 1;
    transform: translateY(-4px);
    margin-right: calc(var(--u) * (var(--f) * 0.5926 - var(--s) * 0.2745));
  }
  .box:hover .cube,
  .box.on .cube {
    transform: rotateY(-45deg);
  }
  /* Reflet qui glisse sur le film plastique de la tranche. */
  .face.spine::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(172deg, transparent 38%, #ffffff3d 50%, transparent 62%) 0 100% / 100% 300% no-repeat;
    opacity: 0;
    transition: background-position 0s, opacity 0.2s;
    pointer-events: none;
  }
  .box:hover .face.spine::before {
    opacity: 1;
    background-position: 0 0;
    transition: background-position 0.7s ease-out, opacity 0.2s;
  }
  @media (prefers-reduced-motion: reduce) {
    .box,
    .cube,
    .face.spine::before {
      transition: none;
    }
    .box:hover .cube,
    .box.on .cube {
      transform: rotateY(-11deg);
    }
    .box:hover,
    .box.on {
      margin-right: 0;
    }
    .box:hover .face.spine::before {
      opacity: 0;
    }
  }
  .box:focus-visible {
    outline: none;
  }
  .box:focus-visible .face.spine {
    outline: 2px solid var(--accent-text);
    outline-offset: 2px;
  }
  /* Emplacement pour une nouvelle jaquette : plus large et moins haut qu'une boîte, aux coins arrondis.
     Il laisse visible toute la face de la dernière boîte. */
  .add {
    flex: none;
    align-self: flex-end;
    margin-left: calc(var(--u) * var(--gap, 0) + 10px);
    /* À l'échelle de l'étagère, mais jamais trop étroit pour son libellé (petits écrans). */
    width: max(calc(var(--u) * 34), 84px);
    height: calc(var(--u) * 120);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0;
    border: 1.5px dashed var(--icon-2);
    border-radius: 10px;
    background: #ffffff05;
    color: var(--muted);
    transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .add:hover {
    border-color: var(--accent);
    color: var(--accent-text);
    transform: translateY(-4px);
  }
  .add .plus {
    font-size: 26px;
    line-height: 1;
  }
  .add .lbl {
    font-size: 10px;
    letter-spacing: 0.06em;
    white-space: nowrap;
    text-transform: uppercase;
  }
  /*
   * Vitrine : un spot chaud au-dessus de l'étagère (rampe lumineuse + halo),
   * une lueur derrière les boîtes, et la planche dont le bord avant accroche la lumière.
   */
  .vitrine {
    position: relative;
    flex: none;
    margin: 0 -12px 32px;
    padding: 18px 12px 0;
    border-radius: 16px;
    background:
      radial-gradient(70% 90% at 30% -8%, #ffe6c447, transparent 64%),
      radial-gradient(45% 30% at 25% 100%, #ffe6c41f, transparent 75%),
      radial-gradient(60% 50% at 35% 70%, #8fa2ff10, transparent 70%),
      linear-gradient(180deg, #ffffff06, transparent 40%);
  }
  .vitrine::before {
    content: '';
    position: absolute;
    top: 0;
    left: 8%;
    right: 8%;
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(90deg, transparent, #fff1dc 20%, #fff1dc 80%, transparent);
    box-shadow: 0 0 22px 6px #ffd9a840, 0 6px 40px 10px #ffd9a81f;
    opacity: 0.85;
    pointer-events: none;
  }
  .plank {
    position: relative;
    height: 10px;
    background: linear-gradient(180deg, var(--plank-1), var(--plank-2) 35%, var(--plank-3));
    border-radius: 2px;
    box-shadow: inset 0 1px 0 #ffffff30, 0 14px 30px var(--shadow);
  }
  /* Barre d'outils : recherche, formats, tri, affichage. */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .search {
    width: 220px;
    height: 34px;
    border-radius: 999px;
    padding: 0 14px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
  }
  .chips button {
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .chips button b {
    font-family: var(--mono);
    font-weight: 500;
    margin-left: 4px;
    opacity: 0.7;
  }
  .chips button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .toolbar select {
    height: 34px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent-text);
    text-decoration: underline;
  }

  /* Grille des faces avant. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 22px 18px;
    padding: 18px 2px 30px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    color: var(--text);
  }
  .cover {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface-3);
    box-shadow: 0 10px 24px #0008;
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.25, 1.2), box-shadow 0.25s ease;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .card:hover .cover {
    transform: translateY(-5px) rotate(-1deg);
    box-shadow: 0 18px 34px #000a;
  }
  .card.on .cover {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .name {
    font-weight: 600;
    font-size: 13px;
    line-height: 1.25;
  }
  .badge {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 10px;
    font-weight: 600;
  }
  .badge.inline {
    position: static;
    align-self: flex-start;
  }

  /* Fiche de la jaquette sélectionnée. */
  .detail {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
  }
  .flat {
    display: flex;
    align-items: center;
    gap: 22px;
    flex-wrap: wrap;
  }
  .wrap {
    display: flex;
    height: clamp(170px, 30vh, 260px);
    box-shadow: 0 20px 50px #000a;
    border-radius: 3px;
    overflow: hidden;
  }
  .wrap img {
    height: 100%;
    display: block;
  }
  .media {
    width: clamp(90px, 14vh, 130px);
    filter: drop-shadow(0 10px 20px #000a);
  }
  .media.cart {
    width: clamp(50px, 8vh, 70px);
    border-radius: 4px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 260px;
    flex: 1;
  }
  .info h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 28px/1.1 var(--display);
    color: var(--text);
    letter-spacing: 0.02em;
    margin: 0;
  }
  .icon {
    background: none;
    border: 0;
    padding: 2px 6px;
    color: var(--muted);
    font-size: 16px;
  }
  .icon:hover {
    color: var(--accent-text);
  }
  .rename {
    font: 400 24px/1.1 var(--display);
    letter-spacing: 0.02em;
    max-width: 420px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 4px 0 0;
    font-size: 13px;
  }
  dt {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 11px;
    padding-top: 2px;
  }
  dd {
    margin: 0;
    color: var(--text);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .actions button {
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }
</style>
