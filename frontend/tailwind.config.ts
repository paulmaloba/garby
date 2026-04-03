import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Official Garby brand palette ──────────────────────────────────
        'garby-black':  '#07081A',
        'garby-white':  '#F0F2FF',
        'garby-cyan':   '#00DFFF',
        'garby-purple': '#5B21D6',
        'garby-green':  '#2ECC71',   // Primary action / success
        'garby-red':    '#FF3B5C',   // Danger / AI detected
        // Legacy aliases
        'garby-dark':   '#1A1A2E',
        'garby-mid':    '#16213E',
        'garby-accent': '#0F3460',
        'garby-light':  '#E8F8F0',
        'garby-grey':   '#7F8C8D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.08)',
      },
      animation: {
        'fade-in':     'fadeIn 0.35s ease-out',
        'slide-up':    'slideUp 0.4s ease-out',
        'slide-down':  'slideDown 0.3s ease-out',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
        'scan-line':   'scanLine 1.8s linear infinite',
        'spin-slow':   'spin 1.5s linear infinite',
        'bounce-dot':  'bounceDot 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(46, 204, 113, 0.4)' },
          '50%':      { boxShadow: '0 0 0 12px rgba(46, 204, 113, 0)' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(600%)' },
        },
        bounceDot: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
      boxShadow: {
        'glow-green': '0 0 24px rgba(46, 204, 113, 0.15)',
        'glow-red':   '0 0 24px rgba(255, 59, 92, 0.15)',
        'glow-cyan':  '0 0 24px rgba(0, 223, 255, 0.15)',
      },
    },
  },
  plugins: [],
}

export default config
