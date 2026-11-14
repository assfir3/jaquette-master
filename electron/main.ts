// Application de bureau : la même interface que la version web, dans une fenêtre Electron.
// Les pages et le serveur intermédiaire (/api) sont servis par une adresse propre à l'appli
// (jaquette://app) : pas de port réseau ouvert, et l'étagère (IndexedDB) reste au même endroit
// d'un lancement à l'autre.
import { app, BrowserWindow, Menu, protocol, shell } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { handleApi, type Env } from '../server/api';
import { handleUpdate, startUpdates } from './updates';

const SCHEME = 'jaquette';
const ORIGIN = `${SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

/** Dossier de l'interface construite par Vite (à côté du code de l'appli, une fois empaquetée). */
const WEB_ROOT = path.join(__dirname, '..', 'dist');

/**
 * Clés d'API facultatives (SteamGridDB, MobyGames) : variables d'environnement,
 * ou fichier config.json dans le dossier de l'appli (créé vide au premier lancement).
 */
async function loadEnv(): Promise<Env> {
  const file = path.join(app.getPath('userData'), 'config.json');
  let saved: Env = {};
  try {
    saved = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ STEAMGRIDDB_API_KEY: '', MOBYGAMES_API_KEY: '' }, null, 2)).catch(() => {});
  }
  return {
    CONFIG_FILE: file,
    STEAMGRIDDB_API_KEY: process.env.STEAMGRIDDB_API_KEY || saved.STEAMGRIDDB_API_KEY || undefined,
    MOBYGAMES_API_KEY: process.env.MOBYGAMES_API_KEY || saved.MOBYGAMES_API_KEY || undefined,
  };
}

async function serveFile(url: URL): Promise<Response> {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(WEB_ROOT, rel));
  if (!file.startsWith(WEB_ROOT + path.sep)) return new Response('Accès refusé', { status: 403 });
  try {
    const data = await readFile(file);
    return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' } });
  } catch {
    return new Response('Introuvable', { status: 404 });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Jaquette Master',
    backgroundColor: '#0d1018',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Les liens externes (fiche Steam, Wikimedia…) s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith(process.env.VITE_DEV_SERVER_URL ?? '\0')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(process.env.VITE_DEV_SERVER_URL ?? `${ORIGIN}/index.html`);
  if (SMOKE_FILE) win.webContents.once('did-finish-load', () => smokeTest(win, SMOKE_FILE));
}

/**
 * Test de lancement, utilisé par GitHub Actions sur l'appli installée :
 * JAQUETTE_SMOKE_TEST=<fichier> vérifie l'interface et le serveur intermédiaire,
 * écrit le résultat en JSON dans ce fichier, puis quitte (code 0 si tout va bien).
 */
const SMOKE_FILE = process.env.JAQUETTE_SMOKE_TEST;

async function smokeTest(win: BrowserWindow, file: string) {
  const timer = setTimeout(() => finish({ ok: false, error: 'Délai dépassé' }), 60_000);
  async function finish(result: Record<string, unknown>) {
    clearTimeout(timer);
    await writeFile(file, JSON.stringify({ version: app.getVersion(), platform: process.platform, arch: process.arch, ...result }, null, 2)).catch(() => {});
    app.exit(result.ok ? 0 : 1);
  }
  try {
    const checks = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 100 && !(document.querySelector('.brand') && document.querySelector('canvas')); i++) await wait(200);
      const out = {
        origin: location.origin,
        interface: !!document.querySelector('.brand'),
        canvas: !!document.querySelector('canvas'),
        webgl: !!document.createElement('canvas').getContext('webgl2'),
      };
      try { out.status = (await (await fetch('/api/status')).json()).steam === true; } catch { out.status = false; }
      out.search = 0;
      for (let i = 0; i < 3 && !out.search; i++) {
        try { out.search = (await (await fetch('/api/search?q=Portal%202')).json()).length || 0; } catch {}
        if (!out.search) await wait(3000);
      }
      return out;
    })()`);
    const ok = checks.origin === ORIGIN && checks.interface && checks.canvas && checks.status && checks.search > 0;
    await finish({ ok, ...checks });
  } catch (err) {
    await finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

app.whenReady().then(async () => {
  const env = await loadEnv();
  protocol.handle(SCHEME, async (req) => (await handleUpdate(req)) ?? (await handleApi(req, env)) ?? serveFile(new URL(req.url)));

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  createWindow();
  startUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
