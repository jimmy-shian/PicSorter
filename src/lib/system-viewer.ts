import { Alert, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import i18n from '@/i18n';
import { toContentUri } from './media';

/** Open an Android MediaStore asset in the device's configured photo viewer. */
export async function openSystemPhotoViewer(
  assetId: string,
  fallbackUri: string,
  mediaType?: 'image' | 'video',
): Promise<void> {
  if (Platform.OS !== 'android') {
    Alert.alert(i18n.t('systemViewer.errorUnavailable'), i18n.t('systemViewer.androidOnly'));
    return;
  }

  // expo-media-library Asset.id or toContentUri gives the MediaStore content:// URI.
  const contentUri = toContentUri(assetId, mediaType);
  const data = contentUri.startsWith('content://') ? contentUri : (fallbackUri.startsWith('content://') ? fallbackUri : assetId);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data,
      ...(mediaType ? { type: mediaType === 'video' ? 'video/*' : 'image/*' } : {}),
      flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
    });
  } catch {
    Alert.alert(i18n.t('systemViewer.errorOpenFailed'), i18n.t('systemViewer.noViewerApp'));
  }
}
