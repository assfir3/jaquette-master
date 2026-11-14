<script lang="ts">
  // Saisie des clés d'API facultatives, directement dans l'interface.
  import { checkKey } from './search';
  import { keys, setKey, type KeyService } from './keys.svelte';

  interface Props {
    /** Ouvert d'emblée (aucune clé SteamGridDB encore). */
    open?: boolean;
    /** Clés présentes dans le fichier de configuration (serveur). */
    fromFile: Record<KeyService, boolean>;
    configFile: string;
    onchange: () => void;
  }
  let { open = false, fromFile, configFile, onchange }: Props = $props();

  const SERVICES: { id: KeyService; name: string; url: string; hint: string }[] = [
    {
      id: 'steamgriddb',
      name: 'SteamGridDB',
      url: 'https://www.steamgriddb.com/profile/preferences/api',
      hint: 'Gratuite : plus de jaquettes, de logos et les jeux hors Steam.',
    },
    {
      id: 'mobygames',
      name: 'MobyGames',
      url: 'https://www.mobygames.com/info/api/',
      hint: 'Jaquettes officielles scannées (face, dos, disque).',
    },
  ];

  let drafts = $state<Record<KeyService, string>>({ steamgriddb: keys.steamgriddb ?? '', mobygames: keys.mobygames ?? '' });
  let check = $state<Record<KeyService, { busy?: boolean; ok?: boolean; error?: string }>>({ steamgriddb: {}, mobygames: {} });
  let reveal = $state<Record<KeyService, boolean>>({ steamgriddb: false, mobygames: false });

  async function save(id: KeyService) {
    setKey(id, drafts[id]);
    check[id] = { busy: true };
    if (!keys[id]) {
      check[id] = {};
      onchange();
      return;
    }
    try {
      const r = await checkKey(id);
      check[id] = { ok: r.ok, error: r.error };
    } catch (err) {
      check[id] = { ok: false, error: err instanceof Error ? err.message : 'Vérification impossible' };
    }
    onchange();
  }
  function remove(id: KeyService) {
    drafts[id] = '';
    setKey(id, '');
    check[id] = {};
    onchange();
  }
</script>

<details class="keys" {open}>
  <summary>
    <span>Clés d'API</span>
    <span class="badges">
      {#each SERVICES as s}
        <span class="badge" class:on={!!keys[s.id] || fromFile[s.id]} title={keys[s.id] ? 'Clé saisie ici' : fromFile[s.id] ? `Clé dans ${configFile}` : 'Pas de clé'}>{s.name}</span>
      {/each}
    </span>
  </summary>

  {#each SERVICES as s}
    <form class="svc" onsubmit={(e) => { e.preventDefault(); save(s.id); }}>
      <div class="head">
        <strong>{s.name}</strong>
        <a href={s.url} target="_blank" rel="noreferrer">Obtenir une clé ↗</a>
      </div>
      <p class="hint">{s.hint}</p>
      <div class="row">
        <input
          type={reveal[s.id] ? 'text' : 'password'}
          bind:value={drafts[s.id]}
          placeholder={fromFile[s.id] && !keys[s.id] ? `Déjà dans ${configFile}` : 'Colle ta clé ici'}
          autocomplete="off"
          spellcheck="false"
          aria-label={`Clé ${s.name}`}
        />
        <button type="button" class="eye" onclick={() => (reveal[s.id] = !reveal[s.id])} title={reveal[s.id] ? 'Masquer' : 'Afficher'} aria-label={reveal[s.id] ? 'Masquer la clé' : 'Afficher la clé'}>{reveal[s.id] ? '◉' : '○'}</button>
        <button type="submit" class="primary" disabled={check[s.id].busy || drafts[s.id].trim() === (keys[s.id] ?? '')}>
          {check[s.id].busy ? '…' : 'Enregistrer'}
        </button>
      </div>
      {#if check[s.id].ok}
        <p class="ok">✓ Clé valide, enregistrée dans cette appli.</p>
      {:else if check[s.id].error}
        <p class="err">✗ {check[s.id].error}</p>
      {/if}
      {#if keys[s.id]}
        <button type="button" class="link" onclick={() => remove(s.id)}>Retirer la clé</button>
      {/if}
    </form>
  {/each}
  <p class="foot">Les clés restent sur cet appareil. Tu peux aussi les mettre dans <code>{configFile}</code>.</p>
</details>

<style>
  .keys {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 12px;
  }
  summary {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    font-weight: 600;
    color: var(--text);
  }
  .badges {
    display: flex;
    gap: 4px;
  }
  .badge {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    color: var(--muted);
  }
  .badge.on {
    border-color: color-mix(in srgb, var(--ok) 50%, transparent);
    color: var(--ok);
  }
  .svc {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 10px;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .head a {
    color: var(--accent-text);
    font-size: 11px;
  }
  .row {
    display: flex;
    gap: 4px;
  }
  .row input {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    font-size: 11px;
  }
  .eye {
    padding: 2px 8px;
  }
  .hint,
  .foot {
    margin: 0;
    color: var(--muted);
  }
  .foot {
    padding: 8px 10px;
    border-top: 1px solid var(--line);
  }
  .foot code {
    word-break: break-all;
  }
  .ok,
  .err {
    margin: 0;
  }
  .ok {
    color: var(--ok);
  }
  .err {
    color: var(--danger);
  }
  .link {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--muted);
    text-decoration: underline;
    font-size: 11px;
  }
</style>
