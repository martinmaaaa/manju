import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';

    return {
      clearScreen: false,
      server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: true,
      },
      plugins: [tailwindcss(), react()],
      define: {
        // Keep legacy client modules from crashing, but never inject server secrets into the browser bundle.
        'process.env.API_KEY': JSON.stringify(''),
        'process.env.GEMINI_API_KEY': JSON.stringify(''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: 'es2022',
        minify: 'esbuild',
        sourcemap: !isProd,
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks(id) {
              // Vendor chunks
              if (id.includes('node_modules')) {
                if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
                if (id.includes('@google/genai')) return 'vendor-genai';
                if (id.includes('lucide-react')) return 'vendor-icons';
                if (id.includes('zustand') || id.includes('swr') || id.includes('jszip')) return 'vendor-utils';
                return; // let vite handle other node_modules
              }
            },
          },
        },
        chunkSizeWarningLimit: 600,
      },
      esbuild: {
        drop: isProd ? ['console', 'debugger'] : [],
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'zustand', 'swr', 'lucide-react'],
      },
    };
});
