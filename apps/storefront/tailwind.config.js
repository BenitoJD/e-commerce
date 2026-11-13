/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F7F2E9',
        surface: '#FFFDF8',
        ink: '#181410',
        muted: '#6F6357',
        line: '#E6DAC8',
        copper: {
          DEFAULT: '#A95F32',
          dark: '#874822',
          deep: '#63331A',
          light: '#F1E3D4'
        },
        // Keep the existing utilities warm rather than bright orange.
        orange: {
          50: '#F7EEE4', 100: '#EFE0CF', 200: '#E0C6AC', 300: '#CCA484',
          400: '#B87D55', 500: '#A95F32', 600: '#8F4D28', 700: '#753E20',
          800: '#5C311A', 900: '#442414'
        },
        brand: {
          DEFAULT: '#A95F32',
          dark: '#874822',
          light: '#F1E3D4'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'ui-serif', 'serif']
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.75rem'
      },
      boxShadow: {
        soft: '0 18px 50px -28px rgba(40, 26, 16, 0.35)',
        lift: '0 28px 70px -34px rgba(40, 26, 16, 0.45)'
      }
    }
  },
  plugins: []
};
