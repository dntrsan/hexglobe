import { defineConfig } from 'vite';

export default defineConfig({
  // dev server keeps root '/' so localhost:5173 works normally
  base: process.env.NODE_ENV === 'production' ? '/eth-wthr/' : '/',
  server: {
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
});
