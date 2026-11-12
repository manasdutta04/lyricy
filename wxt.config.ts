import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';
import { SUPPORTED_SITES } from './src/core/agent/sites';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    // Prefresh HMR doesn't work inside extension pages loaded from the bundle.
    plugins: [preact({ prefreshEnabled: false })],
  }),
  manifest: {
    name: 'Lyricy',
    description:
      'Apple Music-style synced lyrics in a side panel for YouTube, YouTube Music, Spotify and more.',
    permissions: ['storage', 'sidePanel', 'scripting'],
    host_permissions: [
      ...SUPPORTED_SITES,
      'https://lrclib.net/*',
      'https://itunes.apple.com/*',
      'https://music.163.com/*',
      'https://api.lyrics.ovh/*',
    ],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Show lyrics' },
  },
});
