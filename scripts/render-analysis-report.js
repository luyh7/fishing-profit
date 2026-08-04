#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ANALYSIS_DIR = path.join(ROOT, "game-source", "analysis");
const DEFAULT_WIDTH = 1440;
const DEFAULT_SCALE = 1;
const MAX_SCREENSHOT_HEIGHT = 30_000;
const REPORT_CATEGORIES = new Map([
  ["游戏源码 Bug", { className: "source-bug", kicker: "源码问题" }],
  ["利润网 Bug", { className: "profit-bug", kicker: "收益问题" }],
  [
    "源码与利润网有差异但无法确定是否为 Bug",
    { className: "uncertain-difference", kicker: "待定差异" },
  ],
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function splitTableCells(line) {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);

  const cells = [];
  let cell = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isTableDelimiter(line) {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isSafeUrl(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("#") ||
    (!normalized.includes(":") && !normalized.startsWith("//"))
  );
}

function findClosingDelimiter(source, delimiter, start) {
  let index = start;
  while (index < source.length) {
    const closingIndex = source.indexOf(delimiter, index);
    if (closingIndex < 0) return -1;
    if (source[closingIndex - 1] !== "\\") return closingIndex;
    index = closingIndex + delimiter.length;
  }
  return -1;
}

function parseLinkTarget(target) {
  const match = target.trim().match(/^(\S+?)(?:\s+["']([^"']*)["'])?$/);
  if (!match) return null;
  return { url: match[1], title: match[2] || "" };
}

function renderInline(source) {
  let html = "";
  let index = 0;

  while (index < source.length) {
    if (source[index] === "\\" && index + 1 < source.length) {
      html += escapeHtml(source[index + 1]);
      index += 2;
      continue;
    }

    if (source[index] === "`") {
      const closingIndex = source.indexOf("`", index + 1);
      if (closingIndex >= 0) {
        html += `<code>${escapeHtml(source.slice(index + 1, closingIndex))}</code>`;
        index = closingIndex + 1;
        continue;
      }
    }

    const isImage = source.startsWith("![", index);
    const linkStart = isImage ? index + 1 : index;
    if (source[linkStart] === "[") {
      const labelEnd = source.indexOf("]", linkStart + 1);
      if (labelEnd >= 0 && source[labelEnd + 1] === "(") {
        const targetEnd = findClosingDelimiter(source, ")", labelEnd + 2);
        if (targetEnd >= 0) {
          const linkTarget = parseLinkTarget(
            source.slice(labelEnd + 2, targetEnd),
          );
          if (linkTarget && isSafeUrl(linkTarget.url)) {
            const label = renderInline(source.slice(linkStart + 1, labelEnd));
            const attributes = ` href="${escapeHtml(linkTarget.url)}"`;
            const title = linkTarget.title
              ? ` title="${escapeHtml(linkTarget.title)}"`
              : "";
            if (isImage) {
              html += `<img src="${escapeHtml(
                linkTarget.url,
              )}" alt="${escapeHtml(source.slice(linkStart + 1, labelEnd))}"${title} loading="lazy">`;
            } else {
              const external = /^(?:https?:|mailto:)/i.test(linkTarget.url);
              html += `<a${attributes}${title}${
                external ? ' target="_blank" rel="noreferrer"' : ""
              }>${label}</a>`;
            }
            index = targetEnd + 1;
            continue;
          }
        }
      }
    }

    const strongDelimiter = source.startsWith("**", index)
      ? "**"
      : source.startsWith("__", index)
        ? "__"
        : null;
    if (strongDelimiter) {
      const closingIndex = findClosingDelimiter(
        source,
        strongDelimiter,
        index + strongDelimiter.length,
      );
      if (closingIndex > index + strongDelimiter.length) {
        html += `<strong>${renderInline(
          source.slice(index + strongDelimiter.length, closingIndex),
        )}</strong>`;
        index = closingIndex + strongDelimiter.length;
        continue;
      }
    }

    if (source.startsWith("~~", index)) {
      const closingIndex = findClosingDelimiter(source, "~~", index + 2);
      if (closingIndex > index + 2) {
        html += `<del>${renderInline(source.slice(index + 2, closingIndex))}</del>`;
        index = closingIndex + 2;
        continue;
      }
    }

    const emphasisDelimiter = source[index] === "*" || source[index] === "_"
      ? source[index]
      : null;
    if (emphasisDelimiter) {
      const previous = source[index - 1] || "";
      const next = source[index + 1] || "";
      const canStart = next && !/\s/.test(next);
      const isWordUnderscore =
        emphasisDelimiter === "_" && /\w/.test(previous) && /\w/.test(next);
      if (canStart && !isWordUnderscore) {
        const closingIndex = findClosingDelimiter(
          source,
          emphasisDelimiter,
          index + 1,
        );
        if (closingIndex > index + 1 && !/\s/.test(source[closingIndex - 1])) {
          html += `<em>${renderInline(
            source.slice(index + 1, closingIndex),
          )}</em>`;
          index = closingIndex + 1;
          continue;
        }
      }
    }

    const plainStart = index;
    index += 1;
    while (index < source.length) {
      if (
        source[index] === "\\" ||
        source[index] === "`" ||
        source.startsWith("![", index) ||
        source[index] === "[" ||
        source.startsWith("**", index) ||
        source.startsWith("__", index) ||
        source.startsWith("~~", index) ||
        source[index] === "*" ||
        source[index] === "_"
      ) {
        break;
      }
      index += 1;
    }
    html += escapeHtml(source.slice(plainStart, index));
  }

  return html;
}

function isBlockStart(line, nextLine = "") {
  return (
    /^\s{0,3}(?:#{1,6})\s+/.test(line) ||
    /^\s{0,3}(?:```|~~~)/.test(line) ||
    /^\s{0,3}>/.test(line) ||
    /^\s{0,3}(?:[-+*]|\d+\.)\s+/.test(line) ||
    /^\s{0,3}(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line) ||
    (line.includes("|") && isTableDelimiter(nextLine))
  );
}

function getReportCategory(headingText) {
  return REPORT_CATEGORIES.get(
    headingText.replace(/[`*_]/g, "").trim(),
  );
}

function renderTable(lines, startIndex) {
  const header = splitTableCells(lines[startIndex]);
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
    rows.push(splitTableCells(lines[index]));
    index += 1;
  }

  const headerHtml = header
    .map((cell) => `<th scope="col">${renderInline(cell)}</th>`)
    .join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = header.map((_, cellIndex) => row[cellIndex] || "");
      return `<tr>${cells
        .map((cell) => `<td>${renderInline(cell)}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  return {
    html: `<div class="table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    nextIndex: index,
  };
}

function renderList(lines, startIndex, ordered) {
  const itemPattern = ordered
    ? /^\s{0,3}\d+\.\s+(.*)$/
    : /^\s{0,3}[-+*]\s+(.*)$/;
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index].match(itemPattern);
    if (!match) break;
    const itemLines = [match[1]];
    index += 1;
    while (index < lines.length) {
      if (lines[index].match(itemPattern)) break;
      if (!lines[index].trim()) {
        if (lines[index + 1]?.match(itemPattern)) {
          index += 1;
          break;
        }
        break;
      }
      if (/^\s{2,}/.test(lines[index])) {
        itemLines.push(lines[index].trim());
        index += 1;
        continue;
      }
      break;
    }
    items.push(itemLines);
  }

  const tag = ordered ? "ol" : "ul";
  const itemHtml = items
    .map((itemLines) => `<li>${renderBlocks(itemLines)}</li>`)
    .join("");
  return { html: `<${tag}>${itemHtml}</${tag}>`, nextIndex: index };
}

function renderBlocks(lines, options = {}) {
  const wrapCategories = options.wrapCategories === true;
  let html = "";
  let index = 0;
  let openCategory = null;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = lines[index].match(/^\s{0,3}(```+|~~~+)\s*(.*)$/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fenceMatch[2].trim().split(/\s+/)[0];
      const className = /^[A-Za-z0-9_-]+$/.test(language)
        ? ` class="language-${language}"`
        : "";
      html += `<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
      continue;
    }

    const headingMatch = lines[index].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      if (wrapCategories && level === 2) {
        const category = getReportCategory(headingText);
        if (openCategory) {
          html += "</section>";
          openCategory = null;
        }
        if (category) {
          const headingId = `report-category-${category.className}`;
          html += `<section class="report-section report-section-${category.className}" aria-labelledby="${headingId}">`;
          html += `<h2 id="${headingId}" class="report-category-title"><span class="category-kicker">${escapeHtml(category.kicker)}</span><span>${renderInline(headingText)}</span></h2>`;
          openCategory = category;
          index += 1;
          continue;
        }
      }
      html += `<h${level}>${renderInline(headingText)}</h${level}>`;
      index += 1;
      continue;
    }

    if (/^\s{0,3}(?:\*{3,}|-{3,}|_{3,})\s*$/.test(lines[index])) {
      html += "<hr>";
      index += 1;
      continue;
    }

    if (
      index + 1 < lines.length &&
      lines[index].includes("|") &&
      isTableDelimiter(lines[index + 1])
    ) {
      const table = renderTable(lines, index);
      html += table.html;
      index = table.nextIndex;
      continue;
    }

    if (/^\s{0,3}>/.test(lines[index])) {
      const quoteLines = [];
      while (index < lines.length) {
        if (!lines[index].trim()) {
          quoteLines.push("");
          index += 1;
          continue;
        }
        const quoteMatch = lines[index].match(/^\s{0,3}>\s?(.*)$/);
        if (!quoteMatch) break;
        quoteLines.push(quoteMatch[1]);
        index += 1;
      }
      html += `<blockquote>${renderBlocks(quoteLines)}</blockquote>`;
      continue;
    }

    const unorderedMatch = lines[index].match(/^\s{0,3}[-+*]\s+/);
    if (unorderedMatch) {
      const list = renderList(lines, index, false);
      html += list.html;
      index = list.nextIndex;
      continue;
    }

    const orderedMatch = lines[index].match(/^\s{0,3}\d+\.\s+/);
    if (orderedMatch) {
      const list = renderList(lines, index, true);
      html += list.html;
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [lines[index].trim()];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      if (isBlockStart(lines[index], lines[index + 1] || "")) break;
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    html += `<p>${renderInline(paragraphLines.join(" "))}</p>`;
  }

  if (openCategory) html += "</section>";
  return html;
}

function documentTitle(markdown, sourcePath) {
  const heading = markdown.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  if (heading) return heading[1].trim();
  return `Game source analysis - ${path.basename(sourcePath, path.extname(sourcePath))}`;
}

function reportStyles() {
  return `
    :root {
      color-scheme: light;
      font-family: "Inter", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
      background: #eef1f4;
      color: #17212b;
      line-height: 1.75;
      font-size: 16px;
    }
    * { box-sizing: border-box; }
    html { background: #eef1f4; }
    body { margin: 0; padding: 40px 20px 64px; }
    main {
      width: min(100%, 980px);
      margin: 0 auto;
      padding: 48px 64px 64px;
      background: #ffffff;
      border: 1px solid #d8dee5;
      box-shadow: 0 14px 36px rgba(24, 39, 56, 0.08);
    }
    h1, h2, h3, h4, h5, h6 {
      color: #102a43;
      line-height: 1.3;
      margin: 2em 0 0.7em;
      page-break-after: avoid;
    }
    h1 { margin-top: 0; font-size: 2rem; border-bottom: 3px solid #dce8f2; padding-bottom: 0.5em; }
    h2 { font-size: 1.55rem; padding-bottom: 0.3em; border-bottom: 1px solid #dce8f2; }
    h3 { font-size: 1.25rem; color: #145374; }
    h4 { font-size: 1.08rem; color: #334e68; }
    .report-section {
      --category-color: #52606d;
      --category-ink: #334e68;
      --category-border: #bcccdc;
      --category-wash: #f7f9fb;
      margin: 42px 0;
      padding: 0 26px 26px;
      border: 1px solid var(--category-border);
      border-left: 7px solid var(--category-color);
      background: var(--category-wash);
      border-radius: 8px;
      page-break-inside: auto;
    }
    .report-section-source-bug {
      --category-color: #c2410c;
      --category-ink: #9a3412;
      --category-border: #fdba74;
      --category-wash: #fff7ed;
    }
    .report-section-profit-bug {
      --category-color: #0f766e;
      --category-ink: #115e59;
      --category-border: #99d5cf;
      --category-wash: #effaf8;
    }
    .report-section-uncertain-difference {
      --category-color: #7c3aed;
      --category-ink: #6d28d9;
      --category-border: #d8b4fe;
      --category-wash: #faf5ff;
    }
    .report-category-title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 -26px 24px;
      padding: 18px 26px 16px;
      color: var(--category-ink);
      background: rgba(255, 255, 255, 0.78);
      border: 0;
      border-bottom: 1px solid var(--category-border);
    }
    .category-kicker {
      display: inline-flex;
      align-items: center;
      min-height: 25px;
      padding: 2px 9px;
      border: 1px solid var(--category-border);
      border-radius: 999px;
      background: #ffffff;
      color: var(--category-ink);
      font-size: 0.72rem;
      font-weight: 800;
      line-height: 1.4;
      white-space: nowrap;
    }
    .report-section h3 { color: var(--category-ink); }
    .report-section > h3:first-of-type { margin-top: 0.7em; }
    .report-section h4 { color: #334e68; }
    p { margin: 0.8em 0; }
    a { color: #0b6e99; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    a:hover { color: #084c61; }
    code {
      padding: 0.12em 0.35em;
      border-radius: 3px;
      background: #f0f4f7;
      color: #263238;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.9em;
    }
    pre {
      overflow-x: auto;
      margin: 1.2em 0;
      padding: 16px 18px;
      border-left: 4px solid #76a5af;
      background: #f5f7f9;
      line-height: 1.55;
      page-break-inside: avoid;
    }
    pre code { padding: 0; background: transparent; }
    blockquote {
      margin: 1.2em 0;
      padding: 0.15em 1.2em;
      border-left: 4px solid #9fb3c8;
      background: #f7f9fb;
      color: #486581;
    }
    ul, ol { padding-left: 1.7em; }
    li + li { margin-top: 0.45em; }
    li > p:first-child { margin-top: 0; }
    li > p:last-child { margin-bottom: 0; }
    hr { border: 0; border-top: 1px solid #d8dee5; margin: 2em 0; }
    .table-wrap { overflow-x: auto; margin: 1.3em 0; }
    table { width: 100%; border-collapse: collapse; min-width: 560px; font-size: 0.95em; }
    th, td { padding: 9px 12px; border: 1px solid #d8dee5; text-align: left; vertical-align: top; }
    th { background: #edf3f7; color: #102a43; font-weight: 700; }
    tr:nth-child(even) td { background: #fbfcfd; }
    img { max-width: 100%; height: auto; }
    @media (max-width: 760px) {
      body { padding: 0; }
      main { width: 100%; padding: 28px 22px 42px; border: 0; box-shadow: none; }
      :root { font-size: 15px; }
      h1 { font-size: 1.7rem; }
      h2 { font-size: 1.4rem; }
      .report-section { margin: 30px 0; padding: 0 18px 20px; border-left-width: 5px; }
      .report-category-title { margin-left: -18px; margin-right: -18px; padding: 16px 18px 14px; }
    }
    @media print {
      html, body { background: #ffffff; }
      body { padding: 0; }
      main { width: 100%; padding: 0; border: 0; box-shadow: none; }
      a { color: inherit; }
      .report-section { background: #ffffff; }
      .report-category-title { background: #ffffff; }
    }
  `;
}

function renderReportHtml(markdown, sourcePath) {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
  const title = documentTitle(normalizedMarkdown, sourcePath);
  const body = renderBlocks(normalizedMarkdown.split("\n"), {
    wrapCategories: true,
  });
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="generator" content="render-analysis-report.js">
    <title>${escapeHtml(title)}</title>
    <style>${reportStyles()}</style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>
`;
}

function parseArguments(arguments_) {
  const options = {
    inputs: [],
    all: false,
    noImage: false,
    width: DEFAULT_WIDTH,
    scale: DEFAULT_SCALE,
    browser: process.env.CHROMIUM_BIN || "",
    outputDir: "",
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--all") {
      options.all = true;
    } else if (argument === "--no-image") {
      options.noImage = true;
    } else if (argument === "--width" || argument === "--scale" || argument === "--browser" || argument === "--output-dir") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      options[argument.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.inputs.push(argument);
    }
  }

  if (options.help) return options;
  if (options.all && options.inputs.length > 0) {
    throw new Error("--all cannot be combined with input paths");
  }
  if (!options.all && options.inputs.length === 0) {
    throw new Error("Provide a Markdown report path or use --all");
  }

  options.width = Number(options.width);
  options.scale = Number(options.scale);
  if (!Number.isInteger(options.width) || options.width < 320) {
    throw new Error("--width must be an integer of at least 320");
  }
  if (!Number.isFinite(options.scale) || options.scale <= 0 || options.scale > 3) {
    throw new Error("--scale must be greater than 0 and no greater than 3");
  }
  return options;
}

function printUsage() {
  process.stdout.write(`Usage:
  node scripts/render-analysis-report.js <report.md>
  node scripts/render-analysis-report.js --all

Options:
  --all                 Render every Markdown report in game-source/analysis.
  --no-image            Only write HTML; skip Chromium and PNG generation.
  --output-dir <dir>    Write generated files to this directory.
  --width <pixels>      Screenshot viewport width (default: ${DEFAULT_WIDTH}).
  --scale <number>      Screenshot device scale factor (default: ${DEFAULT_SCALE}).
  --browser <path>      Chromium executable; defaults to CHROMIUM_BIN or PATH.
`);
}

function resolveInputPaths(options) {
  if (options.all) {
    return fs
      .readdirSync(ANALYSIS_DIR)
      .filter((fileName) => fileName.endsWith(".md"))
      .sort()
      .map((fileName) => path.join(ANALYSIS_DIR, fileName));
  }
  return options.inputs.map((input) =>
    path.isAbsolute(input) ? input : path.resolve(ROOT, input),
  );
}

function outputPathFor(inputPath, options) {
  const outputDirectory = options.outputDir
    ? path.resolve(ROOT, options.outputDir)
    : path.dirname(inputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  return {
    htmlPath: path.join(
      outputDirectory,
      `${path.basename(inputPath, path.extname(inputPath))}.html`,
    ),
    imagePath: path.join(
      outputDirectory,
      `${path.basename(inputPath, path.extname(inputPath))}.png`,
    ),
  };
}

function waitForDevToolsUrl(chromium) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Chromium DevTools endpoint timed out:\n${stderr}`));
    }, 10_000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    chromium.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) finish(null, match[1]);
    });
    chromium.once("error", (error) => finish(error));
    chromium.once("exit", (code) => {
      finish(new Error(`Chromium exited before startup with code ${code}`));
    });
  });
}

async function launchChromium(browserOverride) {
  const candidates = [
    browserOverride,
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ].filter(Boolean);
  const tried = [];

  for (const binary of [...new Set(candidates)]) {
    const profileDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "fishing-profit-report-"),
    );
    const chromium = spawn(binary, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    try {
      const browserUrl = await waitForDevToolsUrl(chromium);
      return { chromium, browserUrl, profileDirectory };
    } catch (error) {
      tried.push(`${binary}: ${error.message}`);
      chromium.kill("SIGTERM");
      fs.rmSync(profileDirectory, { recursive: true, force: true });
    }
  }

  throw new Error(`Unable to start Chromium. Tried:\n${tried.join("\n")}`);
}

async function waitForPage(debugPort) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );
      if (page) return page.webSocketDebuggerUrl;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chromium page target timed out: ${lastError?.message || "no page"}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    };
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
  }

  call(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  close() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("CDP client closed"));
    }
    this.pending.clear();
    this.socket.close();
  }
}

async function waitForCondition(client, expression, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label} timed out`);
}

async function captureReportImage(client, html, imagePath, options) {
  const frameTree = await client.call("Page.getFrameTree");
  await client.call("Page.setDocumentContent", {
    frameId: frameTree.frameTree.frame.id,
    html,
  });
  await waitForCondition(
    client,
    "document.readyState === 'complete' && Boolean(document.body)",
    "report rendering",
  );
  await client.evaluate("document.fonts?.ready || true");
  const contentSize = await client.evaluate(`(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, 1),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1),
  }))()`);
  if (contentSize.height > MAX_SCREENSHOT_HEIGHT) {
    throw new Error(
      `Report is ${contentSize.height}px tall; maximum single-image height is ${MAX_SCREENSHOT_HEIGHT}px`,
    );
  }

  const screenshot = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: contentSize.width,
      height: contentSize.height,
      scale: 1,
    },
  });
  fs.writeFileSync(imagePath, Buffer.from(screenshot.data, "base64"));
}

async function renderImages(reports, options) {
  const browser = await launchChromium(options.browser);
  let client;
  try {
    const debugPort = Number(new URL(browser.browserUrl).port);
    const pageUrl = await waitForPage(debugPort);
    client = new CdpClient(pageUrl);
    await client.open();
    await client.call("Page.enable");
    await client.call("Runtime.enable");
    await client.call("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: 900,
      deviceScaleFactor: options.scale,
      mobile: false,
    });

    for (const report of reports) {
      await captureReportImage(
        client,
        report.html,
        report.imagePath,
        options,
      );
      process.stdout.write(`PNG  ${path.relative(ROOT, report.imagePath)}\n`);
    }
  } finally {
    client?.close();
    browser.chromium.kill("SIGTERM");
    fs.rmSync(browser.profileDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const inputPaths = resolveInputPaths(options);
  if (inputPaths.length === 0) throw new Error("No Markdown reports found");
  const reports = inputPaths.map((inputPath) => {
    if (!fs.statSync(inputPath).isFile()) {
      throw new Error(`Input is not a file: ${inputPath}`);
    }
    if (path.extname(inputPath).toLowerCase() !== ".md") {
      throw new Error(`Input must be a Markdown file: ${inputPath}`);
    }
    const output = outputPathFor(inputPath, options);
    const markdown = fs.readFileSync(inputPath, "utf8");
    const html = renderReportHtml(markdown, inputPath);
    fs.writeFileSync(output.htmlPath, html, "utf8");
    process.stdout.write(`HTML ${path.relative(ROOT, output.htmlPath)}\n`);
    return { ...output, html };
  });

  if (!options.noImage) await renderImages(reports, options);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
