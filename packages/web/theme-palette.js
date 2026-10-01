// Dark mode without `dark:` on every class: Tailwind's colours point at CSS variables, one set per role
// (background, text, border), so `bg-white` turns into a dark surface while `text-white` on a blue button stays white.
// Light mode uses the stock Tailwind colours (the fallback inside each var()); `.dark` overrides them.
import colors from "tailwindcss/colors";

const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
export const FAMILIES = ["slate", "gray", "red", "orange", "amber", "yellow", "green", "emerald", "teal", "sky", "blue", "indigo", "violet", "purple", "pink", "rose"];
const STATIC_FAMILIES = ["zinc", "neutral", "stone", "lime", "cyan", "fuchsia"];
export const ROLES = ["bg", "tx", "bd"];

/** Dark surfaces: the page is darker than the panels on it, as slate-50 is darker than white in light mode. */
export const DARK = {
  surface: "#0f1623",
  page: "#0a0f19",
};

const hex2rgb = (h) => {
  const s = h.length === 4 ? h.slice(1).replace(/./g, (c) => c + c) : h.slice(1);
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb2hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** `amount` of `a` over `b` */
export const mix = (a, b, amount) => {
  const x = hex2rgb(a);
  const y = hex2rgb(b);
  return rgb2hex(x.map((v, i) => v * amount + y[i] * (1 - amount)));
};
export const channels = (h) => hex2rgb(h).join(" ");

const SLATE_DARK = {
  // 700 / 800 are "selected" fills (chips, tooltips) with white text: lifted so they stand out from the dark surface
  bg: { white: DARK.surface, 50: DARK.page, 100: "#1a2333", 200: "#263042", 300: "#354155", 400: "#64748b", 700: "#526178", 800: "#3b4860", 900: "#070b13", 950: "#04070d" },
  tx: { 50: "#1c2533", 100: "#283244", 200: "#3b475a", 300: "#536177", 400: "#8291a7", 500: "#99a7ba", 600: "#b2bdcc", 700: "#cdd5e0", 800: "#e2e8f0", 900: "#eef2f7", 950: "#f8fafc" },
  bd: { white: DARK.surface, 50: "#161e2c", 100: "#1c2533", 200: "#263042", 300: "#354155", 400: "#4b5a70" },
};

/** Dark value of one colour in one role, or undefined to keep the light value. */
export function darkValue(role, family, shade) {
  if (family === "slate" || family === "gray") return SLATE_DARK[role][shade];
  const c = colors[family];
  if (!c) return undefined;
  if (role === "bg") {
    const tint = { 50: [c[500], 0.12], 100: [c[500], 0.2], 200: [c[500], 0.3], 300: [c[400], 0.45] }[shade];
    return tint ? mix(tint[0], DARK.surface, tint[1]) : undefined;
  }
  if (role === "tx") return { 500: c[400], 600: c[400], 700: c[300], 800: c[200], 900: c[100], 950: c[50] }[shade];
  const edge = { 50: [c[500], 0.15], 100: [c[500], 0.22], 200: [c[500], 0.35], 300: [c[400], 0.5] }[shade];
  return edge ? mix(edge[0], DARK.surface, edge[1]) : undefined;
}

const varName = (role, family, shade) => `--c-${role}-${family}${shade ? `-${shade}` : ""}`;
const ref = (role, family, shade, light) => `rgb(var(${varName(role, family, shade)}, ${channels(light)}) / <alpha-value>)`;

/** Tailwind colour map for one role. */
export function palette(role) {
  const out = { transparent: "transparent", current: "currentColor", inherit: "inherit", black: colors.black };
  out.white = role === "tx" ? colors.white : ref(role, "white", "", colors.white);
  // reading the deprecated aliases of tailwindcss/colors logs warnings, so list the families instead of iterating
  for (const name of STATIC_FAMILIES) out[name] = colors[name];
  for (const name of FAMILIES) out[name] = Object.fromEntries(SHADES.map((s) => [s, ref(role, name, s, colors[name][s])]));
  return out;
}

/** CSS variables for `.dark`, and the reset that keeps an always-dark region (the sidebar) on its light-mode colours. */
export function darkVariables() {
  const dark = {};
  const reset = {};
  for (const role of ROLES) {
    const white = SLATE_DARK[role].white;
    if (role !== "tx" && white) {
      dark[varName(role, "white", "")] = channels(white);
      reset[varName(role, "white", "")] = "initial";
    }
    for (const family of FAMILIES) {
      for (const shade of SHADES) {
        const v = darkValue(role, family, shade);
        if (!v) continue;
        dark[varName(role, family, shade)] = channels(v);
        reset[varName(role, family, shade)] = "initial";
      }
    }
  }
  return { dark, reset };
}

/** Resolved colour (hex) of a utility in a theme, for contrast checks: `resolve("tx", "slate", "500", true)`. */
export function resolve(role, family, shade, dark) {
  const light = family === "white" ? colors.white : colors[family][shade];
  if (!dark) return light;
  if (family === "white") return role === "tx" ? colors.white : SLATE_DARK[role].white;
  return darkValue(role, family, shade) ?? light;
}
