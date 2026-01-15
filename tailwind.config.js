/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter Tight', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        obsidian: {
          DEFAULT: '#020617', // Dark Mode BG
          surface: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
          accent: '#22d3ee', // Cyan-400
        },
        alabaster: {
          DEFAULT: '#f8fafc', // Light Mode BG
          surface: 'rgba(0, 0, 0, 0.05)',
          border: 'rgba(0, 0, 0, 0.1)',
          accent: '#2563eb', // Blue-600
        }
      },
      transitionDuration: {
        '800': '800ms',
      },
      backgroundImage: {
        'grid-obsidian': 'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'grid-alabaster': 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)',
      }
    }
  },
  plugins: [],
}
