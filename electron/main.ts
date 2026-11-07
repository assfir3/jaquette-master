// Application de bureau : la même interface que la version web, dans une fenêtre Electron.
// Les pages et le serveur intermédiaire (/api) sont servis par une adresse propre à l'appli
// (jaquette://app) : pas de port réseau ouvert, et l'étagère (IndexedDB) reste au même endroit
// d'un lancement à l'autre.
import { app, BrowserWindow, Menu, protocol, shell } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { handleApi, type Env } from '../server/api';

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
}

app.whenReady().then(async () => {
  const env = await loadEnv();
  protocol.handle(SCHEME, async (req) => (await handleApi(req, env)) ?? serveFile(new URL(req.url)));

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
