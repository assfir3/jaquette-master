<script lang="ts">
  import { onMount } from 'svelte';
  import Canvas from './lib/Canvas.svelte';
  import Inspector from './lib/Inspector.svelte';
  import SearchPanel from './lib/SearchPanel.svelte';
  import LogosPanel from './lib/LogosPanel.svelte';
  import { addLogo, type LogoRef } from './lib/logos';
  import { loadVisual } from './lib/search';
  import { editor } from './lib/editor.svelte';
  import { PDF_MODES, exportDiscPdf, exportDiscPng, exportPdf, exportPng, type PdfMode } from './lib/export';
  import {
    DISC,
    TEMPLATES,
    coverRect,
    geometry,
    newDoc,
    newImageLayer,
    newRectLayer,
    newSpineTitle,
    newTextLayer,
    type ClipTarget,
    type Layer,
  } from './lib/model';
  import {
    autosave,
    download,
    fromProjectFile,
    loadAutosave,
    readAsDataUrl,
    slugify,
    toProjectFile,
  } from './lib/storage';

  const doc = $derived(editor.doc);
  const geo = $derived(editor.geo);
  const isDisc = $derived(editor.surface === 'disc');
  const template = $derived(TEMPLATES[doc.template]);

  let imageTarget = $state<ClipTarget>('front');
  let tab = $state<'search' | 'logos' | 'design'>('search');
  let show3d = $state(false);
  let exportOpen = $state(false);
  let busy = $state<string | null>(null);
  let toast = $state<{ text: string; kind: 'info' | 'error' } | null>(null);
  let fileInput: HTMLInputElement;
  let projectInput: HTMLInputElement;
  let ready = $state(false);

  function notify(text: string, kind: 'info' | 'error' = 'info') {
    toast = { text, kind };
    setTimeout(() => {
      if (toast?.text === text) toast = null;
    }, 4500);
  }

  onMount(() => {
    loadAutosave()
      .then(async (saved) => {
        if (saved) {
          const { doc, assets } = await fromProjectFile(saved);
          editor.load(doc, assets);
        }
      })
      .catch(() => {})
      .finally(() => (ready = true));
  });

  // Sauvegarde automatique, une seconde après la dernière modification.
  $effect(() => {
    const snapshot = $state.snapshot(editor.doc);
    if (!ready) return;
    const t = setTimeout(() => autosave(toProjectFile(snapshot, editor.usedAssets())), 1000);
    return () => clearTimeout(t);
  });

  async function addImages(files: Blob[], target: ClipTarget) {
    try {
      for (const file of files) {
        const asset = await editor.addAsset(await readAsDataUrl(file));
        const t = editor.surface === 'disc' ? 'all' : target;
        const rect = coverRect(editor.geo, t, asset.width, asset.height);
        const name = file instanceof File ? file.name.replace(/\.[^.]+$/, '') : 'Image collée';
        editor.addLayer(newImageLayer(asset, rect, t, name));
      }
    } catch {
      notify("Impossible de lire cette image.", 'error');
    }
  }

  async function addVisual(url: string, target: ClipTarget) {
    try {
      const asset = await loadVisual(url);
      const t = editor.surface === 'disc' ? 'all' : target;
      editor.addLayer(newImageLayer(asset, coverRect(editor.geo, t, asset.width, asset.height), t, doc.title || 'Visuel'));
    } catch {
      notify('Image indisponible.', 'error');
    }
  }

  function onPickImages(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    addImages(files, imageTarget);
  }

  function newProject() {
    if ((doc.layers.length || doc.disc.layers.length) && !confirm('Commencer une nouvelle jaquette ? Pense à enregistrer celle-ci avant.')) return;
    editor.load(newDoc(), []);
  }

  function saveProject() {
    const data = toProjectFile($state.snapshot(editor.doc), editor.usedAssets());
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slugify(doc.title)}.jaquette.json`);
  }

  async function openProject(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const { doc, assets } = await fromProjectFile(JSON.parse(await file.text()));
      editor.load(doc, assets);
      notify(`Projet « ${doc.title || file.name} » ouvert.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier illisible.', 'error');
    }
  }

  async function runExport(kind: PdfMode | 'png' | 'disc-png' | 'disc-pdf') {
    exportOpen = false;
    busy = 'Préparation du fichier à 300 dpi…';
    try {
      const d = $state.snapshot(editor.doc);
      if (kind === 'png') await exportPng(d, editor.assets);
      else if (kind === 'disc-png') await exportDiscPng(d, editor.assets);
      else if (kind === 'disc-pdf') await exportDiscPdf(d, editor.assets);
      else {
        const warning = await exportPdf(d, editor.assets, kind);
        if (warning) notify(warning);
      }
    } catch (err) {
      console.error(err);
      notify("L'export a échoué.", 'error');
    } finally {
      busy = null;
    }
  }

  function addLayer(layer: Layer) {
    editor.addLayer(layer);
  }

  function setDisc(key: 'outer' | 'inner', value: number) {
    if (!Number.isFinite(value)) return;
    const min = key === 'outer' ? 100 : DISC.hole;
    const max = key === 'outer' ? DISC.size : 60;
    editor.update((d) => (d.disc[key] = Math.min(max, Math.max(min, value))), `disc:${key}`);
  }

  function setSpine(value: number) {
    if (!Number.isFinite(value) || value < 3 || value > 60) return;
    const old = geometry(editor.doc);
    const delta = value - old.panels.spine.w;
    // Les éléments de la face avant suivent le changement de largeur de la tranche.
    editor.update((d) => {
      d.spine = value;
      for (const l of d.layers) {
        if (l.clip === 'front') l.x += delta;
        else if (l.clip === 'spine') {
          l.x += delta / 2;
        } else if (l.clip === 'all' && l.x >= old.panels.front.x) l.x += delta;
      }
    }, 'spine');
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProject();
      return;
    }
    if (typing) return;
    const sel = editor.selected;
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      editor.removeLayer(sel.id);
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      editor.duplicateLayer(sel.id);
    } else if (e.key === 'Escape') {
      editor.selectedId = null;
    } else if (e.key.startsWith('Arrow') && !sel.locked) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 0.5;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      editor.updateLayer(sel.id, { x: sel.x + dx, y: sel.y + dy }, `${sel.id}:nudge`);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    const files = [...(e.clipboardData?.items ?? [])]
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      addImages(files, imageTarget);
    }
  }

  const layerIcon = { image: '▣', text: 'T', rect: '■' } as const;
</script>

<svelte:window onkeydown={onKey} onpaste={onPaste} onclick={() => (exportOpen = false)} />

<div class="app">
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="6" width="26" height="20" rx="2" fill="#f5b431" /><rect x="14.5" y="6" width="3" height="20" fill="#1b1d22" /></svg>
      <span>Jaquette Master</span>
    </div>
    <input
      class="title"
      placeholder="Nom du jeu"
      value={doc.title}
      oninput={(e) => editor.update((d) => (d.title = (e.currentTarget as HTMLInputElement).value), 'title')}
      aria-label="Nom du jeu"
    />
    <div class="spacer"></div>
    <div class="group">
      <button onclick={newProject}>Nouveau</button>
      <button onclick={() => projectInput.click()}>Ouvrir</button>
      <button onclick={saveProject} title="⌘S">Enregistrer</button>
    </div>
    <div class="group">
      <button onclick={() => editor.undo()} disabled={!editor.canUndo} title="Annuler (⌘Z)" aria-label="Annuler">↶</button>
      <button onclick={() => editor.redo()} disabled={!editor.canRedo} title="Rétablir (⇧⌘Z)" aria-label="Rétablir">↷</button>
    </div>
    <div class="export">
      <button
        class="primary"
        onclick={(e) => {
          e.stopPropagation();
          exportOpen = !exportOpen;
        }}
        disabled={!!busy}
      >Exporter ▾</button>
      {#if exportOpen}
        <div class="menu" role="menu">
          <p class="menu-title">Boîtier</p>
          {#each PDF_MODES as m}
            <button role="menuitem" onclick={() => runExport(m.id)}>
              <strong>{m.label}</strong><small>{m.hint}</small>
            </button>
          {/each}
          <button role="menuitem" onclick={() => runExport('png')}>
            <strong>Image PNG</strong><small>300 dpi, fond perdu compris</small>
          </button>
          <p class="menu-title">Rondelle</p>
          <button role="menuitem" onclick={() => runExport('disc-png')} disabled={!doc.disc.layers.length}>
            <strong>Rondelle PNG</strong><small>Transparent autour et au centre, pour l'impression sur CD</small>
          </button>
          <button role="menuitem" onclick={() => runExport('disc-pdf')} disabled={!doc.disc.layers.length}>
            <strong>Rondelle PDF A4</strong><small>Taille réelle et cercles de découpe (papier autocollant)</small>
          </button>
        </div>
      {/if}
    </div>
  </header>

  <aside class="panel sidebar">
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'search'} class:on={tab === 'search'} onclick={() => (tab = 'search')}>Recherche</button>
      <button role="tab" aria-selected={tab === 'logos'} class:on={tab === 'logos'} onclick={() => (tab = 'logos')}>Logos</button>
      <button role="tab" aria-selected={tab === 'design'} class:on={tab === 'design'} onclick={() => (tab = 'design')}>Mise en page</button>
    </div>
    <div class="tabpanel" hidden={tab !== 'search'}>
      <SearchPanel {notify} />
    </div>
    <div class="tabpanel" hidden={tab !== 'logos'}>
      <LogosPanel {notify} />
    </div>
    <div class="tabpanel" hidden={tab !== 'design'}>
    {#if isDisc}
    <section>
      <h2>Rondelle</h2>
      <label>Bord extérieur imprimable
        <div class="row">
          <select value={DISC.outerPresets.find((p) => p.value === doc.disc.outer)?.value ?? ''} onchange={(e) => setDisc('outer', Number((e.currentTarget as HTMLSelectElement).value))}>
            {#each DISC.outerPresets as p}<option value={p.value}>{p.label}</option>{/each}
            <option value="" disabled>Personnalisé</option>
          </select>
          <input class="mm" type="number" min="100" max="120" step="0.5" value={doc.disc.outer} onchange={(e) => setDisc('outer', Number((e.currentTarget as HTMLInputElement).value))} />
          <span class="u">mm</span>
        </div>
      </label>
      <label>Centre imprimable
        <div class="row">
          <select value={DISC.innerPresets.find((p) => p.value === doc.disc.inner)?.value ?? ''} onchange={(e) => setDisc('inner', Number((e.currentTarget as HTMLSelectElement).value))}>
            {#each DISC.innerPresets as p}<option value={p.value}>{p.label}</option>{/each}
            <option value="" disabled>Personnalisé</option>
          </select>
          <input class="mm" type="number" min="15" max="60" step="0.5" value={doc.disc.inner} onchange={(e) => setDisc('inner', Number((e.currentTarget as HTMLInputElement).value))} />
          <span class="u">mm</span>
        </div>
      </label>
      <p class="dims">Regarde sur l'emballage de tes CD/DVD imprimables : la zone imprimable y est indiquée (souvent 22–118 mm ou 41–118 mm).</p>
      <div class="row">
        <label class="inline">Fond
          <input type="color" value={doc.disc.background} oninput={(e) => editor.update((d) => (d.disc.background = (e.currentTarget as HTMLInputElement).value), 'disc:bg')} />
        </label>
        <label class="inline check"><input type="checkbox" bind:checked={editor.showGuides} />Repères</label>
      </div>
    </section>

    <section>
      <h2>Ajouter</h2>
      <button class="primary" onclick={() => fileInput.click()}>＋ Image</button>
      <p class="hint">Ou glisse une image sur la rondelle, ou colle-la avec ⌘V.</p>
      <div class="grid2">
        <button onclick={() => addLayer({ ...newTextLayer(geo, 'front', doc.title || 'TITRE DU JEU'), name: 'Titre', y: 22, x: 20, width: 80 })}>Titre</button>
        <button onclick={() => addLayer({ ...newTextLayer(geo, 'front', 'DISQUE 1'), name: 'Texte bas', fontFamily: 'Inter', fontSize: 9, y: 92, x: 30, width: 60, shadow: false })}>Texte bas</button>
      </div>
    </section>
    {:else}
    <section>
      <h2>Jaquette</h2>
      <label>Format
        <select value={doc.template} disabled>
          {#each Object.values(TEMPLATES) as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
      <label>Épaisseur de la tranche
        <div class="row">
          <select value={template.spinePresets.find((p) => p.value === doc.spine)?.value ?? ''} onchange={(e) => setSpine(Number((e.currentTarget as HTMLSelectElement).value))}>
            {#each template.spinePresets as p}<option value={p.value}>{p.label}</option>{/each}
            <option value="" disabled>Personnalisée</option>
          </select>
          <input class="mm" type="number" min="3" max="60" step="0.5" value={doc.spine} onchange={(e) => setSpine(Number((e.currentTarget as HTMLInputElement).value))} />
          <span class="u">mm</span>
        </div>
      </label>
      <p class="dims">{geo.W} × {geo.H} mm · fond perdu {geo.bleed} mm</p>
      <div class="row">
        <label class="inline">Fond
          <input type="color" value={doc.background} oninput={(e) => editor.update((d) => (d.background = (e.currentTarget as HTMLInputElement).value), 'bg')} />
        </label>
        <label class="inline check"><input type="checkbox" bind:checked={editor.showGuides} />Repères</label>
      </div>
    </section>

    <section>
      <h2>Ajouter</h2>
      <div class="row">
        <button class="primary grow" onclick={() => fileInput.click()}>＋ Image</button>
        <select bind:value={imageTarget} aria-label="Où placer l'image">
          <option value="front">sur la face</option>
          <option value="back">sur le dos</option>
          <option value="spine">sur la tranche</option>
          <option value="all">sur tout</option>
        </select>
      </div>
      <p class="hint">Ou glisse une image directement sur la jaquette, ou colle-la avec ⌘V.</p>
      <div class="grid2">
        <button onclick={() => addLayer(newTextLayer(geo, 'front', doc.title || 'TITRE DU JEU'))}>Titre face</button>
        <button onclick={() => addLayer(newSpineTitle(geo, doc.title))}>Titre tranche</button>
        <button onclick={() => addLayer({ ...newTextLayer(geo, 'back', 'Résumé du jeu…'), name: 'Résumé', fontFamily: 'Inter', fontSize: 9, bold: false, align: 'left', y: geo.H * 0.45, shadow: false, lineHeight: 1.35 })}>Texte dos</button>
        <button onclick={() => addLayer(newRectLayer(geo, 'spine'))}>Couleur tranche</button>
        <button onclick={() => addLayer({ ...newRectLayer(geo, 'front'), name: 'Bandeau face' })}>Bandeau face</button>
        <button onclick={() => addLayer({ ...newRectLayer(geo, 'back'), name: 'Bandeau dos', y: geo.H + geo.bleed - 22 })}>Bandeau dos</button>
      </div>
    </section>
    {/if}

    <section class="layers">
      <h2>Calques</h2>
      {#if editor.layers.length === 0}
        <p class="hint">Aucun élément pour l'instant.</p>
      {/if}
      <ul>
        {#each [...editor.layers].reverse() as l (l.id)}
          <li class:selected={l.id === editor.selectedId}>
            <button class="pick" onclick={() => (editor.selectedId = l.id)}>
              <span class="ic">{layerIcon[l.type]}</span>
              <span class="nm">{l.name}</span>
              {#if l.locked}<span class="tag">🔒</span>{/if}
            </button>
            <button
              class="eye"
              title={l.hidden ? 'Afficher' : 'Masquer'}
              aria-label={l.hidden ? 'Afficher' : 'Masquer'}
              onclick={() => editor.updateLayer(l.id, { hidden: !l.hidden })}
            >{l.hidden ? '◌' : '●'}</button>
          </li>
        {/each}
      </ul>
    </section>
    </div>
  </aside>

  <main class="stage">
    <Canvas onDropFiles={(files, panel) => addImages(files, panel)} onDropVisual={(url, panel) => addVisual(url, panel)}
      onDropLogo={(ref, panel) => addLogo(ref, panel).catch(() => notify('Logo indisponible.', 'error'))}
    />
    <div class="surfaces seg" role="tablist" aria-label="Surface à modifier">
      <button role="tab" aria-selected={!isDisc && !show3d} class:on={!isDisc && !show3d} onclick={() => ((show3d = false), editor.setSurface('case'))}>Boîtier</button>
      <button role="tab" aria-selected={isDisc && !show3d} class:on={isDisc && !show3d} onclick={() => ((show3d = false), editor.setSurface('disc'))}>Rondelle</button>
      <button role="tab" aria-selected={show3d} class:on={show3d} onclick={() => ((show3d = true), (editor.selectedId = null))}>3D</button>
    </div>
    {#if show3d}
      <!-- Chargé à la demande : Three.js n'alourdit pas le démarrage. -->
      {#await import('./lib/Preview3D.svelte') then m}
        <m.default />
      {/await}
    {/if}
    {#if ready && !show3d && editor.layers.length === 0}
      <div class="welcome">
        {#if isDisc}
          <h1>La rondelle du disque</h1>
          <p>Glisse une image sur le disque, ou crée la jaquette automatiquement depuis la <strong>Recherche</strong> : la rondelle est faite en même temps.</p>
        {:else}
          <h1>Ta jaquette commence ici</h1>
          <p>Cherche ton jeu à gauche et clique sur <strong>Créer la jaquette automatiquement</strong>, ou glisse tes propres images sur la face et le dos.</p>
        {/if}
      </div>
    {/if}
  </main>

  <Inspector />
</div>

<input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={onPickImages} />
<input bind:this={projectInput} type="file" accept=".json,application/json" hidden onchange={openProject} />

{#if busy}
  <div class="busy">{busy}</div>
{/if}
{#if toast}
  <div class="toast" class:error={toast.kind === 'error'}>{toast.text}</div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: 300px 1fr 280px;
    grid-template-rows: 52px 1fr;
    height: 100vh;
  }
  .topbar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .brand svg {
    width: 22px;
    height: 22px;
  }
  .title {
    width: min(320px, 30vw);
    font-size: 14px;
  }
  .spacer {
    flex: 1;
  }
  .group {
    display: flex;
    gap: 4px;
  }
  .export {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 10;
    width: 290px;
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 12px 40px #0008;
  }
  .menu button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: transparent;
    border: 0;
    text-align: left;
    padding: 8px 10px;
  }
  .menu button:hover {
    background: var(--surface-3);
  }
  .menu-title {
    margin: 6px 10px 2px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .menu button:disabled {
    opacity: 0.4;
  }
  .surfaces {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
  }
  .surfaces button {
    padding: 5px 14px;
    background: var(--surface);
  }
  .menu small {
    color: var(--muted);
    font-size: 11px;
  }
  .sidebar {
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    margin-bottom: 12px;
    background: var(--bg);
    border-radius: 9px;
  }
  .tabs button {
    flex: 1;
    white-space: nowrap;
    font-size: 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    padding: 6px;
  }
  .tabs button.on {
    background: var(--surface-3);
    color: var(--text);
  }
  .tabpanel[hidden] {
    display: none;
  }
  .tabpanel {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .sidebar section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .sidebar section:first-child {
    padding-top: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  label.inline {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  label.check {
    color: var(--text);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .grow {
    flex: 1;
  }
  .mm {
    width: 58px;
  }
  .u {
    font-size: 11px;
    color: var(--muted);
  }
  .dims,
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .layers {
    flex: 1;
    border-bottom: 0 !important;
  }
  .layers ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .layers li {
    display: flex;
    border-radius: 6px;
  }
  .layers li.selected {
    background: var(--accent-soft);
  }
  .pick {
    flex: 1;
    display: flex;
    gap: 8px;
    align-items: center;
    background: transparent;
    border: 0;
    text-align: left;
    min-width: 0;
  }
  .ic {
    width: 16px;
    color: var(--muted);
    text-align: center;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eye {
    background: transparent;
    border: 0;
    color: var(--muted);
  }
  .stage {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
  .welcome {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    max-width: 520px;
    text-align: center;
    pointer-events: none;
    color: var(--muted);
  }
  .welcome h1 {
    font-size: 16px;
    color: var(--text);
    margin: 0 0 4px;
  }
  .welcome p {
    margin: 0;
    font-size: 13px;
  }
  .busy,
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 20;
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--surface-3);
    border: 1px solid var(--line);
    box-shadow: 0 10px 30px #0008;
    font-size: 13px;
  }
  .toast.error {
    border-color: #ff8a80;
    color: #ffd2cc;
  }
</style>
