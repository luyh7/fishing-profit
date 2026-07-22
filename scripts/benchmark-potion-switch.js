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
  if (!Number.isFinite(limitMs) || limitMs <= 0) {
    throw new TypeError("--limit-ms must be a positive number");
  }
  if (!Number.isFinite(cpuSlowdown) || cpuSlowdown < 1) {
    throw new TypeError("--cpu-slowdown must be at least 1");
  }
  return { limitMs, cpuSlowdown, mapId };
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
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
  const { limitMs, cpuSlowdown, mapId } =
    parseArguments(process.argv.slice(2));
  const server = createStaticServer();
  const port = await listen(server);
  const targetUrl = `http://127.0.0.1:${port}/index.html`;
  const profileDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fishing-profit-benchmark-"),
  );
  const chromium = spawn(process.env.CHROMIUM_BIN || "chromium", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    targetUrl,
  ]);
  let client;

  try {
    const browserUrl = await waitForDevToolsUrl(chromium);
    const debugPort = Number(new URL(browserUrl).port);
    const pageUrl = await waitForPage(debugPort, targetUrl);
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
      `location.href === ${JSON.stringify(targetUrl)} && document.readyState === "complete"`,
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
      localStorage.setItem("fish_calculator_potion", "lucky_double");
      setTimeout(() => location.reload(), 0);
      return true;
    })()`);
    await waitForCondition(
      client,
      `Boolean(
        document.querySelector("#potion") &&
        String(window.FISH_BAIT_CALCULATOR_STATE?.selectedMapRow?.map?.id) ===
          ${JSON.stringify(mapId)} &&
        window.FISH_BAIT_CALCULATOR_STATE?.potion?.id === "lucky_double"
      )`,
      "calculator readiness",
    );

    const result = await client.evaluate(`(() => {
      const select = document.querySelector("#potion");
      const values = ["duoduo", "lucky_double", "gamma_ray_burst"];
      const durations = [];
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
      dispatchSelection(values[0]);
      dispatchSelection(values[1]);
      for (let index = 0; index < 10; index += 1) {
        const nextValue = values[index % values.length];
        const commitCountBeforeSelection = stateCommitCount;
        const startedAt = performance.now();
        dispatchSelection(nextValue);
        durations.push(performance.now() - startedAt);
        if (stateCommitCount - commitCountBeforeSelection !== 1) {
          throw new Error("potion selection must render exactly once");
        }
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
      }
      return durations;
    })()`);
    const measurements = result;
    const sorted = measurements.slice().sort((left, right) => left - right);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p75Ms = sorted[Math.ceil(sorted.length * 0.75) - 1];
    const maxObservedMs = Math.max(...measurements);
    const report = {
      measurements,
      medianMs,
      p75Ms,
      maxObservedMs,
      p75LimitMs: limitMs,
      cpuSlowdown,
      mapId,
      eventSequence: ["input", "change"],
    };
    process.stdout.write(
      `${JSON.stringify(report, null, 2)}\n`,
    );
    if (p75Ms > limitMs) {
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
