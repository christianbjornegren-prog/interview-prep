import boulder from './tailwind.boulder.js'

// tailwind.boulder.js är designerns export från Figma och läggs in ORÖRD –
// ny export = byt filen. Här slås den ihop med appens behov:
//  - Designerns `screens` ERSÄTTER Tailwinds brytpunkter. Appen använder
//    sm:/md:/lg: på flera ställen, så de nya (tablet/desktop/wide) läggs
//    TILL i stället – annars går befintlig layout sönder i det tysta.
//  - `brand.*` ligger kvar för bakåtkompatibilitet tills inget använder dem.
const { screens, extend } = boulder.theme

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      ...extend,
      screens,
      colors: {
        ...extend.colors,
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
        ...extend.fontFamily,
      },
    },
  },
  plugins: [],
}
