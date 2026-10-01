import { darkVariables, palette } from "./theme-palette.js";

const bg = palette("bg");
const tx = palette("tx");
const bd = palette("bd");
const { dark, reset } = darkVariables();

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
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
    backgroundColor: bg,
    gradientColorStops: bg,
    textColor: tx,
    placeholderColor: tx,
    fill: tx,
    stroke: tx,
    caretColor: tx,
    accentColor: tx,
    textDecorationColor: tx,
    borderColor: { ...bd, DEFAULT: bd.slate["200"] },
    divideColor: { ...bd, DEFAULT: bd.slate["200"] },
    outlineColor: bd,
    ringColor: { ...bd, DEFAULT: bd.blue["500"] },
    ringOffsetColor: bg,
  },
  plugins: [
    // `coarse:` = touch-first devices (phones, tablets): larger tap targets without changing desktop density.
    ({ addVariant }) => addVariant("coarse", "@media (pointer: coarse)"),
    // `theme-static`: regions that are dark in both themes (the sidebar) keep their light-mode colours.
    ({ addBase }) => addBase({ ":root.dark": { ...dark, colorScheme: "dark" }, ":root.dark .theme-static": reset }),
  ],
};
