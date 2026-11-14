<script lang="ts">
  import { untrack } from 'svelte';
  import { editor } from './editor.svelte';
  import { CART, DISC, mediaName, usesCartridge, type Doc } from './model';
  import {
    CD_PRINTERS,
    DISC_SHEETS,
    PAPERS,
    artsOf,
    casePlan,
    discPlan,
    drawPlan,
    exportDirectPdf,
    exportDirectPng,
    exportSheet,
    loadPrintSettings,
    renderArts,
    savePrintSettings,
    sheetOf,
    type ArtId,
    type SheetPlan,
  } from './print';

  let { notify }: { notify: (text: string, kind?: 'info' | 'error') => void } = $props();

  let settings = $state(loadPrintSettings());
  let kind = $state<'case' | 'disc'>('case');
  let showTest = $state(false);
  let busy = $state<string | null>(null);
  let warnings = $state<string[]>([]);
  let canvas: HTMLCanvasElement;
  let box: HTMLDivElement;
  let boxSize = $state({ w: 0, h: 0 });

  $effect(() => {
    const snap = $state.snapshot(settings);
    savePrintSettings(snap);
  });

  $effect(() => {
    const ro = new ResizeObserver(() => (boxSize = { w: box.clientWidth, h: box.clientHeight }));
    ro.observe(box);
    return () => ro.disconnect();
  });

  /** Jeu sur cartouche (Switch) : étiquettes sur papier autocollant, pas d'impression sur disque. */
  const cart = $derived(usesCartridge(editor.doc));
  const direct = $derived(kind === 'disc' && !cart && settings.disc.mode === 'direct');
  const printer = $derived(CD_PRINTERS.find((p) => p.id === settings.disc.printer) ?? CD_PRINTERS[0]);
  const sheet = $derived(sheetOf(settings.disc));
  const innerTooSmall = $derived(!!printer.minInner && editor.doc.disc.inner < printer.minInner);

  /** Impression directe : le disque seul, au format exact 120 × 120 mm. */
  function directPlan(doc: Doc): SheetPlan {
    const c = DISC.size / 2;
    return {
      page: { w: DISC.size, h: DISC.size },
      images: [{ art: 'disc', x: 0, y: 0, w: DISC.size, h: DISC.size }],
      circles: [
        { cx: c, cy: c, r: doc.disc.outer / 2, dashed: true },
        { cx: c, cy: c, r: doc.disc.inner / 2, dashed: true },
      ],
      lines: [],
      texts: [],
      warnings: [],
    };
  }

  // Images de l'aperçu, gardées tant que la jaquette ne change pas.
  const artCache = new Map<string, HTMLCanvasElement>();
  let cacheDoc = '';

  $effect(() => {
    const doc = $state.snapshot(editor.doc) as Doc;
    const s = $state.snapshot(settings);
    const test = showTest;
    const isDirect = direct;
    const k0 = kind;
    void editor.renderVersion;
    const { w, h } = boxSize;
    if (!w || !h) return;
    const t = setTimeout(async () => {
      const plan = isDirect ? directPlan(doc) : k0 === 'case' ? casePlan(doc, s.case, test) : discPlan(doc, s.disc, test);
      warnings = plan.warnings;
      const docKey = JSON.stringify(doc);
      if (docKey !== cacheDoc) {
        artCache.clear();
        cacheDoc = docKey;
      }
      const sh = sheetOf(s.disc);
      const need = [...artsOf(plan)].filter((a) => !artCache.has(`${a}:${sh.diameter}:${sh.hole}`));
      if (need.length) {
        const made = await renderArts(doc, editor.assets, new Set(need), 72, sh);
        for (const [a, c] of made) artCache.set(`${a}:${sh.diameter}:${sh.hole}`, c);
      }
      const arts = new Map<ArtId, HTMLCanvasElement>();
      for (const a of artsOf(plan)) {
        const c = artCache.get(`${a}:${sh.diameter}:${sh.hole}`);
        if (c) arts.set(a, c);
      }
      // La feuille tient dans la zone d'aperçu.
      const pad = 32;
      const k = Math.min((w - pad * 2) / plan.page.w, (h - pad * 2) / plan.page.h);
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(plan.page.w * k * ratio);
      canvas.height = Math.round(plan.page.h * k * ratio);
      canvas.style.width = `${Math.round(plan.page.w * k)}px`;
      canvas.style.height = `${Math.round(plan.page.h * k)}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawPlan(ctx, plan, arts, doc, k, !isDirect);
    }, 150);
    return () => clearTimeout(t);
  });

  async function run(label: string, fn: () => Promise<void>) {
    busy = label;
    try {
      await fn();
    } catch (err) {
      console.error(err);
      notify("L'export a échoué.", 'error');
    } finally {
      busy = null;
    }
  }

  const doc = () => $state.snapshot(editor.doc) as Doc;
  const exportPdf = (test: boolean) =>
    run(test ? 'Préparation de la planche de test…' : 'Préparation du PDF à 300 dpi…', () =>
      exportSheet(doc(), editor.assets, kind, $state.snapshot(settings), test),
    );

  const num = (e: Event) => parseFloat((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
  function setNum(apply: (v: number) => void, min: number, max: number) {
    return (e: Event) => {
      const v = num(e);
      if (Number.isFinite(v)) apply(Math.min(max, Math.max(min, v)));
    };
  }

  const calib = $derived(kind === 'case' ? settings.case.calib : settings.disc.calib);
  function resetCalib() {
    const c = untrack(() => calib);
    c.dx = 0;
    c.dy = 0;
    c.scale = 100;
  }
</script>

<div class="print-view">
  <aside class="settings">
    <header>
      <h1>Impression</h1>
      <div class="seg tabs" role="tablist">
        <button role="tab" aria-selected={kind === 'case'} class:on={kind === 'case'} onclick={() => (kind = 'case')}>Jaquette</button>
        <button role="tab" aria-selected={kind === 'disc'} class:on={kind === 'disc'} onclick={() => (kind = 'disc')}>{mediaName(editor.doc).title}</button>
      </div>
    </header>

    {#if kind === 'case'}
      <section>
        <h2>Papier</h2>
        <select bind:value={settings.case.paper} aria-label="Format du papier">
          {#each PAPERS as p}<option value={p.id}>{p.label}</option>{/each}
        </select>
        {#if settings.case.paper === 'custom'}
          <div class="row">
            <label>Largeur<span class="mm"><input type="number" min="50" max="1000" step="0.5" value={settings.case.customW} onchange={setNum((v) => (settings.case.customW = v), 50, 1000)} />mm</span></label>
            <label>Hauteur<span class="mm"><input type="number" min="50" max="1500" step="0.5" value={settings.case.customH} onchange={setNum((v) => (settings.case.customH = v), 50, 1500)} />mm</span></label>
          </div>
        {/if}
        <p class="hint">Papier photo, papier autocollant pleine page ou papier ordinaire : seul le format compte. L’orientation est choisie automatiquement.</p>
      </section>
      <section>
        <h2>Découpe</h2>
        <label class="check"><input type="checkbox" bind:checked={settings.case.bleed} />Fond perdu de 3 mm</label>
        <p class="hint">À garder pour une découpe au massicot ou chez un imprimeur. Sans fond perdu, la jaquette est imprimée à sa taille exacte.</p>
        <label class="check"><input type="checkbox" bind:checked={settings.case.marks} />Traits de coupe et de pliage</label>
      </section>
    {:else if cart}
      <section>
        <h2>Étiquettes de cartouche</h2>
        <p class="hint">Étiquettes de {CART.width} × {CART.height} mm sur une feuille A4 de papier autocollant, avec {CART.bleed} mm de fond perdu et un contour de coupe. Pas de cote officielle : imprime d’abord la planche de test et pose-la sur ta cartouche.</p>
        <label class="check"><input type="checkbox" bind:checked={settings.disc.fill} />Remplir la feuille (24 étiquettes)</label>
      </section>
    {:else}
      <section>
        <h2>Support</h2>
        <div class="seg modes">
          <button class:on={settings.disc.mode === 'sheet'} onclick={() => (settings.disc.mode = 'sheet')}>Planche ou papier</button>
          <button class:on={settings.disc.mode === 'direct'} onclick={() => (settings.disc.mode = 'direct')}>Directement sur le CD</button>
        </div>
      </section>

      {#if settings.disc.mode === 'sheet'}
        <section>
          <h2>Planche</h2>
          <select bind:value={settings.disc.sheet} aria-label="Planche d'étiquettes">
            {#each DISC_SHEETS as s}<option value={s.id}>{s.label}</option>{/each}
          </select>
          <p class="hint">{sheet.hint}</p>
          {#if settings.disc.sheet === 'custom'}
            {@const c = settings.disc.custom}
            <div class="grid2">
              <label>Feuille largeur<span class="mm"><input type="number" step="0.5" value={c.pageW} onchange={setNum((v) => (c.pageW = v), 50, 600)} />mm</span></label>
              <label>Feuille hauteur<span class="mm"><input type="number" step="0.5" value={c.pageH} onchange={setNum((v) => (c.pageH = v), 50, 900)} />mm</span></label>
              <label>Diamètre étiquette<span class="mm"><input type="number" step="0.5" value={c.diameter} onchange={setNum((v) => (c.diameter = v), 60, 125)} />mm</span></label>
              <label>Trou central<span class="mm"><input type="number" step="0.5" value={c.hole} onchange={setNum((v) => (c.hole = v), 10, 60)} />mm</span></label>
              <label>Centre X<span class="mm"><input type="number" step="0.25" value={c.x} onchange={setNum((v) => (c.x = v), 0, 600)} />mm</span></label>
              <label>Centre Y<span class="mm"><input type="number" step="0.25" value={c.y} onchange={setNum((v) => (c.y = v), 0, 900)} />mm</span></label>
              <label>Étiquettes
                <select value={c.count} onchange={(e) => (c.count = Number((e.currentTarget as HTMLSelectElement).value) as 1 | 2)}>
                  <option value={1}>1 par feuille</option>
                  <option value={2}>2 par feuille</option>
                </select>
              </label>
              {#if c.count === 2}
                <label>Écart vertical<span class="mm"><input type="number" step="0.25" value={c.pitch} onchange={setNum((v) => (c.pitch = v), 60, 600)} />mm</span></label>
              {/if}
            </div>
            <p class="hint">Centre mesuré depuis le coin en haut à gauche de la feuille ; l’écart va du centre de la 1re étiquette à celui de la 2e.</p>
          {/if}
          {#if sheet.centers.length > 1}
            <label class="check"><input type="checkbox" bind:checked={settings.disc.fill} />Remplir les {sheet.centers.length} étiquettes</label>
          {/if}
          {#if !sheet.plain}
            <label class="check"><input type="checkbox" bind:checked={settings.disc.outline} />Imprimer le contour des étiquettes</label>
          {/if}
        </section>
      {:else}
        <section>
          <h2>Imprimante</h2>
          <select bind:value={settings.disc.printer} aria-label="Imprimante">
            {#each CD_PRINTERS as p}<option value={p.id}>{p.label}</option>{/each}
          </select>
          <ol class="steps">
            {#each printer.steps as s}<li>{s}</li>{/each}
          </ol>
          <p class="hint">
            Zone imprimable réglée : <b>{editor.doc.disc.outer} mm</b> à l’extérieur, <b>{editor.doc.disc.inner} mm</b> au centre
            (modifiable dans Mise en page, sur la rondelle). Mesure tes disques : la couche imprimable s’arrête souvent avant le bord.
          </p>
          {#if innerTooSmall}
            <p class="warn">Le centre réglé ({editor.doc.disc.inner} mm) est plus petit que le minimum de {printer.software} ({printer.minInner} mm).</p>
          {/if}
        </section>
      {/if}
    {/if}

    {#if !direct}
      <section>
        <h2>Calibrage de l’imprimante</h2>
        <div class="grid3">
          <label>Décalage →<span class="mm"><input type="number" step="0.5" min="-20" max="20" value={calib.dx} onchange={setNum((v) => (calib.dx = v), -20, 20)} />mm</span></label>
          <label>Décalage ↓<span class="mm"><input type="number" step="0.5" min="-20" max="20" value={calib.dy} onchange={setNum((v) => (calib.dy = v), -20, 20)} />mm</span></label>
          <label>Échelle<span class="mm"><input type="number" step="0.1" min="90" max="110" value={calib.scale} onchange={setNum((v) => (calib.scale = v), 90, 110)} />%</span></label>
        </div>
        <p class="hint">
          Imprime la planche de test sur du papier ordinaire et pose-la sur ta planche à contre-jour. Si c’est décalé, saisis l’écart ici ;
          si la règle ne fait pas 100 mm, corrige l’échelle. Ces réglages sont gardés pour la prochaine fois.
          {#if calib.dx || calib.dy || calib.scale !== 100}<button class="link" onclick={resetCalib}>Réinitialiser</button>{/if}
        </p>
        <label class="check"><input type="checkbox" bind:checked={showTest} />Voir la planche de test dans l’aperçu</label>
      </section>
    {/if}

    {#each warnings as w}<p class="warn">{w}</p>{/each}

    <div class="actions">
      {#if direct}
        <button class="primary" disabled={!!busy || !editor.doc.disc.layers.length} onclick={() => run('Préparation de l’image…', () => exportDirectPng(doc(), editor.assets))}>Image PNG 120 mm</button>
        <button disabled={!!busy || !editor.doc.disc.layers.length} onclick={() => run('Préparation du PDF…', () => exportDirectPdf(doc(), editor.assets))}>PDF 120 × 120 mm</button>
      {:else}
        <button class="primary" disabled={!!busy || (kind === 'disc' && !editor.doc.disc.layers.length)} onclick={() => exportPdf(false)}>Exporter le PDF</button>
        <button disabled={!!busy} onclick={() => exportPdf(true)}>Planche de test</button>
      {/if}
    </div>
    {#if kind === 'disc' && !editor.doc.disc.layers.length}
      <p class="hint">{cart ? 'L’étiquette est vide : crée-la d’abord (Recherche › créer la jaquette, ou vue Cartouche).' : 'La rondelle est vide : crée-la d’abord (Recherche › créer la jaquette, ou vue Rondelle).'}</p>
    {/if}
    <p class="hint">Dans la fenêtre d’impression, choisis <b>Taille réelle / 100 %</b> et jamais « Ajuster à la page ».</p>
    {#if busy}<p class="hint">{busy}</p>{/if}
  </aside>

  <div class="preview" bind:this={box}>
    <canvas bind:this={canvas} class:disc={direct} aria-label="Aperçu de la feuille imprimée"></canvas>
    <p class="legend">
      {#if direct}Disque de 120 mm · pointillés : zone imprimable{:else}Pointillés gris clair : zone où beaucoup d’imprimantes n’impriment pas{/if}
    </p>
  </div>
</div>

<style>
  .print-view {
    height: 100%;
    display: flex;
    min-height: 0;
  }
  .settings {
    width: 360px;
    flex: none;
    overflow-y: auto;
    padding: 24px 20px 32px;
    border-right: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 8px;
  }
  h1 {
    margin: 0;
    font: 400 28px/1 var(--display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .tabs button,
  .modes button {
    flex: 1;
    padding: 8px 10px;
  }
  .tabs,
  .modes {
    display: flex;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font-size: 13px;
  }
  .mm {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 11px;
  }
  .mm input {
    width: 100%;
    min-width: 0;
  }
  .row,
  .grid2,
  .grid3 {
    display: grid;
    gap: 8px;
  }
  .row,
  .grid2 {
    grid-template-columns: 1fr 1fr;
  }
  .grid3 {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
  }
  .warn {
    margin: 6px 0 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #ff5a3c1f;
    border: 1px solid #ff5a3c55;
    color: var(--accent-text);
    font-size: 12px;
    line-height: 1.45;
  }
  .steps {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent-text);
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin: 14px 0 6px;
  }
  .actions button {
    flex: 1;
    height: 40px;
    border-radius: 999px;
  }
  .preview {
    flex: 1;
    min-width: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--bg);
    background-image: radial-gradient(#1c2130 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .preview canvas {
    box-shadow: 0 20px 60px #000a;
  }
  .preview canvas.disc {
    box-shadow: none;
    filter: drop-shadow(0 20px 40px #000a);
  }
  .legend {
    position: absolute;
    bottom: 10px;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }
</style>
