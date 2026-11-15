// PicSorter 建立 admob-config.json 與 ad-reset-config.json。
const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function ensureAdConfig(root = path.resolve(__dirname, '..')) {
  const target = path.join(root, 'admob-config.json');
  if (fs.existsSync(target)) {
    readJson(target);
    return false;
  }
  const config = { appId: '', units: { splash: '', milestone: '', floating: '', banner: '', prerecording: '' } };
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return true;
}

function ensureAdResetConfig(root = path.resolve(__dirname, '..')) {
  const target = path.join(root, 'ad-reset-config.json');
  if (fs.existsSync(target)) {
    readJson(target);
    return false;
  }
  const config = { token: '' };
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return true;
}

module.exports = { ensureAdConfig, ensureAdResetConfig };
if (require.main === module) {
  ensureAdConfig();
  ensureAdResetConfig();
}
