/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        slate: {
          950: '#0a0f1e',
        },
        risk: {
          red: '#ef4444',
          'red-bg': '#fef2f2',
          'red-border': '#fecaca',
          'red-dark': '#b91c1c',
          yellow: '#f59e0b',
          'yellow-bg': '#fffbeb',
          'yellow-border': '#fde68a',
          'yellow-dark': '#b45309',
          green: '#10b981',
          'green-bg': '#f0fdf4',
          'green-border': '#bbf7d0',
          'green-dark': '#047857',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
