/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Dynamic gradient classes built at runtime for the timetable subject
  // colors. Safelist so JIT never purges them.
  safelist: [
    'from-ios-blue',   'to-ios-indigo',
    'from-ios-green',  'to-ios-teal',
    'from-ios-purple', 'to-ios-pink',
    'from-ios-orange', 'to-ios-red',
    'from-ios-teal',   'to-ios-blue',
    'from-ios-pink',   'to-ios-red',
    'bg-gradient-to-br'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        ios: {
          blue:   '#307DFF',   // matches logo top-left electric blue
          indigo: '#3C3DFF',   // matches logo top-right
          purple: '#7F23FF',   // matches logo bottom-right
          pink:   '#FF375F',
          red:    '#FF453A',
          orange: '#FF9F0A',
          yellow: '#FFD60A',
          green:  '#30D158',
          teal:   '#64D2FF',
          gray:   '#8E8E93',
          navy:   '#0109BB'    // logo center — for dark surfaces
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.72)',
          dark:    'rgba(28,28,30,0.72)'
        }
      },
      borderRadius: {
        'xl2': '18px',
        '3xl': '24px',
        '4xl': '32px'
      },
      boxShadow: {
        'soft':  '0 8px 30px rgba(0,0,0,0.06)',
        'card':  '0 12px 40px rgba(0,0,0,0.08)',
        'hi':    '0 24px 60px rgba(10,132,255,0.25)',
        'glass': 'inset 0 1px 0 rgba(255,255,255,0.5), 0 8px 30px rgba(0,0,0,0.08)'
      },
      backdropBlur: { 'xl3': '32px' },
      keyframes: {
        floaty:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } }
      },
      animation: {
        floaty:  'floaty 6s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite'
      }
    }
  },
  plugins: []
};
