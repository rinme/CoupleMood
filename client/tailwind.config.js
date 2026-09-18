/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cozy: {
          bg: '#FAF7F2',
          card: '#FFFFFF',
          blush: '#FDF2F0',
          amber: '#FDF8EE',
          sage: '#F0FDF4',
          lavender: '#F5F3FF',
          sky: '#F0F9FF',
          border: '#E8E2D9',
          muted: '#8C827A',
          text: '#2D2825',
          dark: '#1C1917',
        },
      },
      boxShadow: {
        cozy: '0 2px 8px -2px rgba(45, 40, 37, 0.05), 0 4px 16px -4px rgba(45, 40, 37, 0.08)',
        'cozy-lg': '0 8px 24px -4px rgba(45, 40, 37, 0.1), 0 4px 12px -2px rgba(45, 40, 37, 0.05)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
