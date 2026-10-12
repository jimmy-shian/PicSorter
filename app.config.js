/**
 * 版本唯一來源：根目錄 package.json 的 "version"。
 * 改版號只改那一處，這裡自動引用並推導原生版號：
 * - expo.version / iOS buildNumber / Android versionCode 全部由此產生
 * - 設定頁顯示的版號讀原生 Application 常數（expo-application），不手寫
 */
const { version } = require('./package.json');

function toVersionCode(v) {
  const parts = String(v).split('.').map((n) => parseInt(n, 10) || 0);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

const versionCode = toVersionCode(version);

module.exports = {
  expo: {
    name: 'PicSorter',
    slug: 'PicSorter',
    scheme: 'picsorter',
    version,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.picsorter.app',
      buildNumber: String(versionCode),
      infoPlist: {
        NSPhotoLibraryUsageDescription:
          '揀影需要讀取你的照片，才能進行分類整理。整理結果只儲存在本機，不會上傳。',
        NSPhotoLibraryAddUsageDescription:
          '揀影需要將分類結果寫入相簿，並在你確認後將照片移入系統垃圾桶。',
      },
    },
    android: {
      package: 'com.picsorter.app',
      versionCode,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-status-bar',
      'expo-sqlite',
      'expo-image',
      [
        'expo-media-library',
        {
          photosPermission: 'Allow PicSorter to read your photos for local sorting.',
          savePhotosPermission: 'Allow PicSorter to save sorting results to albums.',
          isAccessMediaLocationEnabled: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};
