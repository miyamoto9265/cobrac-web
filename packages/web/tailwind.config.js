/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans JP", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [
    // `coarse:` = touch-first devices (phones, tablets): larger tap targets without changing desktop density.
    ({ addVariant }) => addVariant("coarse", "@media (pointer: coarse)"),
  ],
};
