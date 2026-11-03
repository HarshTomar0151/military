import type { CapacitorConfig } from '@capacitor/cli';

// Android packaging: `npm run cap:add:android` once, then `npm run cap:sync` + `npm run cap:open`.
// The exact same Vite build (dist/) is loaded into the Android WebView.
const config: CapacitorConfig = {
  appId: 'com.jetfront.game',
  appName: 'JETFRONT',
  webDir: 'dist',
  backgroundColor: '#070b08',
  android: { allowMixedContent: true },
  server: { androidScheme: 'http' },
};

export default config;
