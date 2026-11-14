// Mises à jour de l'appli de bureau, à partir des versions publiées sur GitHub.
//
// - Windows : electron-updater télécharge la nouvelle version en arrière-plan (fichier latest.yml
//   publié avec la version) ; elle s'installe au redémarrage.
// - macOS (et Linux) : l'installation automatique exige une appli signée par Apple. On regarde donc
//   la dernière version sur GitHub, on télécharge le bon .dmg dans Téléchargements et on l'ouvre.
//
// L'interface lit l'état par /api/update (servi par l'appli, pas par le serveur web).
import { app, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPO = 'assfir3/jaquette-master';
const RELEASES = `https://github.com/${REPO}/releases`;
const EVERY = 6 * 60 * 60 * 1000;

export type UpdateState = {
  current: string;
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  /** Windows : téléchargement et installation par l'appli elle-même. */
  auto: boolean;
  version?: string;
  /** Page de la version sur GitHub (nouveautés). */
  page?: string;
  percent?: number;
  /** macOS : fichier .dmg téléchargé. */
  file?: string;
  error?: string;
  checkedAt?: number;
};

/** Pour essayer sans publier : JAQUETTE_FAKE_VERSION=0.0.1 fait croire que l'appli est ancienne. */
const CURRENT = process.env.JAQUETTE_FAKE_VERSION || app.getVersion();
const AUTO = process.platform === 'win32' && app.isPackaged && !process.env.JAQUETTE_FAKE_VERSION;

let status: UpdateState = { current: CURRENT, state: 'idle', auto: AUTO };
let asset: { name: string; url: string } | undefined;

function set(patch: Partial<UpdateState>) {
  status = { ...status, ...patch };
}

/** 1.10.0 > 1.9.2 ; les préversions (1.2.0-beta) passent avant la version finale. */
export function newer(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [main, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: main.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d > 0;
  }
  return !x.pre && !!y.pre;
}

/** Le fichier qui convient à cet ordinateur, dans les fichiers d'une version. */
function pickAsset(assets: { name: string; browser_download_url: string }[]) {
  const want =
    process.platform === 'darwin'
      ? `-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
      : process.platform === 'win32'
        ? '-windows-setup.exe'
        : '-linux.AppImage';
  const a = assets.find((x) => x.name.endsWith(want));
  return a && { name: a.name, url: a.browser_download_url };
}

async function checkGithub() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Jaquette-Master' },
  });
  if (res.status === 404) return set({ state: 'none' });
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
  const rel = (await res.json()) as { tag_name: string; html_url: string; draft: boolean; assets: { name: string; browser_download_url: string }[] };
  const version = rel.tag_name.replace(/^v/, '');
  if (rel.draft || !newer(version, CURRENT)) return set({ state: 'none', version: undefined });
  asset = pickAsset(rel.assets);
  if (status.state === 'downloading' || (status.state === 'ready' && status.version === version)) return;
  set({ state: 'available', version, page: rel.html_url });
}

export async function checkForUpdates() {
  if (status.state === 'downloading' || status.state === 'checking') return status;
  const before = status.state;
  set({ state: 'checking', error: undefined });
  try {
    if (AUTO) {
      const r = await autoUpdater.checkForUpdates();
      // Les événements d'electron-updater mettent l'état à jour ; ici, seulement « rien de neuf ».
      if (!r || !r.isUpdateAvailable) set({ state: 'none' });
    } else {
      await checkGithub();
    }
  } catch (err) {
    // Pas de réseau, GitHub indisponible… On réessaiera plus tard, sans déranger.
    set({ state: before === 'available' ? 'available' : 'error', error: err instanceof Error ? err.message : String(err) });
  }
  set({ checkedAt: Date.now() });
  return status;
}

/** macOS / Linux (ou Windows en secours) : télécharge le fichier de la nouvelle version dans Téléchargements. */
async function download() {
  // Windows, si l'installation automatique a échoué : on récupère le lien de l'installateur.
  if (!asset) await checkGithub().catch(() => {});
  if (!asset) {
    if (status.page) await shell.openExternal(status.page);
    return;
  }
  const dest = path.join(app.getPath('downloads'), asset.name);
  const part = `${dest}.part`;
  set({ state: 'downloading', percent: 0 });
  try {
    const res = await fetch(asset.url);
    if (!res.ok || !res.body) throw new Error(`Téléchargement refusé (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    let got = 0;
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    body.on('data', (c: Buffer) => {
      got += c.length;
      if (total) set({ percent: Math.round((got / total) * 100) });
    });
    await pipeline(body, createWriteStream(part));
    await rename(part, dest);
    set({ state: 'ready', percent: 100, file: dest });
    await shell.openPath(dest);
  } catch (err) {
    await rm(part, { force: true }).catch(() => {});
    set({ state: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

/** Requêtes de l'interface : /api/update, /api/update/check, /download, /install, /page. */
export async function handleUpdate(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/update')) return null;
  const action = url.pathname.slice('/api/update'.length).replace(/^\//, '');
  if (action === 'check') await checkForUpdates();
  else if (action === 'download') {
    if (status.state === 'available') void download();
  } else if (action === 'install') {
    if (AUTO && status.state === 'ready' && !status.file) setImmediate(() => autoUpdater.quitAndInstall(true, true));
    else if (status.file) await shell.openPath(status.file);
  } else if (action === 'page') await shell.openExternal(status.page ?? RELEASES);
  else if (action) return Response.json({ error: 'Action inconnue' }, { status: 404 });
  return Response.json(status, { headers: { 'cache-control': 'no-store' } });
}

export function startUpdates() {
  if (AUTO) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) =>
      set({ state: 'downloading', version: info.version, percent: 0, page: `${RELEASES}/tag/v${info.version}` }),
    );
    autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      // Échec de l'installation automatique : on propose quand même la page de téléchargement.
      set({ state: status.version ? 'available' : 'error', error: err?.message });
    });
  }
  // Pas en développement (sauf essai) ni pendant le test de lancement.
  if ((!app.isPackaged && !process.env.JAQUETTE_FAKE_VERSION) || process.env.JAQUETTE_SMOKE_TEST) return;
  setTimeout(checkForUpdates, 8_000);
  setInterval(checkForUpdates, EVERY);
}
