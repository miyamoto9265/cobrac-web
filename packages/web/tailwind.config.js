/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Noto Sans JP", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      keyframes: {
        "step-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "step-in": "step-in 240ms ease-out",
      },
    },
  },
  plugins: [
    // `coarse:` = touch-first devices (phones, tablets): larger tap targets without changing desktop density.
    ({ addVariant }) => addVariant("coarse", "@media (pointer: coarse)"),
  ],
};
