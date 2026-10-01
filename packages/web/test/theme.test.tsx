// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { I18nProvider } from "../src/i18n";
import { CANVAS, contrast, edgeColor, inkOn, nodeFill } from "../src/lib/graphTheme";
import { ThemeProvider, THEME_STORAGE, resolveTheme } from "../src/lib/theme";
// @ts-expect-error plain JS module shared with tailwind.config.js
import { resolve } from "../theme-palette.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Role = "bg" | "tx" | "bd";
const color = (role: Role, cls: string, dark: boolean): string => {
  const [family, shade] = cls.split("-");
  return resolve(role, family, shade ?? "", dark);
};

describe("theme preference", () => {
  it("follows the system unless light or dark is chosen", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("the pre-paint script in index.html uses the same storage key", () => {
    const html = readFileSync(resolvePath(__dirname, "../index.html"), "utf8");
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE}")`);
  });
});

describe("ThemeToggle", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  it("applies the choice to the page and remembers it per browser", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const r = (root = createRoot(host));
    await act(async () =>
      r.render(
        <ThemeProvider>
          <I18nProvider>
            <ThemeToggle />
          </I18nProvider>
        </ThemeProvider>,
      ),
    );
    const pick = (id: string) => act(async () => host!.querySelector<HTMLButtonElement>(`[data-testid="theme-${id}"]`)!.click());
    expect(host.querySelector('[data-testid="theme-system"]')!.getAttribute("aria-checked")).toBe("true");
    await pick("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE)).toBe("dark");
    await pick("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE)).toBe("light");
    await pick("system");
    expect(localStorage.getItem(THEME_STORAGE)).toBeNull();
  });
});

// Text / surface pairs the screens actually use. WCAG AA: 4.5 for body text, 3 for large or secondary UI text.
const TEXT_PAIRS: [string, string, number][] = [
  ["slate-900", "white", 4.5],
  ["slate-800", "white", 4.5],
  ["slate-700", "white", 4.5],
  ["slate-600", "white", 4.5],
  ["slate-500", "white", 4.5],
  ["slate-500", "slate-50", 4.5],
  ["slate-700", "slate-100", 4.5],
  ["blue-700", "white", 4.5],
  ["blue-600", "white", 4.5],
  ["blue-700", "blue-50", 4.5],
  ["emerald-700", "white", 4.5],
  ["emerald-700", "emerald-100", 4.5],
  ["rose-700", "rose-50", 4.5],
  ["amber-800", "amber-50", 4.5],
  ["amber-800", "amber-100", 4.5],
  ["amber-700", "amber-50", 4.5],
  ["violet-700", "violet-50", 4.5],
  ["indigo-700", "indigo-100", 4.5],
];

describe("contrast", () => {
  for (const dark of [false, true]) {
    const mode = dark ? "dark" : "light";
    it.each(TEXT_PAIRS)(`${mode}: text-%s on bg-%s`, (fg, bg, min) => {
      expect(contrast(color("tx", fg, dark), color("bg", bg, dark))).toBeGreaterThanOrEqual(min);
    });
  }

  it("dark: muted text (placeholders, decorations) stays above 3:1", () => {
    expect(contrast(color("tx", "slate-400", true), color("bg", "white", true))).toBeGreaterThanOrEqual(3);
    expect(contrast(color("tx", "slate-400", true), color("bg", "slate-50", true))).toBeGreaterThanOrEqual(3);
  });

  it("white text stays readable on the filled buttons in both themes", () => {
    for (const dark of [false, true]) {
      for (const bg of ["blue-600", "emerald-700", "slate-800", "rose-600"]) expect(contrast("#ffffff", color("bg", bg, dark))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("borders and raised surfaces stay visible on the dark page", () => {
    const surface = color("bg", "white", true);
    expect(contrast(color("bd", "slate-200", true), surface)).toBeGreaterThan(1.3);
    expect(contrast(color("bd", "slate-300", true), surface)).toBeGreaterThan(1.6);
    expect(contrast(color("bg", "slate-100", true), surface)).toBeGreaterThan(1.1);
    expect(contrast(color("bg", "slate-800", true), surface)).toBeGreaterThan(1.5);
  });

  const HCD_FILLS = ["#eff6ff", "#ecfdf5", "#fff1f2", "#fffbeb", "#f8fafc", "#fef3c7", "#f5f3ff"];
  const EDGES = ["#475569", "#2563eb", "#7c3aed", "#94a3b8"];

  // default fills per node class (HCD / FRG) and the swatches of the style panel
  const NODE_SWATCHES = ["#dbeafe", "#dcfce7", "#fee2e2", "#fef3c7", "#e9d5ff", "#fde68a", "#f1f5f9", "#ffffff", "#bae6fd", "#bbf7d0", "#fecaca", "#fed7aa"];

  it("graph node labels keep AA contrast on every default fill and swatch, in both themes", () => {
    for (const dark of [false, true]) {
      for (const f of [...HCD_FILLS, ...NODE_SWATCHES]) {
        const fill = nodeFill(f, dark);
        expect(contrast(inkOn(fill), fill)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("dark node fills stay distinguishable from the canvas and keep their hue", () => {
    for (const f of HCD_FILLS) expect(contrast(nodeFill(f, true), CANVAS.dark.bg)).toBeGreaterThan(1.15);
    expect(nodeFill("#eff6ff", true)).not.toBe(nodeFill("#fff1f2", true));
  });

  it("edges read against the canvas (3:1 for graphics) in both themes", () => {
    for (const e of EDGES) {
      expect(contrast(edgeColor(e, true), CANVAS.dark.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(edgeColor(e, true), nodeFill("#eff6ff", true))).toBeGreaterThanOrEqual(3);
    }
    for (const e of EDGES.slice(0, 3)) expect(contrast(edgeColor(e, false), CANVAS.light.bg)).toBeGreaterThanOrEqual(3);
  });

  it("light mode draws stored colours unchanged", () => {
    expect(nodeFill("#dbeafe", false)).toBe("#dbeafe");
    expect(edgeColor("#475569", false)).toBe("#475569");
  });
});
