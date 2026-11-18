import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, renderPage } from './render-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const buildTools = process.env.ANDROID_BUILD_TOOLS || '36.0.0';
const minSdk = '26';
const targetSdk = '36';
const source = join(root, 'mobile', 'android');
const release = join(root, 'release');
const javaTool = (name) => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name;
const androidTool = (name) => join(sdk, 'build-tools', buildTools, name);
const { version } = JSON.parse(read('package.json'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Version Android : utilise major.minor.patch.');
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 1_000_000 + minor * 1000 + patch;
if (minor > 999 || patch > 999 || versionCode < 1 || versionCode > 2_100_000_000) throw new Error('versionCode Android invalide.');
if (!sdk) throw new Error('Définis ANDROID_HOME vers le SDK Android.');
const platform = join(sdk, 'platforms', `android-${targetSdk}`, 'android.jar');
for (const path of [platform, ...['aapt2', 'd8', 'zipalign', 'apksigner'].map(androidTool)]) {
  if (!existsSync(path)) throw new Error(`Outil SDK manquant : ${path}`);
}

const work = mkdtempSync(join(tmpdir(), 'minestart-android-'));
const run = (command, args, env = process.env) => execFileSync(command, args, { env, stdio: 'inherit' });
try {
  const assets = join(work, 'assets'), res = join(work, 'res'), classes = join(work, 'classes'), dex = join(work, 'dex');
  const compiled = join(work, 'res.zip'), jar = join(work, 'game.jar');
  const unsigned = join(work, 'unsigned.apk'), aligned = join(work, 'aligned.apk');
  const apk = join(work, 'Minestart.apk');
  for (const dir of [assets, classes, dex, release]) mkdirSync(dir, { recursive: true });
  cpSync(join(source, 'res'), res, { recursive: true });
  mkdirSync(join(res, 'mipmap-nodpi'));
  copyFileSync(join(root, 'docs', 'icons', 'icon-192.png'), join(res, 'mipmap-nodpi', 'minestart.png'));
  const game = renderPage('android');
  writeFileSync(join(assets, 'index.html'), game);

  run(androidTool('aapt2'), ['compile', '--dir', res, '-o', compiled]);
  run(androidTool('aapt2'), ['link', '-I', platform, '--manifest', join(source, 'AndroidManifest.xml'),
    '--min-sdk-version', minSdk, '--target-sdk-version', targetSdk, '--version-code', String(versionCode),
    '--version-name', version, '-A', assets, '-o', unsigned, compiled]);
  run(javaTool('javac'), ['-encoding', 'UTF-8', '--release', '8', '-classpath', platform, '-d', classes,
    join(source, 'java', 'io', 'github', 'azzoxmxyt', 'minestart', 'MainActivity.java')]);
  run(javaTool('jar'), ['cf', jar, '-C', classes, '.']);
  run(androidTool('d8'), ['--lib', platform, '--min-api', minSdk, '--release', '--output', dex, jar]);
  run('zip', ['-qjX', unsigned, join(dex, 'classes.dex')]);
  run(androidTool('zipalign'), ['-f', '4', unsigned, aligned]);

  const env = { ...process.env };
  const password = 'MINESTART_ANDROID_PASSWORD';
  const alias = env.MINESTART_ANDROID_KEY_ALIAS || 'minestart';
  let key;
  if (env.MINESTART_ANDROID_KEYSTORE) {
    if (!env[password]) throw new Error(`Définis ${password} pour signer avec le keystore fourni.`);
    key = resolve(env.MINESTART_ANDROID_KEYSTORE);
  } else {
    console.warn('Signature avec une clé temporaire : les futures versions ne pourront pas remplacer cet APK sans désinstallation.');
    key = join(work, 'temporary.p12');
    env[password] = randomBytes(24).toString('base64url');
    run(javaTool('keytool'), ['-genkeypair', '-keystore', key, '-storetype', 'PKCS12', '-alias', alias,
      '-storepass:env', password, '-keypass:env', password, '-keyalg', 'RSA', '-keysize', '2048',
      '-validity', '10000', '-dname', 'CN=Minestart'], env);
  }
  run(androidTool('apksigner'), ['sign', '--ks', key, '--ks-key-alias', alias, '--ks-pass', `env:${password}`,
    '--key-pass', `env:${password}`, '--v4-signing-enabled', 'false', '--out', apk, aligned], env);
  run(androidTool('apksigner'), ['verify', '--verbose', apk]);
  run(androidTool('zipalign'), ['-c', '4', apk]);
  const metadata = execFileSync(androidTool('aapt2'), ['dump', 'badging', apk], { encoding: 'utf8' });
  if (!metadata.includes("package: name='io.github.azzoxmxyt.minestart'") ||
      !new RegExp(`^(?:minSdkVersion|sdkVersion):'${minSdk}'$`, 'm').test(metadata) ||
      !metadata.includes(`versionCode='${versionCode}'`) || !metadata.includes(`versionName='${version}'`) ||
      !metadata.includes(`targetSdkVersion:'${targetSdk}'`) || metadata.includes('android.permission.INTERNET')) {
    console.error(metadata);
    throw new Error('Manifeste Android inattendu.');
  }
  if (execFileSync('unzip', ['-p', apk, 'assets/index.html'], { encoding: 'utf8' }) !== game) {
    throw new Error('Le jeu embarqué ne correspond pas aux sources.');
  }
  copyFileSync(apk, join(release, 'Minestart.apk'));
  console.log(`release/Minestart.apk · ${version} · Android 8+ · signé`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
