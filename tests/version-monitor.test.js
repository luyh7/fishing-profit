"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  addCacheBuster,
  compareVersionLabels,
  createVersionMonitor,
  normalizeVersionLabel,
} = require("../version-monitor.js");

function createVersionResponse(version, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => ({ version }),
  };
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
  }

  removeEventListener(eventName, listener) {
    this.listeners.get(eventName)?.delete(listener);
  }

  dispatch(eventName) {
    this.listeners.get(eventName)?.forEach((listener) => listener());
  }
}

test("版本号按数字段比较并接受 v 前缀", () => {
  assert.equal(normalizeVersionLabel(" v1.2.129 "), "1.2.129");
  assert.equal(normalizeVersionLabel("1.2.beta"), "");
  assert.ok(compareVersionLabels("1.10.0", "1.9.99") > 0);
  assert.equal(compareVersionLabels("v1.2.0", "1.2"), 0);
  assert.ok(compareVersionLabels("1.2.128", "1.2.129") < 0);
});

test("版本文件请求附加缓存戳且保留查询参数和锚点", () => {
  assert.equal(
    addCacheBuster("./version.json?channel=stable#latest", 123),
    "./version.json?channel=stable&_version_check=123#latest",
  );
});

test("检测到新版本且已空闲 5 分钟时自动刷新", async () => {
  let now = 0;
  let reloadCount = 0;
  let noticeCount = 0;
  const monitor = createVersionMonitor({
    currentVersion: "v1.2.128",
    idleThresholdMs: 5 * 60 * 1000,
    now: () => now,
    fetchImpl: async () => createVersionResponse("1.2.129"),
    reload: () => {
      reloadCount += 1;
    },
    onUpdateAvailable: () => {
      noticeCount += 1;
    },
  });

  now = 5 * 60 * 1000;
  const result = await monitor.checkForUpdate();

  assert.equal(result.status, "reloading");
  assert.equal(result.latestVersion, "1.2.129");
  assert.equal(reloadCount, 1);
  assert.equal(noticeCount, 0);
});

test("检测到新版本且最近有操作时固定提示刷新", async () => {
  let now = 0;
  let reloadCount = 0;
  let updateDetails = null;
  const monitor = createVersionMonitor({
    currentVersion: "1.2.128",
    idleThresholdMs: 5 * 60 * 1000,
    now: () => now,
    fetchImpl: async () => createVersionResponse("v1.2.129"),
    reload: () => {
      reloadCount += 1;
    },
    onUpdateAvailable: (details) => {
      updateDetails = details;
    },
  });

  now = 4 * 60 * 1000;
  monitor.recordActivity();
  now = 6 * 60 * 1000;
  const result = await monitor.checkForUpdate();

  assert.equal(result.status, "update-available");
  assert.equal(reloadCount, 0);
  assert.deepEqual(updateDetails, {
    currentVersion: "1.2.128",
    latestVersion: "1.2.129",
    idleForMs: 2 * 60 * 1000,
  });
});

test("启动后按 10 分钟轮询并监听鼠标键盘活动", async () => {
  const eventTarget = new FakeEventTarget();
  let now = 10;
  let intervalCallback = null;
  let intervalDelay = null;
  let clearedIntervalId = null;
  let requestedUrl = "";
  let requestedOptions = null;
  const monitor = createVersionMonitor({
    currentVersion: "1.2.128",
    checkImmediately: false,
    eventTarget,
    now: () => now,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return createVersionResponse("1.2.128");
    },
    setIntervalImpl: (callback, delay) => {
      intervalCallback = callback;
      intervalDelay = delay;
      return 42;
    },
    clearIntervalImpl: (intervalId) => {
      clearedIntervalId = intervalId;
    },
  });

  monitor.start();
  assert.equal(intervalDelay, 10 * 60 * 1000);
  assert.equal(typeof intervalCallback, "function");

  now = 250;
  eventTarget.dispatch("mousemove");
  assert.equal(monitor.getLastActivityAt(), 250);

  await intervalCallback();
  assert.match(requestedUrl, /^\.\/version\.json\?_version_check=250$/);
  assert.equal(requestedOptions.cache, "no-store");
  assert.equal(requestedOptions.headers.Accept, "application/json");

  monitor.stop();
  assert.equal(clearedIntervalId, 42);
  now = 500;
  eventTarget.dispatch("keydown");
  assert.equal(monitor.getLastActivityAt(), 250);
});

test("请求失败后保留下一次轮询机会", async () => {
  let requestCount = 0;
  let errorCount = 0;
  const monitor = createVersionMonitor({
    currentVersion: "1.2.128",
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw new Error("network unavailable");
      }
      return createVersionResponse("1.2.128");
    },
    onError: () => {
      errorCount += 1;
    },
  });

  assert.equal((await monitor.checkForUpdate()).status, "error");
  assert.equal((await monitor.checkForUpdate()).status, "current");
  assert.equal(requestCount, 2);
  assert.equal(errorCount, 1);
});

test("公开版本文件与页面当前版本一致", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const config = global.window.FISH_FISHING_CONFIG;
  if (previousWindow === undefined) {
    delete global.window;
  } else {
    global.window = previousWindow;
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "version.json"), "utf8"),
  );

  assert.equal(
    manifest.version,
    `${config.versionPrefix}.${config.gitCommitCount}`,
  );
  assert.equal(config.versionManifestUrl, "./version.json");
  assert.equal(config.versionCheckIntervalMs, 10 * 60 * 1000);
  assert.equal(config.versionIdleReloadMs, 5 * 60 * 1000);
});
