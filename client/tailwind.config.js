/** Colours come from CSS variables in src/index.css, so the whole palette can be changed in one place (or from Admin → Settings → Theme). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'rgb(var(--c-navy) / <alpha-value>)', brand: 'rgb(var(--c-blue) / <alpha-value>)', cream: 'rgb(var(--c-cream) / <alpha-value>)',
        gold: 'rgb(var(--c-yellow) / <alpha-value>)', ink: 'rgb(var(--c-ink) / <alpha-value>)', muted: 'rgb(var(--c-muted) / <alpha-value>)', line: 'rgb(var(--c-line) / <alpha-value>)',
        wall: 'rgb(var(--c-wall) / <alpha-value>)',
      },
      fontFamily: { display: ['Marcellus', 'Georgia', 'serif'], sans: ['Manrope', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '1rem' },
      boxShadow: { soft: '0 1px 2px rgba(28,37,65,.04), 0 8px 24px rgba(28,37,65,.06)' },
    },
  },
  plugins: [],
};
