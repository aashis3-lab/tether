const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colors are RGB channels in CSS variables (see src/index.css) so every
      // utility, opacity modifier (/10, /50) and gradient stop resolves to a
      // real color. `c('name')` -> rgb(var(--c-name) / <alpha-value>).
      colors: {
        bg: {
          DEFAULT: c('bg'),
          raised: c('bg-raised'),
          card: c('bg-card'),
        },
        // Brand only: logo, progress bars, small accents. Never primary buttons.
        accent: {
          pink: c('accent-pink'),
          orange: c('accent-orange'),
        },
        // Red means danger only: HELP, 911, active alerts.
        danger: {
          DEFAULT: c('danger'),
          line: c('danger-line'),
        },
        // Green means OK / safe; yellow means "come find me".
        safe: c('safe'),
        findme: c('findme'),
        disabled: c('disabled'),
        status: {
          calm: c('safe'),
          checkin: c('checkin'),
          alert: c('alert'),
        },
        ink: {
          DEFAULT: c('ink'),
          dim: c('ink-dim'),
          faint: c('ink-faint'),
        },
      },
      backgroundImage: {
        // Explicit stops, so it never depends on --tw-gradient-* variables.
        brand: 'linear-gradient(to right, rgb(var(--c-accent-pink)), rgb(var(--c-accent-orange)))',
        'brand-br': 'linear-gradient(to bottom right, rgb(var(--c-accent-pink)), rgb(var(--c-accent-orange)))',
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
