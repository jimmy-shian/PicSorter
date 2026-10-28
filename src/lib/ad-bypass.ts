import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getPref, setPref } from './db';
import resetConfig from '../../ad-reset-config.json';
const listeners = new Set<(value: boolean) => void>();
export function useAdBypass() {
  const db = useSQLiteContext();
  const [bypassed, setBypassed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    listeners.add(setBypassed);
    void (async () => {
      if (resetConfig.token && await getPref(db, 'yesolve_ad_bypass_reset_token') !== resetConfig.token) {
        await setPref(db, 'yesolve_ad_bypass', 'false');
        await setPref(db, 'yesolve_ad_bypass_reset_token', resetConfig.token);
      }
      const saved = await getPref(db, 'yesolve_ad_bypass') === 'true';
      if (active) { setBypassed(saved); setReady(true); }
    })().catch(error => { console.warn('Ad preference load failed', error); if (active) setReady(true); });
    return () => { active = false; listeners.delete(setBypassed); };
  }, [db]);
  const enableBypass = async () => {
    await setPref(db, 'yesolve_ad_bypass', 'true');
    listeners.forEach(listener => listener(true));
  };
  return { bypassed, ready, enableBypass };
}
