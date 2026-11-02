const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertLegacyCertificate } = require('./apk-certificate.cjs');

const [jar, input, output] = process.argv.slice(2);
if (!jar || !input || !output) throw new Error('Usage: node scripts/sign-apk.cjs <apksigner.jar> <input.apk> <output.apk>');
if (!process.env.KEYSTORE_BASE64 || !process.env.KEYSTORE_PASSWORD || !process.env.KEY_ALIAS || !process.env.KEY_PASSWORD) {
  throw new Error('Missing central signing key environment variables.');
}
const directory = path.resolve('.ci-signing');
const keystore = path.join(directory, 'release.keystore');
fs.mkdirSync(directory, { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(keystore, Buffer.from(process.env.KEYSTORE_BASE64, 'base64'), { mode: 0o600 });
const env = { ...process.env, APK_STORE_PASSWORD: process.env.KEYSTORE_PASSWORD, APK_KEY_PASSWORD: process.env.KEY_PASSWORD };
function run(args) {
  const result = spawnSync('java', ['-jar', jar, ...args], { env, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`apksigner failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
try {
  run(['sign', '--ks', keystore, '--ks-key-alias', process.env.KEY_ALIAS, '--ks-pass', 'env:APK_STORE_PASSWORD',
    '--key-pass', 'env:APK_KEY_PASSWORD', '--v4-signing-enabled', 'false', '--out', output, input]);
  const verified = run(['verify', '--print-certs', output]);
  try { assertLegacyCertificate(verified); } catch (error) {
    fs.rmSync(output, { force: true });
    throw error;
  }
  console.log('APK signature verified: matches the central PicSorter key.');
} finally {
  fs.rmSync(keystore, { force: true });
}
