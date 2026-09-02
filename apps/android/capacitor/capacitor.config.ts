import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.indiafoss.companion',
  appName: 'IndiaFOSS Companion',
  webDir: '../../web/build',
  server: {
    // http://localhost is still a secure context (WebCrypto, service worker) and
    // lets the web layer reach the embedded Neutrino node on http://127.0.0.1
    // without a mixed-content block.
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // The app bar is dark, so the status bar icons must be light. Insets are
    // handled in CSS (--safe-top) from the variables the plugin injects.
    SystemBars: { style: 'DARK', insetsHandling: 'css' },
  },
};

export default config;
