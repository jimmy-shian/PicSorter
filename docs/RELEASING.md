# APK 建置與發布

GitHub Actions 直接在 runner 上用 Android SDK 與 Gradle 編譯 APK，再發布到 GitHub Releases。專案既有的 Expo CLI 只負責在 runner 本機產生 Android 專案。

## 發布流程

| 觸發方式 | 行為 |
| --- | --- |
| Pull request | 安裝依賴、lint、typecheck、測試 |
| Push `v*` tag | 檢查通過後，Gradle 建置並發布 GitHub Release |
| 手動執行 master 的 workflow | 檢查並建置目前版本，建立 Release；同一 commit 可重建 APK |

建置流程依序執行：

1. `npm ci` 安裝 lockfile 指定的依賴，執行 lint、typecheck 與測試。專案 `.npmrc` 使用 `legacy-peer-deps`，避免 npm 另外解析新版本 peer dependencies，導致既有 lockfile 無法安裝。
2. `npx expo prebuild --platform android --no-install` 根據 `app.config.js` 產生原生專案，不登入任何帳號。
3. `./gradlew :app:assembleRelease` 編譯包含 armeabi-v7a、arm64-v8a、x86、x86_64 的 universal APK。
4. 從 GitHub Secrets 還原既有金鑰，用 Android SDK 的 apksigner 簽署並驗證 APK。
5. 檢查 APK 完整性、產生 SHA-256 校驗碼，保存 Actions artifact 並上傳 GitHub Release。

Tag 必須等於 `v` 加上 package.json 的版本號。同名 tag 若已指向其他 commit，流程會停止，需提升版本。重跑同一 tag 會更新該 Release 的同名 APK 與校驗碼。

## 簽章設定

已沿用本機 `android/app/debug.keystore`，並比對它與 `PicSorter-v1.0.4-arm64.apk` 的憑證 SHA-256 一致：

```text
fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
```

GitHub repository → Settings → Secrets and variables → Actions 使用兩個 Secrets：

| 名稱 | 內容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 既有 keystore 的 Base64 |
| `CREDENTIALS_JSON_BASE64` | 下方簽章設定 JSON 的 Base64 |

簽章設定 JSON 格式：

```json
{
  "android": {
    "keystore": {
      "keystorePath": ".ci-signing/release.keystore",
      "keystorePassword": "android",
      "keyAlias": "androiddebugkey",
      "keyPassword": "android"
    }
  }
}
```

CI 固定將金鑰還原到被 Git 忽略的 `.ci-signing/release.keystore`，不使用 JSON 中的路徑寫入任意位置。密碼由環境變數傳給 apksigner，工作完成後清除金鑰檔案。發布前會驗證簽章必須與 v1.0.4 相同，確保可以更新安裝。

透過 GitHub API 設定 Secrets 的 token 需要 repository 的 `Secrets: Read and write`。執行 workflow 使用自動提供的 `GITHUB_TOKEN`，發布工作已設定 `contents: write`，不需要把個人 GitHub token 放到 CI。

## 發布新版本

版本號以 package.json 為唯一來源，app.config.js 自動推導 Android versionCode 與 iOS buildNumber。

```sh
npm version patch --no-git-tag-version
npm run lint
npm run typecheck
node --test tests/*.test.cjs
git add <本次變更檔案>
git commit -m "發布新版本"
git tag -a v1.0.5 -m "PicSorter v1.0.5"
git push origin master
git push origin v1.0.5
```

`v1.0.5` 為範例，請使用 package.json 實際版本。也可以在 GitHub Actions 選擇 **CI and release APK → Run workflow → master**，由流程替目前 commit 建立版本 tag 與 Release。

## 重建最近的版本

原本 `v1.0.4` 指向圖示更新 commit，該 commit 沒有 workflow，因此推送 tag 時沒有自動建置。新增 workflow 不會追溯觸發舊 tag。

此次操作修正使用 `1.0.5`，保留 v1.0.4 與既有歷史。包含 workflow 的 master 可以手動觸發發布，不需要移動舊 tag 或 force push。

## 產物與排錯

- 發布位置：[GitHub Releases](https://github.com/jimmy-shian/PicSorter/releases)。檔名為 `PicSorter-v<版本>.apk` 與同名 `.sha256`。
- 缺少簽章 Secrets 時，簽署步驟會報錯，不會發布 APK。
- Gradle 失敗時查看 Actions 中的建置 log；不會把舊 APK 當成這次產物。
- 簽章不符合既有憑證時，腳本拒絕發布。
- 本機既有 `android/` 不會被 CI 上傳；runner 每次從版本控制中的設定產生原生專案。

參考：[Android apksigner](https://developer.android.com/tools/apksigner) · [Expo 本機原生專案產生](https://docs.expo.dev/workflow/continuous-native-generation/)。
