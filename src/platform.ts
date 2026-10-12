import { Capacitor } from '@capacitor/core';

/** Platform words for user-facing text, so Android never reads "iPhone". */
export const isAndroid = Capacitor.getPlatform() === 'android'
  // Dev store shots: ?demo=store&os=android renders the Android wording.
  || (import.meta.env.DEV && new URLSearchParams(location.search).get('os') === 'android');
export const DEVICE = isAndroid ? 'phone' : 'iPhone';
export const SECURE_STORE = isAndroid ? 'Android Keystore' : 'iOS Keychain';
export const BROWSER = isAndroid ? 'your browser' : 'Safari';
