/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        coal: {
          950: '#0a0f16',
          900: '#0e1620',
          800: '#141f2b',
          700: '#1c2b3a',
          600: '#27384a',
        },
        brand: {
          500: '#2f6fed',
          600: '#2557c7',
          400: '#5b8ff5',
        },
        ok: '#2fb872',
        warn: '#f2994a',
        alarm: '#e5484d',
        info: '#f2c94c',
      },
      fontFamily: {
        sans: ['Assistant', 'Rubik', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
