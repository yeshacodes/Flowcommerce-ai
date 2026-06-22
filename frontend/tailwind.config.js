/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // VITURE-inspired premium SaaS palette
        ember: { DEFAULT: '#ff5f34', hot: '#f31010' },
        obsidian: '#0c0c0c',
        ink: '#161616',
        coal: '#1d1d1f',
        ash: '#7e7e7f',
        slate2: '#5b5c5d',
        pewter: '#abacae',
        fog: '#949597',
        snow: '#f7f7f8',
        mist: '#eff0f3',
        void: '#000000',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '24px',
        tile: '18px',
        input: '14px',
        pill: '9999px',
      },
      boxShadow: {
        soft: 'rgba(12, 12, 12, 0.06) 0px 1px 2px 0px, rgba(12, 12, 12, 0.04) 0px 4px 16px -2px',
        cta: 'rgba(255, 95, 52, 0.28) 0px 6px 20px -6px',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
}
