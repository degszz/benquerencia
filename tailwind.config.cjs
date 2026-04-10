/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Benquerencia — valores directos sin CSS variables
        ben: {
          950: '#0f1a0f',
          900: '#1a2b1a',  // fondo principal
          800: '#243824',  // cards / navbar
          700: '#2e4a2e',  // hover
          600: '#3a5a3a',  // botones
          500: '#4a7a4a',  // botón hover
          400: '#7fb87f',  // accent / texto secundario
          300: '#a8d4a8',
        },
      },
      borderRadius: {
        xl:  '1rem',
        '2xl': '1.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
