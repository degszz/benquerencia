/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        coriander: '#488A0F',
        roti: '#C7A54E',
        cream: '#EBE8D2',
        creamDark: '#DBD6AF',
        forest: '#3a4a32',
        forestDeep: '#2d3a27',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
