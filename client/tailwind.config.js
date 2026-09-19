/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Prompt"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Prompt"', 'sans-serif'],
      },
      colors: {
        cozy: {
          bg: '#FAF7F2',
          card: '#FFFFFF',
          'card-warm': '#FAF8F5',
          blush: '#FDF2F0',
          amber: '#FDF8EE',
          sage: '#F0FDF4',
          lavender: '#F5F3FF',
          sky: '#F0F9FF',
          border: '#E8E2D9',
          'border-subtle': '#F2ECE4',
          muted: '#8C827A',
          'muted-dark': '#6B625B',
          text: '#2D2825',
          dark: '#1C1917',
        },
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(45, 40, 37, 0.04)',
        'cozy-xs': '0 1px 3px 0 rgba(45, 40, 37, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.85)',
        'cozy-sm': '0 2px 5px -1px rgba(45, 40, 37, 0.05), 0 1px 3px -1px rgba(45, 40, 37, 0.03), inset 0 1px 0 0 rgba(255, 255, 255, 0.9)',
        cozy: '0 4px 14px -2px rgba(45, 40, 37, 0.06), 0 2px 6px -1px rgba(45, 40, 37, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.85)',
        'cozy-lg': '0 12px 32px -6px rgba(45, 40, 37, 0.08), 0 4px 14px -2px rgba(45, 40, 37, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.9)',
        'glow-rose': '0 10px 30px -6px rgba(244, 63, 94, 0.22), 0 4px 12px -2px rgba(244, 63, 94, 0.1)',
        'glow-amber': '0 10px 30px -6px rgba(245, 158, 11, 0.22), 0 4px 12px -2px rgba(245, 158, 11, 0.1)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.625rem',
      },
    },
  },
  plugins: [],
};
