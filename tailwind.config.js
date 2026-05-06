/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#000000',
          surface: '#1d1d1d',
          border: '#404040',
          'border-dark': '#323232',
          purple: '#8064ad',
          'purple-header': '#9781be',
          'purple-dark': '#4f3a70',
          green: '#60a678',
          blue: '#6497d1',
          orange: '#d18a54',
          pink: '#c05d8a',
          muted: '#6b7280',
        }
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
