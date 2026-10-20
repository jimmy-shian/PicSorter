const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assertLegacyCertificate } = require('../scripts/apk-certificate.cjs');
const cert = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

test('接受舊版與新版 apksigner 的同一憑證輸出', () => {
  assert.doesNotThrow(() => assertLegacyCertificate(`Signer #1 certificate SHA-256 digest: ${cert}`));
  assert.doesNotThrow(() => assertLegacyCertificate(`Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${cert}\nSigner (minSdkVersion=33) certificate SHA-256 digest: ${cert}`));
});

test('拒絕空輸出、缺少 signer 與混入其他憑證', () => {
  assert.throws(() => assertLegacyCertificate(''));
  assert.throws(() => assertLegacyCertificate(`Source Stamp certificate SHA-256 digest: ${cert}`));
  assert.throws(() => assertLegacyCertificate(`Signer #1 certificate SHA-256 digest: ${cert}\nSigner #2 certificate SHA-256 digest: ${'0'.repeat(64)}`));
});
