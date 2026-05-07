import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://benquerencia.vercel.app',
  output: 'static',
  integrations: [react(), tailwind()],
});
