/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        panel2: 'rgb(var(--c-panel2) / <alpha-value>)',
        panel3: 'rgb(var(--c-panel3) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        accent2: 'rgb(var(--c-accent2) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        inkdim: 'rgb(var(--c-inkdim) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Microsoft YaHei', 'sans-serif']
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px'
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,24,64,0.04), 0 6px 18px rgba(28,24,64,0.06)',
        card: '0 1px 2px rgba(28,24,64,0.05), 0 4px 14px rgba(28,24,64,0.07)',
        pop: '0 12px 36px rgba(76,60,180,0.18)',
        glow: '0 0 0 3px rgba(108,92,231,0.16)'
      },
      backgroundImage: {
        'accent-grad': 'linear-gradient(135deg, #6c5ce7 0%, #8b7bff 45%, #4c8bf5 100%)',
        'app-bg': 'radial-gradient(1200px 600px at 15% -10%, #efeafe 0%, rgba(239,234,254,0) 55%), radial-gradient(1000px 520px at 110% 0%, #e6f0ff 0%, rgba(230,240,255,0) 50%), linear-gradient(180deg, #faf9fe 0%, #f4f3fa 100%)'
      }
    }
  },
  plugins: []
}
