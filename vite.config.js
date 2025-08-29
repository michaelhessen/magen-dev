import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: '/<REPO_NAME>/',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
