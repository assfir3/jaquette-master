// Mise à jour sur Mac sans signature Apple : l'appli télécharge le .dmg de la nouvelle version,
// en sort la nouvelle appli, puis remplace elle-même son dossier .app une fois fermée.
// (L'outil d'Apple, Squirrel.Mac, exige une appli signée avec un certificat Developer ID.)
import { app } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { constants, writeFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Dossier .app de l'appli en cours (JAQUETTE_UPDATE_TARGET pour essayer sur une copie). */
export function appBundle(): string {
  return process.env.JAQUETTE_UPDATE_TARGET || path.resolve(process.execPath, '..', '..', '..');
}

/** L'appli peut-elle se remplacer ? Pas si elle tourne depuis le .dmg ou un dossier protégé. */
export async function canSelfUpdate(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  const bundle = appBundle();
  if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return false;
  try {
    await access(path.dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Dossier de travail des mises à jour, dans les données de l'appli. */
export function updatesDir(): string {
  return path.join(app.getPath('userData'), 'updates');
}

export function stagedApp(): string {
  return path.join(updatesDir(), 'next', path.basename(appBundle()));
}

/** Version d'une appli .app (CFBundleShortVersionString), ou null. */
export async function bundleVersion(bundle: string): Promise<string | null> {
  try {
    const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(bundle, 'Contents', 'Info.plist')]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Sort la nouvelle appli de l'archive (.zip, ou .dmg pour les versions sans .zip), la vérifie et la range. */
export async function stage(file: string, expected: string): Promise<void> {
  const next = path.dirname(stagedApp());
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  if (file.endsWith('.zip')) {
    await run('/usr/bin/ditto', ['-x', '-k', file, next]);
  } else {
    const mnt = await mkdtemp(path.join(os.tmpdir(), 'jaquette-dmg-'));
    await run('/usr/bin/hdiutil', ['attach', file, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mnt]);
    try {
      await run('/usr/bin/ditto', [path.join(mnt, path.basename(appBundle())), stagedApp()]);
    } finally {
      await run('/usr/bin/hdiutil', ['detach', mnt, '-force']).catch(() => {});
      await rm(mnt, { recursive: true, force: true }).catch(() => {});
    }
  }
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagedApp()]);
  const v = await bundleVersion(stagedApp());
  if (v !== expected) throw new Error(`Version inattendue dans le fichier (${v ?? '?'})`);
  // Fichiers téléchargés par l'appli : pas de quarantaine, mais on s'en assure.
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', stagedApp()]).catch(() => {});
}

const SCRIPT = `#!/bin/bash
# Remplace l'appli une fois qu'elle est fermée, puis la relance si demandé.
pid="$1"; new="$2"; dest="$3"; relaunch="$4"
for i in $(seq 1 600); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
old="$dest.ancienne-$$"
if mv "$dest" "$old"; then
  if mv "$new" "$dest"; then
    rm -rf "$old"
  else
    mv "$old" "$dest"
    relaunch=1
  fi
fi
xattr -dr com.apple.quarantine "$dest" 2>/dev/null
[ "$relaunch" = 1 ] && open "$dest"
`;

let launched = false;

/**
 * Lance le remplacement, qui attend la fermeture de l'appli. Synchrone : appelée aussi pendant
 * la fermeture (will-quit), où rien d'asynchrone n'a le temps de finir.
 */
export function installStaged(relaunch: boolean): boolean {
  if (launched) return false;
  launched = true;
  const script = path.join(updatesDir(), 'installer.sh');
  writeFileSync(script, SCRIPT, { mode: 0o755 });
  const child = spawn('/bin/bash', [script, String(process.pid), stagedApp(), appBundle(), relaunch ? '1' : '0'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return true;
}
