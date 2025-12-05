import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Split vendor chunks
              if (id.includes('node_modules')) {
                // React and React DOM
                if (id.includes('react') || id.includes('react-dom')) {
                  return 'vendor-react';
                }
                // Firebase
                if (id.includes('firebase')) {
                  return 'vendor-firebase';
                }
                // React Router
                if (id.includes('react-router')) {
                  return 'vendor-router';
                }
                // Google GenAI
                if (id.includes('@google/genai')) {
                  return 'vendor-genai';
                }
                // Other node_modules
                return 'vendor-other';
              }
            }
          }
        }
      }
    };
});
