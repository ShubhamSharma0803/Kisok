/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'Noto Sans Devanagari', 'sans-serif'],
        display: ['Playfair Display', 'Noto Sans Devanagari', 'serif'],
      },
      spacing: {
        'touch': '48px',
        'touch-lg': '64px',
        'touch-xl': '80px',
      },
      minHeight: (theme) => ({
        ...theme('spacing'),
        'touch': '48px',
        'touch-lg': '64px',
        'touch-xl': '80px',
      }),
      minWidth: (theme) => ({
        ...theme('spacing'),
        'touch': '48px',
        'touch-lg': '64px',
        'touch-xl': '80px',
      }),
      colors: {
        kiosk: {
          // Glare-resistant ultra-high-contrast colors (WCAG AAA 7:1+)
          bg: '#F8FAFC',          // Crisp off-white / light slate base (reduces glare)
          surface: '#FFFFFF',     // Pure white card surfaces
          text: '#0F172A',        // Deep navy black for maximum contrast
          textMuted: '#334155',   // High-legibility body text
          border: '#1E293B',      // Bold high-contrast borders (2px-4px)
          
          // Accent colors optimized for vision clarity
          voice: '#0284C7',       // Accessible sky/blue
          voiceBg: '#E0F2FE',
          touch: '#059669',       // Accessible emerald/green
          touchBg: '#D1FAE5',
          gaze: '#7C3AED',        // Accessible purple
          gazeBg: '#F3E8FF',
          
          error: '#DC2626',       // High contrast red
          errorBg: '#FEE2E2',
        }
      }
    },
  },
  plugins: [],
}
