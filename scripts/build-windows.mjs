import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'release');
const zig = process.env.ZIG || 'zig';
const work = mkdtempSync(join(tmpdir(), 'minestart-win-'));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const parts = version.split('.').map(Number);
if (parts.length !== 3 || !parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 65535)) {
  throw new Error('La version doit comporter trois nombres de 0 à 65535.');
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw new Error(`Impossible de lancer ${command} : ${result.error.message}`, { cause: result.error });
  if (result.status !== 0) throw new Error(`${command} a échoué (${result.status ?? result.signal}).`);
}

function verifyExe(bytes, machine, game) {
  if (bytes.length < 256 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('En-tête Windows absent.');
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0' || bytes.readUInt16LE(pe + 4) !== machine) {
    throw new Error('L’architecture de l’exécutable est incorrecte.');
  }
  // Optional header: PE32+ (64-bit), then IMAGE_SUBSYSTEM_WINDOWS_GUI.
  if (bytes.readUInt16LE(pe + 24) !== 0x20b || bytes.readUInt16LE(pe + 24 + 68) !== 2) {
    throw new Error('Le programme doit être un exécutable graphique Windows 64 bits.');
  }
  if (!bytes.includes(game)) throw new Error('La copie autonome du jeu ne se trouve pas dans l’exécutable.');
}

try {
  run(process.execPath, ['scripts/build.mjs']);
  const game = readFileSync(join(root, 'index.html'));
  const res = join(work, 'launcher.res');
  writeFileSync(join(work, 'release-version.h'), `#define RELEASE_VERSION_NUM ${parts.join(',')},0\n#define RELEASE_VERSION_TEXT "${parts.join('.')}"\n`);
  run(zig, ['rc', '/fo', res, '/i', work, 'native/launcher.rc']);

  const names = [];
  for (const { target, machine, name } of [
    { target: 'x86_64-windows-gnu', machine: 0x8664, name: 'Minestart.exe' },
    { target: 'aarch64-windows-gnu', machine: 0xaa64, name: 'Minestart-arm64.exe' },
  ]) {
    const output = join(work, name);
    run(zig, ['cc', '-target', target, '-municode', '-Wl,--subsystem,windows', '-O2', '-s', '-Wall', '-Wextra', '-Werror',
      'native/launcher.c', res, '-luser32', '-lshell32', '-lshlwapi', '-lole32', '-luuid', '-o', output]);
    verifyExe(readFileSync(output), machine, game);
    names.push(name);
  }
  writeFileSync(join(work, 'Minestart.html'), game);
  names.push('Minestart.html');
  const sums = names.map((name) => `${createHash('sha256').update(readFileSync(join(work, name))).digest('hex')}  ${name}`).join('\n');
  writeFileSync(join(work, 'SHA256SUMS.txt'), `${sums}\n`);
  names.push('SHA256SUMS.txt');
  mkdirSync(dist, { recursive: true });
  for (const name of names) copyFileSync(join(work, name), join(dist, name));
  console.log(`Release Windows : ${names.map((name) => `release/${name}`).join(', ')}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
