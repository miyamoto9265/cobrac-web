/**
 * Graph colours in dark mode. Node fills and edge colours are stored as light-theme hex values (defaults per class and
 * the user's own choices in the layout), so they are mapped when drawn: fills keep their hue but become dark tints,
 * lines are lifted until they read on the dark canvas. Stored values never change.
 */

type Hsl = [number, number, number];

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHsl([r, g, b]: [number, number, number]): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function toHex([h, s, l]: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance (0–1); unknown colours count as white. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Node / badge fill as drawn: light fills become dark tints of the same hue; already dark fills stay. */
export function nodeFill(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = toHsl(rgb);
  if (l < 0.4) return hex;
  return toHex([h, s * 0.55, Math.min(0.27, 0.19 + (1 - l) * 0.4)]);
}

/** Edge / arrow colour as drawn: dark lines are lifted so they stand out from the dark canvas. */
export function edgeColor(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = toHsl(rgb);
  return l >= 0.68 ? hex : toHex([h, s, 0.68]);
}

/** Text colour for a fill: dark ink on light fills, light ink on dark ones. */
export function inkOn(fill: string): string {
  return luminance(fill) > 0.3 ? "#0f172a" : "#e9eef5";
}

/** Canvas colours that are not part of the Tailwind palette. */
export const CANVAS = {
  light: { bg: "#f8fafc", dot: "#dbe3ee", snapDot: "#cbd5e1", nodeBorder: "rgba(15,23,42,0.18)", selected: "#1d4ed8", mask: "rgba(241,245,249,0.7)" },
  dark: { bg: "#0a0f19", dot: "#263042", snapDot: "#354155", nodeBorder: "rgba(226,232,240,0.18)", selected: "#60a5fa", mask: "rgba(10,15,25,0.7)" },
} as const;
