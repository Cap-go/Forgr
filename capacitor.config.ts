import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.capgo.mapp',
  appName: 'Mapp',
  webDir: 'dist',
  backgroundColor: '#0d0a1f',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      defaultChannel: 'production',
      appReadyTimeout: 10000,
    },
    SecureStoragePlugin: {},
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
