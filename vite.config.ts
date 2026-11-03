import { defineConfig } from 'vite';

// `base: './'` keeps asset URLs relative so the same build works inside the
// Capacitor Android WebView. In dev the Socket.IO server (port 3001) is proxied
// through Vite so the game works from the same origin, including over LAN.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
