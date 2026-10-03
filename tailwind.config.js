/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          // Matched to /designs: neutral near-black ground, slightly lifted cards.
          DEFAULT: '#0f0e11',
          raised: '#17161a',
          card: '#1c1b20',
        },
        accent: {
          pink: '#ff4f8b',
          orange: '#ff8a3d',
        },
        // Design's red for buttons/borders (softer than status-alert).
        danger: {
          DEFAULT: '#f04848',
          line: '#b3141c',
        },
        // "Save & continue" disabled fill.
        disabled: '#a3a3a8',
        status: {
          calm: '#3dd68c',
          checkin: '#ffb020',
          alert: '#ff3b3b',
        },
        ink: {
          DEFAULT: '#f5f3f7',
          dim: '#a9a3b5',
          faint: '#6b6578',
        },
      },
      maxWidth: {
        app: '430px',
      },
      spacing: {
        tap: '60px',
      },
      borderRadius: {
        xl2: '0.75rem',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        enter: 'enter 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(255, 77, 141, 0.35)',
      },
    },
  },
  plugins: [],
}
