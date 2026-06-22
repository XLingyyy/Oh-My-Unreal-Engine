import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  publicDir: false,
  build: {
    target: 'node18',
    outDir: 'dist/preload',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rolldownOptions: {
      input: path.resolve(__dirname, 'src/preload/preload.ts'),
      external: ['electron'],
      output: {
        format: 'cjs',
        entryFileNames: 'preload.js',
        codeSplitting: false,
      },
    },
  },
});
