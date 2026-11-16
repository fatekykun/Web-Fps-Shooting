import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    target: 'node24',
    outDir: 'dist',
    rolldownOptions: { output: { entryFileNames: 'index.js' } },
  },
  ssr: { noExternal: ['@breakpoint/shared'] },
});
