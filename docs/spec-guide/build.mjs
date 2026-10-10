// 仕様書 PDF のビルド: src/*.html を 1 つの文書に組み、Chromium（Playwright）で A4 の PDF にする。
// 目次のページ番号は 2 回の描画で決める（1 回目の PDF から各見出しのページを pdftotext で探し、2 回目に書き込む）。
//   ./fetch-fonts.sh && node build.mjs            → ../CoBRAC_仕様書.pdf と build.json
//   node build.mjs --preview src/20_harness.html  → out/preview-20_harness.pdf（その 1 ファイルだけ。表紙・目次なし）
// 本文の <figure data-figure="<name>.svg"> には docs/figures の SVG を埋め込み、<!-- PROMPT-SOURCES --> には
// 付録 B（LLM に渡す指示ファイルの全文）を差し込む。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { CODE_INPUTS, PROMPT_SOURCES, buildRecordPath, figuresDir, here, inputHash, pdfPath, repoRoot, srcDir, srcFiles } from "./inputs.mjs";

// playwright は ESM の import では NODE_PATH を見ないので require で読む（グローバルにある版を使う）
const { chromium } = createRequire(import.meta.url)("playwright");

const TITLE = "CoBRAC Agents 仕様書";
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** docs/figures の SVG を本文に埋め込む。id は図ごとに接頭辞を付けて、図どうしで重ならないようにする */
let figureNo = 0;
function inlineFigures(html) {
  return html.replace(/<figure([^>]*?)\sdata-figure="([^"]+)"([^>]*)>/g, (_, pre, name, post) => {
    const svg = readFileSync(join(figuresDir, name), "utf8");
    const p = `f${++figureNo}-`;
    const body = svg
      .replace(/\bid="([^"]+)"/g, (_, id) => `id="${p}${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${p}${id})`)
      .replace(/aria-labelledby="([^"]+)"/g, (_, ids) => `aria-labelledby="${ids.split(/\s+/).map((i) => p + i).join(" ")}"`);
    const attrs = `${pre}${post}`.replace(/class="([^"]*)"/, (_, c) => `class="${c} doc-figure"`);
    return `<figure${attrs.includes("class=") ? attrs : `${attrs} class="doc-figure"`}>${body}`;
  });
}

/** 名前付きの設定オブジェクトから数値の定数だけを読む（読めなければ止める。古い値を黙って載せないため） */
function numericDefault(path, constant, key) {
  const block = new RegExp(`export const ${constant}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\}`).exec(readFileSync(join(repoRoot, path), "utf8"));
  const value = block && new RegExp(`\\b${key}:\\s*(\\d+)\\s*[,}]?`).exec(block[1]);
  if (!value) throw new Error(`${path} の ${constant}.${key} を読めません。build.mjs を直してください。`);
  return Number(value[1]);
}

/** 付録 B：差し込み値の表と、各指示ファイルの全文 */
function promptSources() {
  const [bra, research] = CODE_INPUTS;
  const quotes = numericDefault(bra, "DEFAULT_BRA_RULES", "minQuoteWords");
  const candidates = numericDefault(research, "RESEARCH_BUDGET", "maxCandidates");
  const queries = numericDefault(research, "RESEARCH_BUDGET", "minQueriesPerCandidate");
  const minutes = numericDefault(research, "RESEARCH_BUDGET", "timeBudgetMinutes");
  const values = `<table class="compact">
<thead><tr><th style="width:32%">差し込み値</th><th>実行時の値</th></tr></thead>
<tbody>
<tr><td><code>{P}</code></td><td>実際の Project ID。<code>&lt;ProjectID&gt;</code> など山括弧の表記は説明用の例で、自動置換の対象ではありません。</td></tr>
<tr><td><code>{MIN_QUOTE_WORDS}</code></td><td><code>${esc(bra)}</code> の <code>DEFAULT_BRA_RULES.minQuoteWords</code>（${quotes} 語）</td></tr>
<tr><td><code>{MAX_CANDIDATES}</code> / <code>{MIN_QUERIES}</code></td><td><code>${esc(research)}</code> の <code>RESEARCH_BUDGET</code>：候補は最大 ${candidates} 件、候補あたり最低 ${queries} 検索</td></tr>
<tr><td><code>{BUDGET_MINUTES}</code></td><td>調査の時間予算。標準 ${minutes} 分（環境変数 <code>RESEARCH_TIME_BUDGET_MIN</code> で変更可）</td></tr>
<tr><td><code>{SCOPES}</code> / <code>{MAX_SHARE}</code> / <code>{RESEARCH_MODE}</code></td><td><code>packages/worker/src/hypothesisRules.ts</code> がプロジェクトの許可範囲・仮説率の上限・調査モードの有無を埋める</td></tr>
<tr><td><code>{LANG}</code> / <code>{NAME}</code> / <code>{REV}</code> / <code>{BRA_MODEL}</code></td><td>解説記事ジョブで、記事の言語・プロジェクト名・データの版・BRA を作ったモデルを埋める</td></tr>
</tbody></table>`;
  const sections = PROMPT_SOURCES.map(([path, title], i) => {
    const text = readFileSync(join(repoRoot, path), "utf8");
    return `<h2 id="sb-${i + 2}">B.${i + 2} ${esc(title)}</h2>
<p class="src">原文：<code>${esc(path)}</code></p>
<pre class="source">${esc(text.replace(/\s+$/, ""))}</pre>`;
  });
  return [values, ...sections].join("\n");
}

function assemble(files) {
  return files
    .map((f) => readFileSync(join(srcDir, f), "utf8"))
    .join("\n")
    .replace("<!-- PROMPT-SOURCES -->", () => promptSources());
}

const css = readFileSync(join(srcDir, "style.css"), "utf8");
// Noto Sans JP は分割されていない TTF を使う（fetch-fonts.sh。Unicode の範囲で分かれた版では PDF が数倍になる）
const notoFaces = [
  [400, "NotoSansJP_400Regular.ttf"],
  [700, "NotoSansJP_700Bold.ttf"],
  [800, "NotoSansJP_800ExtraBold.ttf"],
]
  .map(([w, f]) => `@font-face{font-family:"Noto Sans JP";font-style:normal;font-weight:${w};src:url("../.fonts/noto-sans-jp-ttf/${f}") format("truetype");}`)
  .join("\n");
const page = (inner) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>${TITLE}</title>
<style>${notoFaces}</style>
<link rel="stylesheet" href="../.fonts/jetbrains-mono/400.css">
<link rel="stylesheet" href="../.fonts/jetbrains-mono/700.css">
<style>${css}</style></head><body>${inner}</body></html>`;

const footer = `<div style="width:100%;font-size:7.5pt;color:#64748b;font-family:'IPAGothic',sans-serif;padding:0 16mm;display:flex;justify-content:space-between">
<span>${TITLE}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

const browser = await chromium.launch();
async function render(html, file, withFooter) {
  const htmlFile = join(out, file.replace(/\.pdf$/, ".html"));
  writeFileSync(htmlFile, html);
  const p = await browser.newPage();
  await p.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({
    path: join(out, file),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: withFooter,
    headerTemplate: "<span></span>",
    footerTemplate: withFooter ? footer : "<span></span>",
    margin: withFooter ? { top: "16mm", bottom: "16mm", left: "17mm", right: "17mm" } : { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await p.close();
  return join(out, file);
}

const norm = (s) => s.replace(/\s+/g, "");
const pdfText = (pdf) => execFileSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { maxBuffer: 256 * 1024 * 1024 }).toString("utf8").split("\f").map(norm);
const pageCount = (pdf) => pdfText(pdf).filter((p, i, a) => i < a.length - 1 || p.length > 0).length;

const args = process.argv.slice(2);
if (args[0] === "--preview") {
  // 1 ファイルだけを描画して、レイアウトとページ数を確かめる（並行して書いている人どうしで出力が重ならない）
  for (const f of args.slice(1)) {
    const name = basename(resolve(f));
    const pdf = await render(page(inlineFigures(assemble([name]))), `preview-${name.replace(/\.html$/, "")}.pdf`, true);
    console.log(`${name}: ${pageCount(pdf)} ページ → ${pdf}`);
  }
  await browser.close();
  process.exit(0);
}

const parts = srcFiles().filter((f) => f.endsWith(".html"));
const cover = inlineFigures(assemble(parts.filter((f) => f.startsWith("00_"))));
const body = inlineFigures(assemble(parts.filter((f) => !f.startsWith("00_"))));

// 目次の項目: 部（h1.part）と節（h2）
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const toc = [...body.matchAll(/<h([12])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => {
  // 部の見出しには、直前の <div class="no">（「第 1 部」など）を目次の頭に付ける
  const no = m[1] === "1" ? body.slice(0, m.index).match(/<div class="no">([^<]+)<\/div>\s*$/) : null;
  return { level: Number(m[1]), id: m[2], text: strip(m[3]), label: no ? no[1] : "" };
});
const dup = toc.map((t) => t.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dup.length) throw new Error(`見出しの id が重複しています: ${[...new Set(dup)].join(", ")}`);

const tocHtml = (pages) => `<section class="toc"><h1 class="toc-title">目次</h1><ol>${toc
  .map((t) => `<li class="l${t.level}"><a href="#${t.id}"><span class="t">${t.label ? `<span class="pl">${t.label}</span>` : ""}${esc(t.text)}</span><span class="dots"></span><span class="p">${pages.get(t.id) ?? ""}</span></a></li>`)
  .join("")}</ol></section>`;

/** 各見出しが最初に現れるページ（1 始まり）。start ページ（0 始まり）より前は見ない。見出しの順にしか進まない */
function findPages(pdf, start = 0) {
  const pages = pdfText(pdf);
  const found = new Map();
  let from = start;
  for (const t of toc) {
    const key = norm(t.text);
    let i = from;
    while (i < pages.length && !pages[i].includes(key)) i++;
    if (i >= pages.length) {
      console.warn(`見出しが見つからない: ${t.text}`);
      continue;
    }
    found.set(t.id, i + 1);
    from = i;
  }
  return found;
}

const coverPdf = await render(page(cover), "cover.pdf", false);
// 1) 本文だけを描画して見出しのページを数える 2) 目次だけのページ数を数える 3) 目次 + 本文を描画して確かめる
const bodyOnly = findPages(await render(page(body), "pass-body.pdf", true));
const tocPages = pageCount(await render(page(tocHtml(new Map(toc.map((t) => [t.id, 888])))), "pass-toc.pdf", true));
const pages = new Map([...bodyOnly].map(([id, n]) => [id, n + tocPages]));
const bodyPdf = await render(page(tocHtml(pages) + body), "body.pdf", true);
const check = findPages(bodyPdf, tocPages);
const wrong = toc.filter((t) => check.get(t.id) !== pages.get(t.id));
console.log(`目次 ${tocPages} ページ、見出し ${pages.size}/${toc.length}、ずれ ${wrong.length} 件${wrong.length ? ": " + wrong.map((t) => t.text).join(" / ") : ""}`);
await browser.close();
if (wrong.length || pages.size !== toc.length) throw new Error("目次のページ番号が本文と合いません。見出しの文言を確かめてください。");

execFileSync("python3", ["-I", "-c", `
import sys
from pypdf import PdfReader, PdfWriter
w = PdfWriter()
for f in sys.argv[1:3]:
    for p in PdfReader(f).pages: w.add_page(p)
w.add_metadata({"/Title": sys.argv[4], "/Subject": "CoBRAC Agents の仕様（回路の命名・BRA の作り方・プロジェクトと版・Canon・オーケストレーター・BRA-DB・システム・セキュリティと費用）", "/Creator": "docs/spec-guide/build.mjs"})
w.page_mode = "/UseOutlines"
w.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
with open(sys.argv[3], "wb") as f: w.write(f)
`, coverPdf, bodyPdf, pdfPath, TITLE]);

const record = { pdf: basename(pdfPath), inputs: inputHash(), pages: pageCount(pdfPath), bytes: statSync(pdfPath).size };
writeFileSync(buildRecordPath, JSON.stringify(record, null, 2) + "\n");
console.log(`→ ${pdfPath}（${record.pages} ページ、${(record.bytes / 1024 / 1024).toFixed(1)} MB）`);
