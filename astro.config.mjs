import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'path';

export default defineConfig({
  site: 'https://benquerencia.vercel.app',
  output: 'static',
  integrations: [react()],
  vite: {
    css: {
      postcss: {
        plugins: [
          tailwindcss(resolve('./tailwind.config.cjs')),
          autoprefixer(),
        ],
      },
    },
  },
});
