/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#0284c7', // sky-600
        'primary-hover': '#0369a1', // sky-700
        'secondary': '#f0f9ff', // sky-50
        'accent': '#fbbf24', // amber-400
      },
    },
  },
  plugins: [],
}

