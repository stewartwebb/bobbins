const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.sky,
        surface: {
          50: '#f8fbff',
          100: '#eef6ff',
          200: '#d9e9ff',
          300: '#bfd9ff',
          400: '#9cc1ff',
          500: '#7aa9ff',
          600: '#5b89e6',
          700: '#4268bf',
          800: '#2e4a94',
          900: '#1e3265'
        }
      },
      backgroundImage: {
        'sky-glow': 'radial-gradient(circle at top, rgba(14, 165, 233, 0.25), transparent 60%)',
        'sky-gradient': 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(8, 47, 73, 0.85))'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 15px 35px rgba(14, 165, 233, 0.25)'
      }
    }
  },
  plugins: []
};