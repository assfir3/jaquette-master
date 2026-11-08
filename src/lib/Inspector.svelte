<script lang="ts">
  import { editor } from './editor.svelte';
  import FillEditor from './FillEditor.svelte';
  import {
    FONTS,
    PANEL_LABELS,
    SHAPES,
    containRect,
    coverRect,
    effectiveDpi,
    geometry,
    type ClipTarget,
    type Layer,
    type TextLayer,
  } from './model';

  const l = $derived(editor.selected);
  const geo = $derived(editor.geo);
  const asset = $derived(l?.type === 'image' ? editor.assets.get(l.assetId) : undefined);
  const dpi = $derived(l && asset ? effectiveDpi(asset, l) : 0);

  function set<K extends keyof Layer>(key: K, value: Layer[K], merge = true) {
    if (!l) return;
    editor.updateLayer(l.id, { [key]: value } as Partial<Layer>, merge ? `${l.id}:${String(key)}` : undefined);
  }
  function setText<K extends keyof TextLayer>(key: K, value: TextLayer[K], merge = true) {
    if (!l) return;
    editor.updateLayer(l.id, { [key]: value } as Partial<Layer>, merge ? `${l.id}:${String(key)}` : undefined);
  }
  function num(e: Event): number {
    return Number((e.currentTarget as HTMLInputElement).value);
  }
  function str(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;

  function fit(target: ClipTarget, mode: 'cover' | 'contain') {
    if (!l || !asset) return;
    const rect = mode === 'cover' ? coverRect(geo, target, asset.width, asset.height) : containRect(geo, target, asset.width, asset.height);
    editor.updateLayer(l.id, { ...rect, rotation: 0, clip: target });
  }

  function setWidthKeepRatio(w: number) {
    if (!l) return;
    if (l.type === 'image' && l.width > 0) editor.updateLayer(l.id, { width: w, height: (w * l.height) / l.width }, `${l.id}:size`);
    else set('width', w);
  }
  function setHeightKeepRatio(h: number) {
    if (!l) return;
    if (l.type === 'image' && l.height > 0) editor.updateLayer(l.id, { height: h, width: (h * l.width) / l.height }, `${l.id}:size`);
    else set('height', h);
  }

  /** Tourne de 180° autour du centre : change le sens de lecture d'un titre de tranche. */
  function flip() {
    if (!l) return;
    const h = l.height > 0 ? l.height : 10;
    const a = (l.rotation * Math.PI) / 180;
    const cx = l.x + (l.width / 2) * Math.cos(a) - (h / 2) * Math.sin(a);
    const cy = l.y + (l.width / 2) * Math.sin(a) + (h / 2) * Math.cos(a);
    const nr = (l.rotation + 180) % 360;
    const b = (nr * Math.PI) / 180;
    const x = cx - (l.width / 2) * Math.cos(b) + (h / 2) * Math.sin(b);
    const y = cy - (l.width / 2) * Math.sin(b) - (h / 2) * Math.cos(b);
    editor.updateLayer(l.id, { x, y, rotation: nr });
  }
</script>

<aside class="panel inspector">
  {#if !l}
    <h2>Propriétés</h2>
    <p class="empty">Sélectionne un élément sur la jaquette pour le modifier.</p>
    <div class="tips">
      <p><kbd>Suppr</kbd> supprimer · <kbd>⌘D</kbd> dupliquer</p>
      <p><kbd>⌘Z</kbd> annuler · <kbd>⇧⌘Z</kbd> rétablir</p>
      <p><kbd>←↑→↓</kbd> déplacer de 0,5 mm (<kbd>⇧</kbd> 5 mm)</p>
      <p><kbd>⌥</kbd> pendant le glisser : sans aimantation</p>
      <p><kbd>⌘V</kbd> coller une image copiée depuis le web</p>
    </div>
  {:else}
    <header>
      <input class="name" value={l.name} oninput={(e) => set('name', str(e))} aria-label="Nom de l'élément" />
    </header>

    {#if l.type === 'image' && asset}
      <section>
        <h3>Placer l'image</h3>
        {#if geo.disc || geo.cart}
          <div class="grid2">
            <button onclick={() => fit('all', 'cover')}>{geo.cart ? "Remplir l'étiquette" : 'Remplir le disque'}</button>
            <button onclick={() => fit('all', 'contain')}>Ajuster</button>
          </div>
        {:else}
          <div class="grid3">
            <button onclick={() => fit('front', 'cover')}>Remplir face</button>
            <button onclick={() => fit('back', 'cover')}>Remplir dos</button>
            <button onclick={() => fit('spine', 'cover')}>Remplir tranche</button>
            <button class="wide" onclick={() => fit('all', 'cover')}>Toute la jaquette</button>
            <button onclick={() => fit(l.clip, 'contain')}>Ajuster</button>
          </div>
        {/if}
        <div class="row tint">
          <span>Couleur</span>
          <div class="seg">
            <button class:on={!l.tint} onclick={() => editor.updateLayer(l.id, { tint: undefined })}>D'origine</button>
            <button class:on={l.tint === '#ffffff'} onclick={() => editor.updateLayer(l.id, { tint: '#ffffff' })}>Blanc</button>
            <button class:on={l.tint === '#000000'} onclick={() => editor.updateLayer(l.id, { tint: '#000000' })}>Noir</button>
          </div>
          <input type="color" value={l.tint ?? '#ffffff'} oninput={(e) => editor.updateLayer(l.id, { tint: str(e) }, `${l.id}:tint`)} title="Teinte personnalisée" />
        </div>
        <label>Coins arrondis
          <input type="range" min="0" max="10" step="0.5" value={l.cornerRadius ?? 0} oninput={(e) => editor.updateLayer(l.id, { cornerRadius: num(e) }, `${l.id}:radius`)} />
        </label>
        <div class="row">
          <label class="check"><input type="checkbox" checked={!!l.borderWidth} onchange={() => editor.updateLayer(l.id, { borderWidth: l.borderWidth ? 0 : 0.4, borderColor: l.borderColor ?? '#ffffff' })} />Cadre</label>
          {#if l.borderWidth}
            <input type="color" value={l.borderColor ?? '#ffffff'} oninput={(e) => editor.updateLayer(l.id, { borderColor: str(e) }, `${l.id}:border`)} title="Couleur du cadre" />
          {/if}
          <label class="check"><input type="checkbox" checked={!!l.shadow} onchange={() => editor.updateLayer(l.id, { shadow: !l.shadow })} />Ombre</label>
        </div>
        <p class="dpi" class:bad={dpi < 150} class:ok={dpi >= 250}>
          {asset.width} × {asset.height} px · <strong>{dpi} dpi</strong> à l'impression
          {#if dpi < 150}<br />Image trop petite : le rendu sera flou.{:else if dpi < 250}<br />Correct, un peu doux à l'impression.{/if}
        </p>
      </section>
    {/if}

    {#if l.type === 'text'}
      <section>
        <h3>Texte</h3>
        <textarea rows="3" value={l.text} oninput={(e) => setText('text', str(e))}></textarea>
        <div class="row">
          <select value={l.fontFamily} onchange={(e) => setText('fontFamily', str(e), false)} style:font-family={l.fontFamily}>
            {#each FONTS as f}<option value={f} style:font-family={f}>{f}</option>{/each}
          </select>
          <label class="unit"><input type="number" min="4" max="300" step="0.5" value={r1(l.fontSize)} oninput={(e) => setText('fontSize', num(e))} />pt</label>
        </div>
        <div class="row">
          <div class="seg">
            <button class:on={l.bold} onclick={() => setText('bold', !l.bold, false)} title="Gras"><b>G</b></button>
            <button class:on={l.italic} onclick={() => setText('italic', !l.italic, false)} title="Italique"><i>I</i></button>
          </div>
          <div class="seg">
            {#each [['left', 'Gauche', '⟸'], ['center', 'Centré', '⟺'], ['right', 'Droite', '⟹']] as [v, t, icon]}
              <button class:on={l.align === v} title={t} onclick={() => setText('align', v as TextLayer['align'], false)}>{icon}</button>
            {/each}
          </div>
        </div>
        <label>Espacement des lettres
          <input type="range" min="-1" max="6" step="0.1" value={l.letterSpacing} oninput={(e) => setText('letterSpacing', num(e))} />
        </label>
        <label>Interligne
          <input type="range" min="0.7" max="2" step="0.05" value={l.lineHeight} oninput={(e) => setText('lineHeight', num(e))} />
        </label>
        <div class="row">
          <label class="check"><input type="checkbox" checked={l.shadow} onchange={() => setText('shadow', !l.shadow, false)} />Ombre</label>
          <label class="check"><input type="checkbox" checked={l.strokeWidth > 0} onchange={() => setText('strokeWidth', l.strokeWidth > 0 ? 0 : 0.3, false)} />Contour</label>
          {#if l.strokeWidth > 0}
            <input type="color" value={l.strokeColor} oninput={(e) => setText('strokeColor', str(e))} title="Couleur du contour" />
            <input type="range" min="0.05" max="1.5" step="0.05" value={l.strokeWidth} oninput={(e) => setText('strokeWidth', num(e))} title="Épaisseur du contour" />
          {/if}
        </div>
        {#if l.rotation % 180 !== 0}
          <button onclick={flip}>Inverser le sens de lecture</button>
        {/if}
      </section>
      <section>
        <h3>Couleur du texte</h3>
        <FillEditor fill={l.fill} gradient={l.gradient} onchange={(p, m) => editor.updateLayer(l.id, p, m && `${l.id}:${m}`)} />
      </section>
    {/if}

    {#if l.type === 'rect'}
      <section>
        <h3>Forme</h3>
        <div class="shapes">
          {#each SHAPES as sh}
            <button class:on={(l.shape ?? 'rect') === sh.kind} title={sh.label} aria-label={sh.label}
              onclick={() => editor.updateLayer(l.id, { shape: sh.kind, sides: l.sides ?? (sh.kind === 'star' ? 5 : 6) })}>{sh.icon}</button>
          {/each}
        </div>
        {#if !l.shape || l.shape === 'rect'}
          <label>Arrondi des coins
            <input type="range" min="0" max="20" step="0.5" value={l.cornerRadius} oninput={(e) => editor.updateLayer(l.id, { cornerRadius: num(e) }, `${l.id}:radius`)} />
          </label>
        {/if}
        {#if l.shape === 'polygon' || l.shape === 'star'}
          <label>{l.shape === 'star' ? 'Branches' : 'Côtés'} <strong>{l.sides ?? (l.shape === 'star' ? 5 : 6)}</strong>
            <input type="range" min="3" max="16" step="1" value={l.sides ?? (l.shape === 'star' ? 5 : 6)} oninput={(e) => editor.updateLayer(l.id, { sides: num(e) }, `${l.id}:sides`)} />
          </label>
        {/if}
        {#if l.shape === 'star'}
          <label>Creux des branches
            <input type="range" min="0.15" max="0.9" step="0.01" value={l.innerRatio ?? 0.45} oninput={(e) => editor.updateLayer(l.id, { innerRatio: num(e) }, `${l.id}:inner`)} />
          </label>
        {/if}
        {#if l.width !== l.height}
          <button onclick={() => editor.updateLayer(l.id, { height: l.width })}>Proportions égales (carré, cercle)</button>
        {/if}
      </section>
      <section>
        <h3>Couleur</h3>
        <FillEditor fill={l.fill} gradient={l.gradient} onchange={(p, m) => editor.updateLayer(l.id, p, m && `${l.id}:${m}`)} />
        <div class="row">
          <label class="check"><input type="checkbox" checked={!!l.strokeWidth} onchange={() => editor.updateLayer(l.id, { strokeWidth: l.strokeWidth ? 0 : 0.6, strokeColor: l.strokeColor ?? '#ffffff' })} />Contour</label>
          {#if l.strokeWidth}
            <input type="color" value={l.strokeColor ?? '#ffffff'} oninput={(e) => editor.updateLayer(l.id, { strokeColor: str(e) }, `${l.id}:stroke`)} title="Couleur du contour" />
            <input type="range" min="0.1" max="4" step="0.1" value={l.strokeWidth} oninput={(e) => editor.updateLayer(l.id, { strokeWidth: num(e) }, `${l.id}:strokeW`)} title="Épaisseur du contour" />
          {/if}
        </div>
      </section>
    {/if}

    <section>
      <h3>Position (mm)</h3>
      <div class="grid2">
        <label class="unit">X<input type="number" step="0.5" value={r1(l.x)} oninput={(e) => set('x', num(e))} /></label>
        <label class="unit">Y<input type="number" step="0.5" value={r1(l.y)} oninput={(e) => set('y', num(e))} /></label>
        <label class="unit">L<input type="number" step="0.5" min="1" value={r1(l.width)} oninput={(e) => setWidthKeepRatio(num(e))} /></label>
        {#if l.type !== 'text' || l.height > 0}
          <label class="unit">H<input type="number" step="0.5" min="1" value={r1(l.height)} oninput={(e) => setHeightKeepRatio(num(e))} /></label>
        {/if}
        <label class="unit">Rotation<input type="number" step="1" value={r1(l.rotation)} oninput={(e) => set('rotation', num(e))} />°</label>
        <label class="unit">Opacité<input type="number" min="0" max="100" step="5" value={Math.round(l.opacity * 100)} oninput={(e) => set('opacity', num(e) / 100)} />%</label>
      </div>
      <label>Visible seulement sur
        <select value={l.clip} onchange={(e) => set('clip', str(e) as ClipTarget, false)}>
          {#each Object.entries(PANEL_LABELS) as [v, t]}<option value={v}>{t}</option>{/each}
        </select>
      </label>
    </section>

    <section class="actions">
      <div class="seg">
        <button onclick={() => editor.moveLayer(l.id, 'front')} title="Tout devant">⤒</button>
        <button onclick={() => editor.moveLayer(l.id, 1)} title="Avancer">↑</button>
        <button onclick={() => editor.moveLayer(l.id, -1)} title="Reculer">↓</button>
        <button onclick={() => editor.moveLayer(l.id, 'back')} title="Tout derrière">⤓</button>
      </div>
      <button onclick={() => editor.duplicateLayer(l.id)}>Dupliquer</button>
      <button onclick={() => set('locked', !l.locked, false)}>{l.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
      <button class="danger" onclick={() => editor.removeLayer(l.id)}>Supprimer</button>
    </section>
  {/if}
</aside>

<style>
  .inspector {
    border-left: 1px solid var(--line);
  }
  header {
    margin-bottom: 12px;
  }
  .name {
    width: 100%;
    font-weight: 600;
    font-size: 14px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    border-top: 1px solid var(--line);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .grid3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .grid3 .wide {
    grid-column: span 2;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .row select {
    flex: 1;
  }
  .unit {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .unit input {
    width: 100%;
    min-width: 0;
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
    color: var(--text);
  }
  .tint span {
    font-size: 12px;
    color: var(--muted);
  }
  .tint .seg button {
    padding: 4px 7px;
    font-size: 12px;
  }
  .dpi {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
    padding: 8px;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .dpi.ok strong {
    color: #5fd38d;
  }
  .dpi.bad {
    color: #ff8a80;
  }
  .actions {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
  }
  .tips {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }
  .tips p {
    margin: 0 0 6px;
  }
  textarea {
    resize: vertical;
    font: inherit;
  }
  .shapes {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .shapes button {
    padding: 5px 0;
    font-size: 15px;
  }
  .shapes button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
</style>
