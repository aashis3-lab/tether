const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Light by default; <html data-theme="dark"> (set by src/lib/theme.ts) flips the tokens.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Material 3 color roles as RGB channels in CSS variables (src/index.css),
      // so every utility and opacity modifier (/10, /50) resolves in both themes.
      colors: {
        // Legacy names, mapped onto M3 surfaces so older markup follows the theme.
        bg: {
          DEFAULT: c('surface'),
          raised: c('surface-low'),
          card: c('surface-high'),
        },
        surface: {
          DEFAULT: c('surface'),
          lowest: c('surface-lowest'),
          low: c('surface-low'),
          mid: c('surface-mid'),
          high: c('surface-high'),
          highest: c('surface-highest'),
        },
        inverse: {
          DEFAULT: c('inverse'),
          on: c('on-inverse'),
        },
        primary: {
          DEFAULT: c('primary'),
          on: c('on-primary'),
          // Readable pink for text and icons on surfaces.
          ink: c('primary-ink'),
          container: c('primary-container'),
          'on-container': c('on-primary-container'),
        },
        secondary: {
          DEFAULT: c('secondary'),
          ink: c('secondary-ink'),
          container: c('secondary-container'),
          'on-container': c('on-secondary-container'),
        },
        outline: {
          DEFAULT: c('outline'),
          variant: c('outline-variant'),
        },
        line: c('outline-variant'),
        accent: {
          pink: c('primary'),
          orange: c('secondary'),
        },
        // Red means danger only: HELP, 911, active alerts.
        danger: {
          DEFAULT: c('danger'),
          line: c('danger'),
        },
        // Bright fills (dark text on top): green OK / safe, yellow "come find me".
        safe: c('safe'),
        findme: c('findme'),
        disabled: c('outline'),
        // Status text/icon colors, tuned per theme for contrast.
        status: {
          calm: c('ok-ink'),
          checkin: c('warn-ink'),
          alert: c('alert-ink'),
        },
        ink: {
          DEFAULT: c('on-surface'),
          dim: c('on-surface-variant'),
          faint: c('outline'),
        },
        me: c('me'),
      },
      backgroundImage: {
        brand: 'linear-gradient(to right, rgb(var(--c-primary)), rgb(var(--c-secondary)))',
        'brand-br': 'linear-gradient(to bottom right, rgb(var(--c-primary)), rgb(var(--c-secondary)))',
        'brand-tonal':
          'linear-gradient(to bottom right, rgb(var(--c-primary-container)), rgb(var(--c-secondary-container)))',
      },
      maxWidth: {
        app: '430px',
      },
      spacing: {
        // Minimum touch target (Material: 48dp).
        tap: '48px',
      },
      borderRadius: {
        xl2: '0.75rem',
      },
      // Material 3-style type scale: 12px labels, 14px body, 16-22px titles.
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.125rem' }],
        base: ['0.875rem', { lineHeight: '1.25rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.5rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem' }],
        '3xl': ['1.5rem', { lineHeight: '2rem' }],
        '4xl': ['1.75rem', { lineHeight: '2.25rem' }],
        '5xl': ['2.25rem', { lineHeight: '2.75rem' }],
        '6xl': ['3rem', { lineHeight: '3.5rem' }],
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'none' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pin-pulse': {
          '0%': { transform: 'scale(0.6)', opacity: '0.9' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
      },
      animation: {
        enter: 'enter 0.3s cubic-bezier(0.2, 0, 0, 1) both',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.2, 0, 0, 1) both',
        'fade-in': 'fade-in 0.2s ease-out both',
      },
      boxShadow: {
        // Material elevation levels.
        e1: '0 1px 2px rgb(0 0 0 / 0.18), 0 1px 3px 1px rgb(0 0 0 / 0.08)',
        e2: '0 1px 2px rgb(0 0 0 / 0.18), 0 2px 6px 2px rgb(0 0 0 / 0.1)',
        e3: '0 4px 8px 3px rgb(0 0 0 / 0.1), 0 1px 3px rgb(0 0 0 / 0.18)',
        glow: '0 0 40px -10px rgba(255, 79, 139, 0.35)',
        // Tether's warm, soft card shadow.
        soft: '0 1px 2px rgb(32 26 27 / 0.04), 0 8px 24px -12px rgb(255 79 139 / 0.18)',
      },
    },
  },
  plugins: [],
}
