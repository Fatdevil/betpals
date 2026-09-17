import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/components/minigames.js')) {
            return 'arcade-minigames';
          }
          if (id.includes('/pages/admin.js')) {
            return 'page-admin';
          }
          if (id.includes('/pages/profile.js')) {
            return 'page-profile';
          }
          if (id.includes('/components/livestream.js')) {
            return 'livestream';
          }
        }
      }
    }
  }
});
