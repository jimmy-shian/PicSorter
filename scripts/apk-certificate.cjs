const EXPECTED_CERT = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

function assertLegacyCertificate(output) {
  // 新版 apksigner 會以 minSdkVersion/maxSdkVersion 標示 v3 signer。
  const certificates = [...output.matchAll(/Signer[^\r\n]*certificate SHA-256 digest:\s*([a-f\d]+)/gi)];
  if (!certificates.length || certificates.some((match) => match[1].toLowerCase() !== EXPECTED_CERT)) {
    throw new Error(`APK signing certificate does not match v1.0.4. Verification output:\n${output}`);
  }
}

module.exports = { assertLegacyCertificate };
