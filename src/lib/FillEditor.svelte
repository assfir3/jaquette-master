<script lang="ts">
  // Couleur d'un élément : unie, dégradé linéaire (avec angle) ou radial, 2 ou 3 couleurs avec transparence.
  import { formatColor, parseColor, type Gradient } from './model';

  interface Props {
    fill: string;
    gradient?: Gradient;
    /** `merge` regroupe les retouches successives (glisser un curseur) en une seule étape d'annulation. */
    onchange: (patch: { fill?: string; gradient?: Gradient | undefined }, merge?: string) => void;
  }
  let { fill, gradient, onchange }: Props = $props();

  type Mode = 'solid' | 'linear' | 'radial';
  const mode: Mode = $derived(!gradient ? 'solid' : gradient.kind === 'radial' ? 'radial' : 'linear');

  const PRESETS: { name: string; g: Gradient }[] = [
    { name: 'Coucher de soleil', g: { from: '#ffb347', via: '#ff5a3c', to: '#7b1fa2', angle: 180 } },
    { name: 'Océan', g: { from: '#00c6ff', to: '#0b1f6b', angle: 160 } },
    { name: 'Néon', g: { from: '#ff00cc', to: '#3333ff', angle: 90 } },
    { name: 'Toxique', g: { from: '#d4fc79', to: '#1e7a3a', angle: 135 } },
    { name: 'Or', g: { from: '#fff3b0', via: '#d4a017', to: '#7a5200', angle: 180 } },
    { name: 'Chrome', g: { from: '#ffffff', via: '#8c95a6', to: '#e8ebf0', angle: 180 } },
    { name: 'Braise', g: { from: '#ffe08a', via: '#ff5a1f', to: '#2a0500', kind: 'radial' } },
    { name: 'Fondu noir', g: { from: '#00000000', to: '#000000', angle: 180 } },
  ];

  function css(g: Gradient): string {
    const stops = [g.from, g.via, g.to].filter(Boolean).join(', ');
    return g.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${g.angle ?? 180}deg, ${stops})`;
  }

  function setMode(m: Mode) {
    if (m === 'solid') return onchange({ fill: gradient?.from && parseColor(gradient.from).alpha === 1 ? gradient.from : fill, gradient: undefined });
    const base = gradient ?? { from: fill, to: darker(fill), angle: 180 };
    onchange({ gradient: { ...base, kind: m === 'radial' ? 'radial' : undefined } });
  }
  function patch(p: Partial<Gradient>, key: string) {
    if (gradient) onchange({ gradient: { ...gradient, ...p } }, key);
  }
  function darker(c: string): string {
    const { hex } = parseColor(c);
    const n = parseInt(hex.slice(1), 16);
    const ch = (s: number) => Math.round(((n >> s) & 255) * 0.35).toString(16).padStart(2, '0');
    return `#${ch(16)}${ch(8)}${ch(0)}`;
  }
  function swap() {
    if (gradient) onchange({ gradient: { ...gradient, from: gradient.to, to: gradient.from } });
  }
  const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);

  const stops = $derived(
    gradient
      ? ([['from', 'Départ'], ...(gradient.via ? [['via', 'Milieu']] : []), ['to', 'Arrivée']] as ['from' | 'via' | 'to', string][])
      : [],
  );
</script>

<div class="fill">
  <div class="seg modes">
    <button class:on={mode === 'solid'} onclick={() => setMode('solid')}>Unie</button>
    <button class:on={mode === 'linear'} onclick={() => setMode('linear')}>Dégradé</button>
    <button class:on={mode === 'radial'} onclick={() => setMode('radial')}>Radial</button>
  </div>

  {#if !gradient}
    <div class="stop">
      <input type="color" value={parseColor(fill).hex} oninput={(e) => onchange({ fill: formatColor(val(e), parseColor(fill).alpha) }, 'fill')} aria-label="Couleur" />
      <code>{parseColor(fill).hex}</code>
    </div>
  {:else}
    <div class="preview" style:background={css(gradient)}></div>
    {#each stops as [key, label] (key)}
      {@const c = parseColor(gradient[key] ?? '#000000')}
      <div class="stop">
        <input type="color" value={c.hex} oninput={(e) => patch({ [key]: formatColor(val(e), c.alpha) }, `g:${key}`)} aria-label={`Couleur ${label}`} />
        <span class="lbl">{label}</span>
        <input class="alpha" type="range" min="0" max="1" step="0.05" value={c.alpha} oninput={(e) => patch({ [key]: formatColor(c.hex, num(e)) }, `g:${key}:a`)} title="Opacité de cette couleur" aria-label={`Opacité ${label}`} />
        <span class="pct">{Math.round(c.alpha * 100)} %</span>
        {#if key === 'via'}
          <button class="x" onclick={() => onchange({ gradient: { ...gradient, via: undefined } })} title="Retirer la couleur du milieu">×</button>
        {/if}
      </div>
    {/each}
    <div class="row">
      {#if !gradient.via}
        <button onclick={() => patch({ via: formatColor(parseColor(gradient.from).hex, 1) }, 'g:via:add')}>＋ Couleur du milieu</button>
      {/if}
      <button onclick={swap} title="Inverser les couleurs">⇅ Inverser</button>
    </div>
    {#if mode === 'linear'}
      <label class="angle">
        <span>Direction <strong>{Math.round(gradient.angle ?? 180)}°</strong></span>
        <input type="range" min="0" max="359" step="1" value={gradient.angle ?? 180} oninput={(e) => patch({ angle: num(e) }, 'g:angle')} />
      </label>
      <div class="seg dirs">
        {#each [[0, '↑'], [45, '↗'], [90, '→'], [135, '↘'], [180, '↓'], [225, '↙'], [270, '←'], [315, '↖']] as [a, icon]}
          <button class:on={(gradient.angle ?? 180) === a} onclick={() => patch({ angle: a as number }, 'g:angle')} title={`${a}°`}>{icon}</button>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="presets" aria-label="Dégradés prêts à l'emploi">
    {#each PRESETS as p}
      <button title={p.name} aria-label={p.name} style:background={css(p.g)} onclick={() => onchange({ gradient: { ...p.g } })}></button>
    {/each}
  </div>
</div>

<style>
  .fill {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }
  .preview {
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--line);
    /* Damier visible sous les couleurs transparentes. */
    background-color: #888;
  }
  .stop {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lbl {
    font-size: 12px;
    color: var(--muted);
    width: 46px;
  }
  .alpha {
    flex: 1;
    min-width: 0;
  }
  .pct {
    font-size: 11px;
    color: var(--muted);
    width: 38px;
    flex: none;
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .x {
    padding: 2px 7px;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .row button {
    font-size: 12px;
  }
  .angle {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .dirs {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
  }
  .dirs button {
    padding: 3px 0;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .presets button {
    aspect-ratio: 1;
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--line-strong);
  }
  .presets button:hover {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  code {
    font-size: 12px;
    color: var(--muted);
  }
</style>
