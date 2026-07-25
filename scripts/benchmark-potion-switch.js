#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function parseArguments(arguments_) {
  const valueFor = (flag, fallback) => {
    const index = arguments_.indexOf(flag);
    return index >= 0 ? arguments_[index + 1] : fallback;
  };
  const slowdownIndex = arguments_.indexOf("--cpu-slowdown");
  const limitMs = Number(valueFor("--limit-ms", 50));
  const cpuSlowdown =
    slowdownIndex >= 0 ? Number(arguments_[slowdownIndex + 1]) : 4;
  const mapId = valueFor("--map-id", "11");
  const nestBuffFixture = valueFor(
    "--nest-buff-fixture",
    path.join("scripts", "fixtures", "nest-buff-lost-wind.json"),
  );
  const skipNestBuff = arguments_.includes("--skip-nest-buff");
  if (!Number.isFinite(limitMs) || limitMs <= 0) {
    throw new TypeError("--limit-ms must be a positive number");
  }
  if (!Number.isFinite(cpuSlowdown) || cpuSlowdown < 1) {
    throw new TypeError("--cpu-slowdown must be at least 1");
  }
  return { limitMs, cpuSlowdown, mapId, nestBuffFixture, skipNestBuff };
}

function createStaticServer(options = {}) {
  const nestBuffFixturePath = options.nestBuffFixturePath
    ? path.resolve(ROOT, options.nestBuffFixturePath)
    : null;
  let nestBuffFixtureData = null;
  if (nestBuffFixturePath) {
    nestBuffFixtureData = fs.readFileSync(nestBuffFixturePath);
  }
  return http.createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (
      nestBuffFixtureData &&
      (pathname === "/nest-buff-fixture.json" ||
        pathname.endsWith("/nest-buff.json"))
    ) {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(nestBuffFixtureData);
      return;
    }
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(data);
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function waitForDevToolsUrl(process) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Chromium DevTools endpoint timed out:\n${stderr}`));
    }, 10_000);
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before startup with code ${code}`));
    });
  });
}

async function waitForPage(debugPort, targetUrl) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    const page = targets.find(
      (target) => target.type === "page" && target.url.startsWith(targetUrl),
    );
    if (page?.webSocketDebuggerUrl) {
      return page.webSocketDebuggerUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chromium page target timed out");
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
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
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitForCondition(client, expression, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(expression)) return;
    } catch (error) {
      if (!String(error.message).includes("navigated or closed")) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label} timed out`);
}

async function main() {
  const { limitMs, cpuSlowdown, mapId, nestBuffFixture, skipNestBuff } =
    parseArguments(process.argv.slice(2));
  const nestBuffFixturePath = skipNestBuff ? null : nestBuffFixture;
  const server = createStaticServer({ nestBuffFixturePath });
  const port = await listen(server);
  const targetUrl = `http://127.0.0.1:${port}/index.html`;
  const fixtureUrl = `http://127.0.0.1:${port}/nest-buff-fixture.json`;
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fishing-profit-benchmark-"),
  );
  const chromiumBinaryCandidates = [
    process.env.CHROMIUM_BIN,
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ].filter(Boolean);
  let chromium;
  let lastSpawnError;
  for (const binary of chromiumBinaryCandidates) {
    try {
      chromium = spawn(binary, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDirectory}`,
        "about:blank",
      ]);
      break;
    } catch (error) {
      lastSpawnError = error;
    }
  }
  if (!chromium) {
    throw lastSpawnError || new Error("Unable to spawn Chromium");
  }
  let client;

  try {
    const browserUrl = await waitForDevToolsUrl(chromium);
    const debugPort = Number(new URL(browserUrl).port);
    const pageUrl = await waitForPage(debugPort, "about:blank");
    client = new CdpClient(pageUrl);
    await client.open();
    await client.call("Page.enable");
    await client.call("Runtime.enable");
    await client.call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.call("Emulation.setCPUThrottlingRate", {
      rate: cpuSlowdown,
    });
    await client.call("Page.navigate", { url: targetUrl });
    await waitForCondition(
      client,
      `location.href.startsWith(${JSON.stringify(targetUrl)}) && document.readyState === "complete"`,
      "calculator navigation",
    );
    await client.evaluate(`(() => {
      localStorage.setItem("fish_calculator_rod_level", "20");
      localStorage.setItem("fish_calculator_hook_level", "10");
      localStorage.setItem("fish_calculator_map_id", ${JSON.stringify(mapId)});
      localStorage.setItem(
        "fish_calculator_map_level",
        ${JSON.stringify(mapId === "11" ? "10" : "0")},
      );
      localStorage.setItem("fish_calculator_potion", "none");
      localStorage.setItem("fish_calculator_auto_nest_buff", "false");
      localStorage.setItem("fish_calculator_player_qq", "9000001");
      setTimeout(() => location.reload(), 0);
      return true;
    })()`);
    await waitForCondition(
      client,
      `Boolean(
        document.querySelector("#potion") &&
        String(window.FISH_BAIT_CALCULATOR_STATE?.selectedMapRow?.map?.id) ===
          ${JSON.stringify(mapId)}
      )`,
      "calculator readiness",
    );

    if (nestBuffFixturePath) {
      await client.evaluate(`(() => {
        const originalFetch = window.fetch.bind(window);
        const fixtureUrl = ${JSON.stringify(fixtureUrl)};
        window.fetch = (input, init) => {
          const url = String(input);
          if (url.includes("nest-buff") || url.includes("workers.dev")) {
            return originalFetch(fixtureUrl, init);
          }
          return originalFetch(input, init);
        };
        return true;
      })()`);
      await client.evaluate(`(async () => {
        const switchEl = document.querySelector("[data-auto-nest-buff-switch]");
        if (!switchEl) {
          throw new Error("auto nest buff switch not found");
        }
        if (!switchEl.checked) {
          switchEl.click();
        }
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const loading = document.querySelector(
            ".auto-nest-buff-switch.is-loading",
          );
          const hasLostWind = (window.FISH_BAIT_CALCULATOR_STATE?.mapRows || [])
            .some((row) => row?.weather?.type === "lost_wind");
          if (!loading && hasLostWind) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error("nest buff fixture weather did not apply");
      })()`);
    }

    const result = await client.evaluate(`(() => {
      const select = document.querySelector("#potion");
      const values = ["duoduo", "lucky_double", "gamma_ray_burst", "none"];
      const durations = [];
      let coldLuckyMs = null;
      const integerFormatter = new Intl.NumberFormat("zh-CN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      const scoreFormatter = new Intl.NumberFormat("zh-CN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
      let calculatorState = window.FISH_BAIT_CALCULATOR_STATE;
      let stateCommitCount = 0;
      Object.defineProperty(window, "FISH_BAIT_CALCULATOR_STATE", {
        configurable: true,
        enumerable: true,
        get: () => calculatorState,
        set: (nextState) => {
          calculatorState = nextState;
          stateCommitCount += 1;
        },
      });
      const dispatchSelection = (value) => {
        select.value = value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const assertSelection = (nextValue) => {
        const state = window.FISH_BAIT_CALCULATOR_STATE;
        if (
          state?.potion?.id !== nextValue ||
          localStorage.getItem("fish_calculator_potion") !== nextValue
        ) {
          throw new Error("potion state did not update to " + nextValue);
        }
        if (
          nextValue === "gamma_ray_burst" &&
          !state?.starryExpectation?.periods?.[0]?.modifiers?.gamma
        ) {
          throw new Error("flash potion did not enable the gamma modifier");
        }
        const expectedNet = "¥" + integerFormatter.format(state.bestRow.netRevenue);
        const bestBaitNet = document.querySelector("#bestBaitNet")?.textContent.trim();
        const selectedMapId = String(state.selectedMapRow.map.id);
        const selectedMapPrice = document
          .querySelector(
            '.map-card[data-map-id="' + selectedMapId + '"] [data-map-price]',
          )
          ?.textContent.trim();
        if (bestBaitNet !== expectedNet || selectedMapPrice !== expectedNet) {
          throw new Error("profit display did not update to " + expectedNet);
        }
        if (state.starryExpectation) {
          const expectedScore = scoreFormatter.format(
            state.starryExpectation.expectedScore.total,
          );
          const displayedScore = document
            .querySelector("#starryTotalScore")
            ?.textContent.trim();
          if (displayedScore !== expectedScore) {
            throw new Error("starry score display did not update to " + expectedScore);
          }
        }
      };
      // Reset to none so the first lucky switch exercises a cold pity-cache path.
      dispatchSelection("none");
      {
        const commitCountBeforeSelection = stateCommitCount;
        const startedAt = performance.now();
        dispatchSelection("lucky_double");
        coldLuckyMs = performance.now() - startedAt;
        durations.push(coldLuckyMs);
        if (stateCommitCount - commitCountBeforeSelection !== 1) {
          throw new Error("potion selection must render exactly once");
        }
        assertSelection("lucky_double");
      }
      for (let index = 0; index < 9; index += 1) {
        const nextValue = values[index % values.length];
        const commitCountBeforeSelection = stateCommitCount;
        const startedAt = performance.now();
        dispatchSelection(nextValue);
        durations.push(performance.now() - startedAt);
        if (stateCommitCount - commitCountBeforeSelection !== 1) {
          throw new Error("potion selection must render exactly once");
        }
        assertSelection(nextValue);
      }
      return { durations, coldLuckyMs };
    })()`);
    const measurements = result.durations;
    const sorted = measurements.slice().sort((left, right) => left - right);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p75Ms = sorted[Math.ceil(sorted.length * 0.75) - 1];
    const maxObservedMs = Math.max(...measurements);
    const coldLuckyMs = result.coldLuckyMs;
    // Scale with CPU throttling; unthrottled budget stays near one frame budget.
    const coldLuckyLimitMs = Math.max(limitMs, 50) * cpuSlowdown;
    const report = {
      measurements,
      medianMs,
      p75Ms,
      maxObservedMs,
      coldLuckyMs,
      p75LimitMs: limitMs,
      coldLuckyLimitMs,
      cpuSlowdown,
      mapId,
      nestBuffFixture: nestBuffFixturePath,
      eventSequence: ["input", "change"],
    };
    process.stdout.write(
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (p75Ms > limitMs || coldLuckyMs > coldLuckyLimitMs) {
      process.exitCode = 1;
    }
  } finally {
    client?.close();
    chromium.kill("SIGTERM");
    server.close();
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
