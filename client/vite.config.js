import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '..', // load the shared root .env (VITE_* variables)
  plugins: [
    react(),
    VitePWA({
      // 'prompt' = the app tells the user a new version is ready; the user
      // controls when to refresh (see client/src/components/PwaUpdatePrompt.jsx)
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-maskable-192.png'],
      manifest: {
        name: 'Labour Manager',
        short_name: 'Labourly',
        description: 'Attendance, daily wages and Word reports for your site labour — admin anywhere.',
        theme_color: '#4f46e5',
        background_color: '#f2f5fa',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // precache ONLY built static assets (hashed app shell). No runtime
        // caching rules are defined, so /api responses and Supabase auth
        // traffic are NEVER cached — labour records, attendance, wages,
        // tokens and sessions always come fresh from the network.
        globPatterns: ['**/*.{js,css,html,png,webmanifest,woff2}'],
        // SPA navigation fallback for deep links — never for API routes
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: { enabled: false }, // service worker only in production builds
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
