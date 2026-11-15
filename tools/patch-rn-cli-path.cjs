// 讓 node_modules 位於「其他磁碟」時，React Native / Expo 的 Gradle 建置仍能成功。
//
// 背景：
//   RN 的 Os.cliPath() 會把 CLI 路徑轉成「相對路徑」，理由是
//   「Gradle doesn't support well path with spaces on Windows」。
//   但 Kotlin 的 File.relativeTo() 在兩個檔案「根目錄不同」時會直接丟出
//   IllegalArgumentException("this and base files have different roots: ... and ...")。
//
//   本專案的 node_modules 是指向 D:\html_test_nm\PicSorter\node_modules 的 junction，
//   專案本身在 C:，因此 base（專案根目錄）與 some（node_modules 內的檔案）
//   會落在不同磁碟 → relativeTo() 拋錯 →
//     :app:createBundleReleaseJsAndAssets / :app:generateCodegenSchemaFromJavaScript 失敗。
//
//   修正：relativeTo() 失敗時改用絕對路徑。專案路徑不含空白，
//   Gradle 可以正常處理絕對路徑，行為與原意一致。
//
// 這個修正只作用在「根目錄不同」的情況；一般同磁碟的建置路徑完全不變。

const fs = require('node:fs');
const path = require('node:path');

const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'shared',
  'src',
  'main',
  'kotlin',
  'com',
  'facebook',
  'react',
  'utils',
  'Os.kt'
);

const PATTERN = /(fun File\.cliPath\(base: File\): String\s*=\s*\r?\n\s*if \(isWindows\(\)\) \{\s*\r?\n)(\s*)(this\.relativeTo\(base\)\.path)/;

function main() {
  if (!fs.existsSync(TARGET)) {
    console.log('[patch-rn-cli-path] 略過：找不到 ' + TARGET);
    return;
  }

  const src = fs.readFileSync(TARGET, 'utf8');

  if (src.includes('catch (e: IllegalArgumentException)')) {
    console.log('[patch-rn-cli-path] 已套用，略過');
    return;
  }

  const replaced = src.replace(
    PATTERN,
    (_m, head, indent, body) =>
      `${head}${indent}try {\n` +
      `${indent}  ${body}\n` +
      `${indent}} catch (e: IllegalArgumentException) {\n` +
      `${indent}  // 根目錄不同（例如 node_modules 在其他磁碟的 junction）時無法算相對路徑。\n` +
      `${indent}  // 路徑不含空白時 Gradle 可直接使用絕對路徑。\n` +
      `${indent}  absolutePath\n` +
      `${indent}}`
  );

  if (replaced === src) {
    console.warn('[patch-rn-cli-path] 略過：Os.kt 內容與預期不符（react-native 版本可能已變更）');
    return;
  }

  fs.writeFileSync(TARGET, replaced, 'utf8');
  console.log('[patch-rn-cli-path] 已修正 ' + TARGET);
}

main();
