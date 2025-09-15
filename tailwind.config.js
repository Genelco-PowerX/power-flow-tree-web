/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Power Flow Tree color palette
        s1: '#1259ad',        // S1 source trees (blue)
        s2: '#2b81e5',        // S2 source trees (bright blue)
        downstream: '#e77b16', // Downstream equipment (orange)
        selected: '#b8ff2b',  // Selected equipment (bright green)
      },
    },
  },
  plugins: [],
}