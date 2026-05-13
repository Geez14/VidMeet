/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['"Manrope"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#08090b',
          800: '#0f1115',
          700: '#161a21',
          600: '#1e242d',
          500: '#2a313c',
        },
        bone: {
          100: '#f4f1ea',
          200: '#e8e3d6',
          300: '#cfc8b8',
        },
        signal: {
          DEFAULT: '#ff4d2e',
          soft: '#ffb39e',
          deep: '#c2371e',
        },
        moss: '#7ea25b',
      },
      animation: {
        'pulse-soft': 'pulse 2.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scan': 'scan 3.2s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      boxShadow: {
        'glow-signal': '0 0 0 1px rgba(255,77,46,0.18), 0 0 40px -10px rgba(255,77,46,0.45)',
      },
    },
  },
  plugins: [],
};
