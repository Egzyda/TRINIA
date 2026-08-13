import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Cloudflare Pages にそのまま上げる想定。依存の重いアイコン群は別チャンクに分ける
    rollupOptions: {
      output: {
        manualChunks: {
          icons: ['react-icons/gi', 'lucide-react'],
        },
      },
    },
  },
});
