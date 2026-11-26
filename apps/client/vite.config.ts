import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateServerUrl } from './src/game/networking/serverEndpoint.ts';
import { createServiceWorker } from './pwa/createServiceWorker.ts';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const endpoint = process.env.VITE_SERVER_URL ?? env.VITE_SERVER_URL;
  const publicBuild =
    command === 'build' &&
    (process.env.VERCEL === '1' || process.env.REQUIRE_PUBLIC_SERVER === '1');
  if (publicBuild && !endpoint?.trim())
    throw new Error(
      'Set VITE_SERVER_URL to the public HTTPS multiplayer server before deploying.',
    );
  if (endpoint?.trim()) validateServerUrl(endpoint, publicBuild);
  return {
    plugins: [react(), createServiceWorker()],
    build: {
      target: 'es2022',
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // Keep optional SMAA code/lookup data in its lazy chunk.
              {
                name: 'three',
                test: /node_modules[\\/]three[\\/](?:build|src)[\\/]/,
              },
              { name: 'physics', test: /node_modules[\\/]@dimforge[\\/]/ },
            ],
          },
        },
      },
      chunkSizeWarningLimit: 2500,
    },
  };
});
