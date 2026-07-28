(function (root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === "object") {
    root.FISH_VERSION_MONITOR = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const defaultActivityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "wheel",
    "touchstart",
  ];

  function normalizeVersionLabel(value) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/^v/i, "");
    return /^\d+(?:\.\d+)*$/.test(normalized) ? normalized : "";
  }

  function compareVersionLabels(left, right) {
    const normalizedLeft = normalizeVersionLabel(left);
    const normalizedRight = normalizeVersionLabel(right);

    if (!normalizedLeft || !normalizedRight) {
      return normalizedLeft.localeCompare(normalizedRight, "en");
    }

    const leftParts = normalizedLeft.split(".").map(Number);
    const rightParts = normalizedRight.split(".").map(Number);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxLength; index += 1) {
      const leftPart = leftParts[index] || 0;
      const rightPart = rightParts[index] || 0;
      if (leftPart !== rightPart) {
        return leftPart - rightPart;
      }
    }

    return 0;
  }

  function addCacheBuster(url, value) {
    const rawUrl = String(url || "");
    const hashIndex = rawUrl.indexOf("#");
    const path =
      hashIndex === -1 ? rawUrl : rawUrl.slice(0, Math.max(0, hashIndex));
    const hash = hashIndex === -1 ? "" : rawUrl.slice(hashIndex);
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}_version_check=${encodeURIComponent(value)}${hash}`;
  }

  function getNonNegativeNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function getPositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function createVersionMonitor(options = {}) {
    const currentVersion = normalizeVersionLabel(options.currentVersion);
    const manifestUrl = String(options.manifestUrl || "./version.json");
    const intervalMs = getPositiveNumber(options.intervalMs, 10 * 60 * 1000);
    const idleThresholdMs = getNonNegativeNumber(
      options.idleThresholdMs,
      5 * 60 * 1000,
    );
    const now = typeof options.now === "function" ? options.now : Date.now;
    const fetchImpl =
      typeof options.fetchImpl === "function"
        ? options.fetchImpl
        : typeof root.fetch === "function"
          ? root.fetch.bind(root)
          : null;
    const reload =
      typeof options.reload === "function"
        ? options.reload
        : typeof root.location?.reload === "function"
          ? root.location.reload.bind(root.location)
          : () => {};
    const onUpdateAvailable =
      typeof options.onUpdateAvailable === "function"
        ? options.onUpdateAvailable
        : () => {};
    const onError =
      typeof options.onError === "function" ? options.onError : () => {};
    const eventTarget = options.eventTarget || root;
    const activityEvents = Array.isArray(options.activityEvents)
      ? options.activityEvents
      : defaultActivityEvents;
    const setIntervalImpl =
      typeof options.setIntervalImpl === "function"
        ? options.setIntervalImpl
        : root.setInterval.bind(root);
    const clearIntervalImpl =
      typeof options.clearIntervalImpl === "function"
        ? options.clearIntervalImpl
        : root.clearInterval.bind(root);

    let intervalId = null;
    let isRunning = false;
    let updateDetected = false;
    let pendingCheck = null;
    let lastActivityAt = now();

    function recordActivity() {
      lastActivityAt = now();
    }

    function bindActivityEvents() {
      if (typeof eventTarget?.addEventListener !== "function") {
        return;
      }
      activityEvents.forEach((eventName) => {
        eventTarget.addEventListener(eventName, recordActivity, {
          capture: true,
          passive: true,
        });
      });
    }

    function unbindActivityEvents() {
      if (typeof eventTarget?.removeEventListener !== "function") {
        return;
      }
      activityEvents.forEach((eventName) => {
        eventTarget.removeEventListener(eventName, recordActivity, {
          capture: true,
        });
      });
    }

    function stop() {
      if (intervalId !== null) {
        clearIntervalImpl(intervalId);
        intervalId = null;
      }
      if (isRunning) {
        unbindActivityEvents();
      }
      isRunning = false;
    }

    async function runVersionCheck() {
      if (updateDetected) {
        return { status: "update-detected" };
      }
      if (!currentVersion) {
        const error = new Error("当前版本号无效");
        onError(error);
        return { status: "error", error };
      }
      if (!fetchImpl) {
        const error = new Error("当前环境不支持版本检查");
        onError(error);
        return { status: "error", error };
      }

      try {
        const checkedAt = now();
        const response = await fetchImpl(
          addCacheBuster(manifestUrl, checkedAt),
          {
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response?.ok) {
          throw new Error(`版本文件请求失败（HTTP ${response?.status || 0}）`);
        }

        const payload = await response.json();
        const latestVersion = normalizeVersionLabel(payload?.version);
        if (!latestVersion) {
          throw new Error("版本文件缺少有效版本号");
        }

        if (compareVersionLabels(latestVersion, currentVersion) <= 0) {
          return {
            status: "current",
            currentVersion,
            latestVersion,
          };
        }

        updateDetected = true;
        const detectedAt = now();
        const idleForMs = Math.max(0, detectedAt - lastActivityAt);
        stop();

        if (idleForMs >= idleThresholdMs) {
          reload();
          return {
            status: "reloading",
            currentVersion,
            latestVersion,
            idleForMs,
          };
        }

        onUpdateAvailable({
          currentVersion,
          latestVersion,
          idleForMs,
        });
        return {
          status: "update-available",
          currentVersion,
          latestVersion,
          idleForMs,
        };
      } catch (error) {
        onError(error);
        return { status: "error", error };
      }
    }

    function checkForUpdate() {
      if (pendingCheck) {
        return pendingCheck;
      }

      pendingCheck = runVersionCheck().finally(() => {
        pendingCheck = null;
      });
      return pendingCheck;
    }

    function start() {
      if (isRunning || updateDetected) {
        return;
      }

      isRunning = true;
      bindActivityEvents();
      intervalId = setIntervalImpl(checkForUpdate, intervalMs);
      if (options.checkImmediately !== false) {
        void checkForUpdate();
      }
    }

    return {
      checkForUpdate,
      getLastActivityAt: () => lastActivityAt,
      recordActivity,
      start,
      stop,
    };
  }

  return {
    addCacheBuster,
    compareVersionLabels,
    createVersionMonitor,
    normalizeVersionLabel,
  };
});
