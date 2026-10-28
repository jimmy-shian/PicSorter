const EXPECTED_CERT = 'b90cb6eee6caba3f431e1dd967a9170c19e6c572b5b57c745e357e358e180d5a';

function assertLegacyCertificate(output) {
  // 新版 apksigner 會以 minSdkVersion/maxSdkVersion 標示 v3 signer。
  const certificates = [...output.matchAll(/Signer[^\r\n]*certificate SHA-256 digest:\s*([a-f\d]+)/gi)];
  if (!certificates.length || certificates.some((match) => match[1].toLowerCase() !== EXPECTED_CERT)) {
    throw new Error(`APK signing certificate does not match the central release key. Verification output:\n${output}`);
  }
}

module.exports = { assertLegacyCertificate };
