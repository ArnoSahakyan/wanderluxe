/** @type {import('tailwindcss').Config} */
import * as defaultTheme from 'tailwindcss/defaultTheme';
import typography from '@tailwindcss/typography';
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      sans: ['Poppins', 'sans-serif'],
      mono: [...defaultTheme.fontFamily.mono],
    },
    extend: {
      colors: {
        primary: {
          light: '#2A7A7B',
          dark: '#1BA098',
        },
        secondary: {
          light: '#4A5568',
          dark: '#869BA9',
        },
        accent: {
          // darkened from #E07A5F so prices/badges meet WCAG AA (4.5:1) on white
          light: '#C2553A',
          dark: '#E07A5F',
        },
        background: {
          light: '#F5F7FA',
          dark: '#081521',
        },
        text: {
          // brand gold; darkened from #D4A96A (2.2:1) to meet WCAG AA (5.3:1) on white
          light: '#8C6428',
          dark: '#DEB992',
        },
      },
    },
  },
  plugins: [typography],
};
