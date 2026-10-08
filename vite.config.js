import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/, other hosts (Vercel, local) from /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/neon-arena-shooter/' : '/',
});
