// Petit serveur intermédiaire : interroge Steam et SteamGridDB à la place du navigateur
// (qui serait bloqué par CORS) et garde les clés d'API côté serveur.
// Écrit avec les API Web standard (Request/Response/fetch) : il tourne dans Vite en local
// et pourra être déployé tel quel sur un Cloudflare Worker.

export interface Env {
  STEAMGRIDDB_API_KEY?: string;
  MOBYGAMES_API_KEY?: string;
  /** Où l'utilisateur range ses clés (affiché dans l'interface). */
  CONFIG_FILE?: string;
}

export interface Visual {
  url: string;
  thumb: string;
  width?: number;
  height?: number;
  source: 'steam' | 'steamgriddb' | 'wikimedia' | 'mobygames';
  /** Logo officiel (fourni par l'éditeur), par opposition à une création de fan. */
  official?: boolean;
  label?: string;
}

export interface SearchResult {
  source: 'steam' | 'steamgriddb';
  id: string;
  name: string;
  thumb?: string;
  year?: string;
}

export interface GameDetails {
  source: 'steam' | 'steamgriddb';
  id: string;
  name: string;
  summary: string;
  about: string;
  developers: string[];
  publishers: string[];
  releaseDate: string;
  year: string;
  genres: string[];
  pegi?: string;
  storeUrl?: string;
  covers: Visual[];
  heroes: Visual[];
  logos: Visual[];
  /** Logos du studio et de l'éditeur. */
  studios: Visual[];
  screenshots: Visual[];
}

const STEAM_CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const SGDB = 'https://www.steamgriddb.com/api/v2';
const UA = 'JaquetteMaster/0.1 (personal fan-cover tool)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

/** Hôtes dont les images peuvent passer par /api/img (pas de proxy ouvert). */
const IMAGE_HOSTS = [
  /\.steamstatic\.com$/,
  /^steamcdn-a\.akamaihd\.net$/,
  /(^|\.)steamgriddb\.com$/,
  /^(upload|thumb)\.wikimedia\.org$/,
  /^cdn\.mobygames\.com$/,
];

/** Format plausible d'une clé d'API (évite d'envoyer n'importe quoi aux services). */
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Clés saisies dans l'interface : envoyées par le navigateur dans des en-têtes,
 * elles remplacent celles du fichier de configuration pour cette requête seulement.
 */
function withUserKeys(req: Request, env: Env): Env & { userKeys: { steamgriddb: boolean; mobygames: boolean } } {
  const sgdb = req.headers.get('x-steamgriddb-key')?.trim();
  const moby = req.headers.get('x-mobygames-key')?.trim();
  const okSgdb = !!sgdb && KEY_FORMAT.test(sgdb);
  const okMoby = !!moby && KEY_FORMAT.test(moby);
  return {
    ...env,
    STEAMGRIDDB_API_KEY: okSgdb ? sgdb : env.STEAMGRIDDB_API_KEY,
    MOBYGAMES_API_KEY: okMoby ? moby : env.MOBYGAMES_API_KEY,
    userKeys: { steamgriddb: okSgdb, mobygames: okMoby },
  };
}

/** Essaie une clé auprès du service (sans cache) pour dire tout de suite si elle est valide. */
async function checkKey(service: string, env: Env): Promise<{ ok: boolean; error?: string }> {
  const key = service === 'steamgriddb' ? env.STEAMGRIDDB_API_KEY : env.MOBYGAMES_API_KEY;
  if (!key) return { ok: false, error: 'Aucune clé' };
  const res =
    service === 'steamgriddb'
      ? await fetch(`${SGDB}/search/autocomplete/portal`, { headers: { authorization: `Bearer ${key}`, 'user-agent': UA } })
      : await fetch(`${MOBY}/genres?api_key=${encodeURIComponent(key)}`, { headers: { 'user-agent': UA } });
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'Clé refusée par le service' };
  return { ok: false, error: `Le service a répondu ${res.status}` };
}

export async function handleApi(req: Request, baseEnv: Env): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const env = withUserKeys(req, baseEnv);
  try {
    const path = url.pathname.slice(5);
    if (path === 'status')
      return json({
        steam: true,
        steamgriddb: !!env.STEAMGRIDDB_API_KEY,
        mobygames: !!env.MOBYGAMES_API_KEY,
        /** Clés venant de l'interface (sinon du fichier de configuration). */
        userKeys: env.userKeys,
        configFile: env.CONFIG_FILE ?? '.env.local',
      });
    const check = path.match(/^keys\/check\/(steamgriddb|mobygames)$/);
    if (check) return json(await checkKey(check[1], env));
    if (path === 'moby/find') return json(await mobyFind(url.searchParams.get('title') ?? '', env));
    if (path === 'moby/covers')
      return json(await mobyCovers(url.searchParams.get('game') ?? '', url.searchParams.get('platform') ?? '', env));
    if (path === 'search') return json(await search(url.searchParams.get('q') ?? '', env));
    const game = path.match(/^game\/(steam|steamgriddb)\/(\d+)$/);
    if (game) {
      const details = game[1] === 'steam' ? await steamDetails(game[2], env) : await sgdbDetails(game[2], env);
      return json(details);
    }
    if (path === 'img') return await proxyImage(url.searchParams.get('url') ?? '');
    if (path === 'logos/search') return json(await commonsSearch(url.searchParams.get('q') ?? ''));
    if (path === 'logos/files') return json(await commonsFiles((url.searchParams.get('titles') ?? '').split('|')));
    return json({ error: 'Introuvable' }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erreur' }, 502);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Petit cache mémoire : évite de solliciter les services à chaque clic (Wikimedia limite vite).
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 60 * 60 * 1000;

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers } });
  if (res.status === 429) throw new Error(`${new URL(url).host} limite les requêtes : réessaie dans une minute.`);
  if (!res.ok) throw new Error(`${new URL(url).host} a répondu ${res.status}`);
  const data = (await res.json()) as T;
  if (cache.size > 500) cache.clear();
  cache.set(url, { at: Date.now(), data });
  return data;
}

// ---------- Recherche ----------

async function search(q: string, env: Env): Promise<SearchResult[]> {
  q = q.trim();
  if (q.length < 2) return [];
  const [steam, sgdb] = await Promise.all([
    steamSearch(q).catch(() => []),
    env.STEAMGRIDDB_API_KEY ? sgdbSearch(q, env).catch(() => []) : Promise.resolve([]),
  ]);
  // Les jeux Steam d'abord ; SteamGridDB complète avec ce que Steam n'a pas.
  const names = new Set(steam.map((r) => normalize(r.name)));
  return [...steam, ...sgdb.filter((r) => !names.has(normalize(r.name)))];
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function steamSearch(q: string): Promise<SearchResult[]> {
  const data = await getJson<{ items: { type: string; id: number; name: string; tiny_image: string }[] }>(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=french&cc=FR`,
  );
  return (data.items ?? [])
    // Les bandes-son, artbooks et démos ne sont pas des jeux à mettre en boîte.
    .filter((i) => i.type === 'app' && !/soundtrack|\bOST\b|artbook|art book|\bdemo\b|playtest/i.test(i.name))
    .map((i) => ({ source: 'steam', id: String(i.id), name: i.name, thumb: i.tiny_image }));
}

async function sgdbSearch(q: string, env: Env): Promise<SearchResult[]> {
  const data = await getJson<{ data: { id: number; name: string; release_date?: number }[] }>(
    `${SGDB}/search/autocomplete/${encodeURIComponent(q)}`,
    { authorization: `Bearer ${env.STEAMGRIDDB_API_KEY}` },
  );
  return (data.data ?? []).map((g) => ({
    source: 'steamgriddb',
    id: String(g.id),
    name: g.name,
    year: g.release_date ? String(new Date(g.release_date * 1000).getFullYear()) : undefined,
  }));
}

// ---------- Steam ----------

interface SteamItem {
  name: string;
  basic_info?: {
    short_description?: string;
    publishers?: { name: string }[];
    developers?: { name: string }[];
  };
  release?: { steam_release_date?: number; original_release_date?: number };
  assets?: Record<string, string>;
  screenshots?: { all_ages_screenshots?: { filename: string }[]; mature_content_screenshots?: { filename: string }[] };
}

interface SteamAppDetails {
  short_description?: string;
  about_the_game?: string;
  genres?: { description: string }[];
  release_date?: { date: string };
  ratings?: Record<string, { rating?: string }>;
}

async function steamDetails(appid: string, env: Env): Promise<GameDetails> {
  const input = {
    ids: [{ appid: Number(appid) }],
    context: { language: 'french', country_code: 'FR' },
    data_request: { include_assets: true, include_basic_info: true, include_release: true, include_screenshots: true },
  };
  const [items, details, sgdb] = await Promise.all([
    getJson<{ response: { store_items: SteamItem[] } }>(
      `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
    ),
    getJson<Record<string, { success: boolean; data?: SteamAppDetails }>>(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&l=french&cc=FR`,
    ).catch(() => ({}) as Record<string, { success: boolean; data?: SteamAppDetails }>),
    env.STEAMGRIDDB_API_KEY ? sgdbImages(`steam/${appid}`, env).catch(() => null) : Promise.resolve(null),
  ]);
  const item = items.response.store_items?.[0];
  if (!item?.name) throw new Error('Jeu introuvable sur Steam');
  const app = details[appid]?.data ?? {};
  const a = item.assets ?? {};
  const base = (file: string) => STEAM_CDN + (a.asset_url_format ?? `steam/apps/${appid}/\${FILENAME}`).replace('${FILENAME}', file);
  const legacy = (file: string) => `${STEAM_CDN}steam/apps/${appid}/${file}`;

  const steamVisual = (url: string, width?: number, height?: number): Visual => ({
    url,
    thumb: url,
    width,
    height,
    source: 'steam',
  });

  const covers = [
    steamVisual(a.library_capsule_2x ? base(a.library_capsule_2x) : legacy('library_600x900_2x.jpg'), 600, 900),
  ];
  const heroes = [
    steamVisual(a.library_hero_2x ? base(a.library_hero_2x) : a.library_hero ? base(a.library_hero) : legacy('library_hero.jpg')),
  ];
  const logos = [{ ...steamVisual(legacy('logo.png')), official: true, label: 'Logo Steam officiel' }];
  const shots = item.screenshots?.all_ages_screenshots ?? [];
  const screenshots = shots.slice(0, 12).map((s) => {
    const full = STEAM_CDN + s.filename;
    return { ...steamVisual(full, 1920, 1080), thumb: full.replace(/\.jpg/, '.600x338.jpg') };
  });

  const ts = item.release?.original_release_date ?? item.release?.steam_release_date;
  const pegi = app.ratings?.pegi?.rating;
  const developers = item.basic_info?.developers?.map((d) => d.name) ?? [];
  const publishers = item.basic_info?.publishers?.map((d) => d.name) ?? [];
  const [wikiLogos, studios] = await Promise.all([gameLogos(item.name), studioLogos([...developers, ...publishers])]);

  return {
    source: 'steam',
    id: appid,
    name: item.name,
    summary: cleanText(item.basic_info?.short_description ?? app.short_description ?? ''),
    about: cleanText(app.about_the_game ?? ''),
    developers,
    publishers,
    releaseDate: app.release_date?.date ?? (ts ? new Date(ts * 1000).toLocaleDateString('fr-FR') : ''),
    year: ts ? String(new Date(ts * 1000).getFullYear()) : '',
    genres: app.genres?.map((g) => g.description) ?? [],
    pegi: pegi && /^\d+$/.test(pegi) ? pegi : undefined,
    storeUrl: `https://store.steampowered.com/app/${appid}`,
    covers: [...covers, ...(sgdb?.covers ?? [])],
    heroes: [...heroes, ...(sgdb?.heroes ?? [])],
    logos: sortLogos([...logos, ...wikiLogos, ...(sgdb?.logos ?? [])]),
    studios,
    screenshots,
  };
}

/** Retire le HTML et les espaces superflus d'une description Steam. */
function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;| /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// ---------- SteamGridDB ----------

interface SgdbImage {
  url: string;
  thumb: string;
  width: number;
  height: number;
  style?: string;
  nsfw?: boolean;
  humor?: boolean;
}

async function sgdbImages(target: string, env: Env) {
  const auth = { authorization: `Bearer ${env.STEAMGRIDDB_API_KEY}` };
  const get = (kind: string, query = '') =>
    getJson<{ success: boolean; data: SgdbImage[] }>(`${SGDB}/${kind}/${target}${query}`, auth)
      .then((r) => (r.data ?? []).filter((i) => !i.nsfw && !i.humor).slice(0, 16))
      .catch(() => [] as SgdbImage[]);
  const [covers, heroes, logos] = await Promise.all([
    get('grids', '?dimensions=600x900,342x482,660x930&types=static'),
    get('heroes', '?types=static'),
    get('logos', '?types=static'),
  ]);
  const map = (list: SgdbImage[]): Visual[] =>
    list.map((i) => ({
      url: i.url,
      thumb: i.thumb,
      width: i.width,
      height: i.height,
      source: 'steamgriddb',
      // SteamGridDB marque « official » les logos extraits des sources de l'éditeur.
      official: i.style === 'official',
    }));
  return { covers: map(covers), heroes: map(heroes), logos: map(logos) };
}

async function sgdbDetails(id: string, env: Env): Promise<GameDetails> {
  if (!env.STEAMGRIDDB_API_KEY) throw new Error('Clé SteamGridDB absente');
  const [game, images] = await Promise.all([
    getJson<{ data: { name: string; release_date?: number } }>(`${SGDB}/games/id/${id}`, {
      authorization: `Bearer ${env.STEAMGRIDDB_API_KEY}`,
    }),
    sgdbImages(`game/${id}`, env),
  ]);
  const ts = game.data.release_date;
  const wikiLogos = await gameLogos(game.data.name);
  return {
    source: 'steamgriddb',
    id,
    name: game.data.name,
    summary: '',
    about: '',
    developers: [],
    publishers: [],
    releaseDate: ts ? new Date(ts * 1000).toLocaleDateString('fr-FR') : '',
    year: ts ? String(new Date(ts * 1000).getFullYear()) : '',
    genres: [],
    ...images,
    logos: sortLogos([...wikiLogos, ...images.logos]),
    studios: [],
    screenshots: [],
  };
}

// ---------- Images ----------

async function proxyImage(raw: string): Promise<Response> {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: 'Adresse invalide' }, 400);
  }
  if (target.protocol !== 'https:' || !IMAGE_HOSTS.some((re) => re.test(target.hostname))) {
    return json({ error: 'Source non autorisée' }, 403);
  }
  const res = await fetch(target, { headers: { 'user-agent': UA } });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) return json({ error: `Image indisponible (${res.status})` }, 404);
  return new Response(res.body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=86400' },
  });
}

// ---------- Logos (Wikimedia Commons) ----------

export interface LogoFile {
  title: string;
  name: string;
  url: string;
  thumb: string;
  width: number;
  height: number;
  page: string;
}

interface CommonsPage {
  title: string;
  missing?: string;
  imageinfo?: { thumburl?: string; url: string; width: number; height: number; descriptionurl: string; mime: string }[];
}

/** Largeurs de vignettes standard de Wikimedia (les autres sont vite limitées). */
const LOGO_WIDTH = 1280;
const THUMB_WIDTH = 250;

function toLogo(p: CommonsPage): LogoFile | null {
  const ii = p.imageinfo?.[0];
  if (!ii || !/^image\/(svg|png|webp|jpeg)/.test(ii.mime)) return null;
  const full = ii.thumburl ?? ii.url;
  const thumb = ii.thumburl ? ii.thumburl.replace(`/${LOGO_WIDTH}px-`, `/${THUMB_WIDTH}px-`) : ii.url;
  return {
    title: p.title,
    name: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    url: full,
    thumb,
    width: ii.width,
    height: ii.height,
    page: ii.descriptionurl,
  };
}

function commonsUrl(params: Record<string, string>): string {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: String(LOGO_WIDTH),
    ...params,
  });
  return `${COMMONS}?${q}`;
}

async function commonsSearch(q: string): Promise<LogoFile[]> {
  q = q.trim();
  if (q.length < 2) return [];
  const data = await getJson<{ query?: { pages?: (CommonsPage & { index: number })[] } }>(
    commonsUrl({
      generator: 'search',
      gsrnamespace: '6',
      gsrsearch: `${q} logo filetype:drawing`,
      gsrlimit: '24',
    }),
  );
  return (data.query?.pages ?? [])
    .sort((a, b) => a.index - b.index)
    .map(toLogo)
    .filter((l): l is LogoFile => !!l);
}

async function commonsFiles(titles: string[]): Promise<LogoFile[]> {
  const list = titles.map((t) => t.trim()).filter(Boolean).slice(0, 50);
  if (!list.length) return [];
  type Rename = { from: string; to: string };
  const data = await getJson<{ query?: { pages?: CommonsPage[]; normalized?: Rename[]; redirects?: Rename[] } }>(
    commonsUrl({ titles: list.join('|'), redirects: '1' }),
  );
  // Un fichier renommé sur Commons garde le nom demandé, pour que le catalogue le retrouve.
  const asked = new Map<string, string>();
  for (const r of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) asked.set(r.to, asked.get(r.from) ?? r.from);
  return (data.query?.pages ?? [])
    .map(toLogo)
    .filter((l): l is LogoFile => !!l)
    .map((l) => ({ ...l, title: asked.get(l.title) ?? l.title }));
}

// ---------- Logos officiels des jeux et des studios ----------

/** Les logos officiels d'abord, puis ceux de la communauté. */
function sortLogos(list: Visual[]): Visual[] {
  return [...list].sort((a, b) => Number(!!b.official) - Number(!!a.official));
}

function fromLogoFile(l: LogoFile, label?: string): Visual {
  return {
    url: l.url,
    thumb: l.thumb,
    width: l.width,
    height: l.height,
    source: 'wikimedia',
    official: true,
    label: label ?? l.name,
  };
}

/** Logo du jeu sur Wikimedia Commons (souvent le logo officiel vectoriel). */
async function gameLogos(name: string): Promise<Visual[]> {
  const key = normalize(name.replace(/[™®©]/g, ''));
  if (key.length < 3) return [];
  const list = await commonsSearch(name.replace(/[™®©:]/g, ' ')).catch(() => []);
  return list
    .filter((l) => normalize(l.name).includes(key))
    // Le plus proche du nom exact en premier (« Hades logo » avant « Hades II logo »).
    .sort((a, b) => normalize(a.name).length - normalize(b.name).length)
    .slice(0, 6)
    .map((l) => fromLogoFile(l));
}

/** Logos du développeur et de l'éditeur. */
async function studioLogos(names: string[]): Promise<Visual[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 3);
  const results = await Promise.all(
    unique.map(async (studio) => {
      // On compare sur le mot le plus long du nom (« CD PROJEKT RED » → « projekt »).
      const token = normalize(
        studio
          .split(/[\s,.-]+/)
          .filter((w) => !/^(games?|studios?|entertainment|interactive|inc|ltd|llc|sa|ag|gmbh)$/i.test(w))
          .sort((a, b) => b.length - a.length)[0] ?? studio,
      );
      if (token.length < 3) return [];
      const list = await commonsSearch(studio).catch(() => []);
      return list
        .filter((l) => normalize(l.name).includes(token))
        .slice(0, 3)
        .map((l) => fromLogoFile(l, studio));
    }),
  );
  const seen = new Set<string>();
  return results.flat().filter((v) => !seen.has(v.url) && seen.add(v.url));
}

// ---------- Jaquettes officielles scannées (MobyGames) ----------
// MobyGames classe les scans par pays (France…) et par type (face, dos, disque).
// Clé personnelle obligatoire ; usage commercial soumis à leur accord.

const MOBY = 'https://api.mobygames.com/v1';
let lastMobyCall = 0;

/** MobyGames limite à environ une requête par seconde : on espace les appels. */
async function mobyGet<T>(path: string, env: Env): Promise<T> {
  if (!env.MOBYGAMES_API_KEY) throw new Error('Clé MobyGames absente');
  const sep = path.includes('?') ? '&' : '?';
  const url = `${MOBY}${path}${sep}api_key=${encodeURIComponent(env.MOBYGAMES_API_KEY)}`;
  if (!cache.has(url)) {
    const wait = lastMobyCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastMobyCall = Date.now();
  }
  return getJson<T>(url);
}

export interface MobyGame {
  id: number;
  title: string;
  platforms: { id: number; name: string }[];
}

async function mobyFind(title: string, env: Env): Promise<MobyGame | null> {
  title = title.replace(/[™®©]/g, '').trim();
  if (title.length < 2) return null;
  const data = await mobyGet<{ games?: { game_id: number; title: string }[] }>(
    `/games?title=${encodeURIComponent(title)}&format=brief&limit=10`,
    env,
  );
  const games = data.games ?? [];
  const key = normalize(title);
  const best = games.find((g) => normalize(g.title) === key) ?? games[0];
  if (!best) return null;
  const p = await mobyGet<{ platforms?: { platform_id: number; platform_name: string }[] }>(`/games/${best.game_id}/platforms`, env);
  // Windows d'abord : c'est le cas le plus courant pour les jeux dématérialisés.
  const platforms = (p.platforms ?? [])
    .map((x) => ({ id: x.platform_id, name: x.platform_name }))
    .sort((a, b) => Number(b.name === 'Windows') - Number(a.name === 'Windows'));
  return { id: best.game_id, title: best.title, platforms };
}

export interface CoverPack {
  label: string;
  countries: string[];
  french: boolean;
  front?: Visual;
  back?: Visual;
  spine?: Visual;
  media?: Visual;
  others: (Visual & { label: string })[];
}

interface MobyCover {
  scan_of: string;
  image: string;
  thumbnail_image?: string;
  width: number;
  height: number;
}

const FRENCH = ['France', 'Belgium', 'Switzerland', 'Canada', 'Luxembourg'];

async function mobyCovers(game: string, platform: string, env: Env): Promise<CoverPack[]> {
  if (!/^\d+$/.test(game) || !/^\d+$/.test(platform)) throw new Error('Paramètres invalides');
  const data = await mobyGet<{ cover_groups?: { comments?: string | null; countries?: string[]; covers?: MobyCover[] }[] }>(
    `/games/${game}/platforms/${platform}/covers`,
    env,
  );
  const visual = (c: MobyCover): Visual => ({
    url: c.image,
    thumb: c.thumbnail_image ?? c.image,
    width: c.width,
    height: c.height,
    source: 'mobygames',
    official: true,
    label: c.scan_of,
  });
  const packs = (data.cover_groups ?? []).map((g): CoverPack => {
    const covers = g.covers ?? [];
    const find = (re: RegExp) => covers.find((c) => re.test(c.scan_of));
    const used = new Set<MobyCover>();
    const take = (re: RegExp) => {
      const c = find(re);
      if (c) used.add(c);
      return c ? visual(c) : undefined;
    };
    const countries = g.countries ?? [];
    return {
      label: [countries.join(', '), g.comments].filter(Boolean).join(' — ') || 'Édition',
      countries,
      french: countries.some((c) => FRENCH.includes(c)),
      front: take(/^front cover$/i),
      back: take(/^back cover$/i),
      spine: take(/spine|sides/i),
      media: take(/^media$/i),
      others: covers.filter((c) => !used.has(c)).map((c) => ({ ...visual(c), label: c.scan_of })),
    };
  });
  // Éditions françaises d'abord, puis celles qui ont face et dos.
  const score = (p: CoverPack) => (p.countries.includes('France') ? 4 : 0) + (p.french ? 2 : 0) + (p.front && p.back ? 1 : 0);
  return packs.sort((a, b) => score(b) - score(a));
}
