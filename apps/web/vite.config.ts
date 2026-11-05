import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({ plugins: [tanstackRouter({ target: 'react', routesDirectory: './src/app/routes', generatedRouteTree: './src/app/routeTree.gen.ts', autoCodeSplitting: true }), react()], resolve: { alias: Object.fromEntries(['app','pages','widgets','units','shared'].map(layer => [`@${layer}`, fileURLToPath(new URL(`./src/${layer}`, import.meta.url))])) }, server: { proxy: { '/api': { target: 'http://127.0.0.1:4311', changeOrigin: false } } }, build: { chunkSizeWarningLimit: 900 } });
