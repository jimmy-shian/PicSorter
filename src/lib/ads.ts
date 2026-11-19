import mobileAds from 'react-native-google-mobile-ads';

let initPromise: Promise<boolean> | null = null;

/**
 * Initialize Google Mobile Ads SDK once on app startup.
 * Resolves to true on success and false on failure without throwing.
 */
export function initMobileAds(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = mobileAds()
    .initialize()
    .then(() => true)
    .catch((error) => {
      console.warn('MobileAds initialization failed:', error);
      return false;
    });

  return initPromise;
}
