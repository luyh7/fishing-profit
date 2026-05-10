(function () {
  "use strict";

  const config = window.FISH_FISHING_CONFIG;

  if (!config) {
    return;
  }

  const statisticsHours = config.statisticsHours ?? 24;
  const systemBuffs = Array.isArray(config.systemBuffs)
    ? config.systemBuffs
    : [];
  const nestBuffSourceUrl = config.nestBuffSourceUrl || "./nest-buff.json";
  const nestBuffRefreshCooldownMs = 1 * 60 * 1000;
  const storageKeys = {
    hookLevel: "fish_calculator_hook_level",
    rodLevel: "fish_calculator_rod_level",
    systemBuff: "fish_calculator_system_buff",
    mapLevel: "fish_calculator_map_level",
    baitBuffByMap: "fish_calculator_bait_buff_by_map",
  };

  const elements = {
    hookLevel: document.getElementById("hookLevel"),
    rodLevel: document.getElementById("rodLevel"),
    systemBuff: document.getElementById("systemBuff"),
    versionBadge: document.getElementById("versionBadge"),
    mapCardList: document.getElementById("mapCardList"),
    selectedMapName: document.getElementById("selectedMapName"),
    selectedMapDelta: document.getElementById("selectedMapDelta"),
    selectedFishPrice: document.getElementById("selectedFishPrice"),
    selectedMapProbability: document.getElementById("selectedMapProbability"),
    selectedBestBait: document.getElementById("selectedBestBait"),
    selectedBestNet: document.getElementById("selectedBestNet"),
    refreshNestBuffBtn: document.getElementById("refreshNestBuffBtn"),
    refreshNestBuffStatus: document.getElementById("refreshNestBuffStatus"),
    refreshNestBuffError: document.getElementById("refreshNestBuffError"),
    fishPriceTooltip: document.getElementById("fishPriceTooltip"),
    bestBaitName: document.getElementById("bestBaitName"),
    bestBaitNet: document.getElementById("bestBaitNet"),
    resultBody: document.getElementById("resultBody"),
    emptyState: document.getElementById("emptyState"),
  };

  function parseNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value, digits = 2) {
    return Number.isFinite(value)
      ? value.toLocaleString("zh-CN", {
          minimumFractionDigits: 0,
          maximumFractionDigits: digits,
        })
      : "-";
  }

  function formatPercent(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return `${formatNumber(value * 100, digits)}%`;
  }

  function formatMinutes(value) {
    if (!Number.isFinite(value)) return "-";
    return `${formatNumber(value * 60, 1)} 分钟`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}`;
  }

  function buildOption(selectElement, items, getValue, getLabel) {
    selectElement.innerHTML = items
      .map(
        (item) =>
          `<option value="${getValue(item)}">${getLabel(item)}</option>`,
      )
      .join("");
  }

  function getStoredValue(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function setStoredValue(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function loadBaitBuffMap() {
    const raw = getStoredValue(storageKeys.baitBuffByMap);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  let baitBuffByMap = loadBaitBuffMap();
  let isRefreshingNestBuff = false;
  let nestBuffStatusIntervalId = null;
  let nestBuffStatusTimeoutId = null;
  let nestBuffLastRefreshAt = 0;
  let nestBuffLastUpdateAt = "";

  function getNestBuffLastRefreshAt() {
    return nestBuffLastRefreshAt;
  }

  function setNestBuffLastRefreshAt(timestamp) {
    nestBuffLastRefreshAt = Number.isFinite(timestamp) ? timestamp : 0;
  }

  function setNestBuffLastUpdateAt(value) {
    nestBuffLastUpdateAt = value ?? "";
  }

  function getNestBuffLastUpdateAt() {
    return nestBuffLastUpdateAt;
  }

  function clearNestBuffStatus() {
    if (!elements.refreshNestBuffStatus) {
      return;
    }

    elements.refreshNestBuffStatus.hidden = true;
    elements.refreshNestBuffStatus.textContent = "";
    elements.refreshNestBuffStatus.className = "refresh-nest-buff-status";
  }

  function clearNestBuffError() {
    if (!elements.refreshNestBuffError) {
      return;
    }

    elements.refreshNestBuffError.hidden = true;
    elements.refreshNestBuffError.textContent = "";
    elements.refreshNestBuffError.className = "refresh-nest-buff-status error";
  }

  function clearNestBuffStatusTimers() {
    if (nestBuffStatusIntervalId !== null) {
      window.clearInterval(nestBuffStatusIntervalId);
      nestBuffStatusIntervalId = null;
    }

    if (nestBuffStatusTimeoutId !== null) {
      window.clearTimeout(nestBuffStatusTimeoutId);
      nestBuffStatusTimeoutId = null;
    }
  }

  function showNestBuffStatus(message, kind = "error") {
    if (!elements.refreshNestBuffStatus) {
      return;
    }

    elements.refreshNestBuffStatus.hidden = false;
    elements.refreshNestBuffStatus.textContent = message;
    elements.refreshNestBuffStatus.className = `refresh-nest-buff-status ${kind}`;
  }

  function showNestBuffError(message) {
    if (!elements.refreshNestBuffError) {
      return;
    }

    elements.refreshNestBuffError.hidden = false;
    elements.refreshNestBuffError.textContent = message;
    elements.refreshNestBuffError.className = "refresh-nest-buff-status error";
  }

  function formatCountdown(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function showNestBuffCooldownStatus() {
    clearNestBuffStatusTimers();
    clearNestBuffError();

    const update = () => {
      const remainingMs = getNestBuffCooldownRemainingMs();
      if (remainingMs <= 0) {
        clearNestBuffStatusTimers();
        clearNestBuffError();
        return false;
      }

      showNestBuffError(
        `获取过于频繁，请 ${formatCountdown(remainingMs)} 后再试。`,
      );
      return true;
    };

    if (!update()) {
      return;
    }

    nestBuffStatusIntervalId = window.setInterval(update, 1000);
  }

  function showNestBuffSuccessStatus() {
    clearNestBuffStatusTimers();
    clearNestBuffError();
    const updateAt = getNestBuffLastUpdateAt() || getNestBuffLastRefreshAt();
    showNestBuffStatus(`数据更新于 ${formatDateTime(updateAt)}`, "success");
  }

  function getNestBuffCooldownRemainingMs() {
    const lastRefreshAt = getNestBuffLastRefreshAt();
    if (!Number.isFinite(lastRefreshAt) || lastRefreshAt <= 0) {
      return 0;
    }

    const elapsed = Date.now() - lastRefreshAt;
    return Math.max(0, nestBuffRefreshCooldownMs - elapsed);
  }

  function getBaitBuffForMap(mapLevel) {
    return parseNumber(baitBuffByMap[String(mapLevel)]);
  }

  function setBaitBuffForMap(mapLevel, rawValue) {
    const key = String(mapLevel);
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      delete baitBuffByMap[key];
    } else {
      baitBuffByMap[key] = rawValue;
    }
    setStoredValue(storageKeys.baitBuffByMap, JSON.stringify(baitBuffByMap));
  }

  function setNestBuffRefreshButtonState(isLoading) {
    if (!elements.refreshNestBuffBtn) {
      return;
    }

    elements.refreshNestBuffBtn.disabled = isLoading;
    elements.refreshNestBuffBtn.textContent = isLoading
      ? "获取中..."
      : "获取实时打窝buff";
  }

  function applyNestBuffSnapshot(payload) {
    const nextBaitBuffByMap = {};
    const locations = Array.isArray(payload?.locations)
      ? payload.locations
      : [];

    locations.forEach((location) => {
      const mapLevel = Number.parseInt(location?.id, 10) - 1;
      if (!Number.isInteger(mapLevel) || mapLevel < 0) {
        return;
      }

      const nestValue = parseNumber(location?.buffs?.nest) * 5;
      if (nestValue > 0) {
        nextBaitBuffByMap[String(mapLevel)] = String(nestValue);
      }
    });

    baitBuffByMap = nextBaitBuffByMap;
    setStoredValue(storageKeys.baitBuffByMap, JSON.stringify(baitBuffByMap));
  }

  async function refreshNestBuffs() {
    if (isRefreshingNestBuff) {
      return;
    }

    isRefreshingNestBuff = true;
    setNestBuffRefreshButtonState(true);

    try {
      const response = await fetch(nestBuffSourceUrl, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      applyNestBuffSnapshot(payload);
      setNestBuffLastUpdateAt(payload?.updated_at);
      setNestBuffLastRefreshAt(Date.now());
      showNestBuffSuccessStatus();
      render({ skipMapCardRebuild: true });
    } catch (error) {
      console.error("获取实时打窝buff失败", error);
      showNestBuffError("获取实时打窝buff失败，请稍后重试。");
    } finally {
      isRefreshingNestBuff = false;
      setNestBuffRefreshButtonState(false);
    }
  }

  function getHookConfig(level) {
    return (
      config.hookLevels.find((item) => item.level === level) ||
      config.hookLevels[0]
    );
  }

  function getRodConfig(level) {
    return (
      config.rodLevels.find((item) => item.level === level) ||
      config.rodLevels[0]
    );
  }

  function getSystemBuffConfig(id) {
    return (
      systemBuffs.find((item) => item.id === id) ||
      systemBuffs[0] || { id: "none", name: "无", value: 0 }
    );
  }

  function getMapFishes(map) {
    return Array.isArray(map.fishes) ? map.fishes : [];
  }

  function getMapCode(map) {
    return parseNumber(map.id);
  }

  function calculateAverageNPrice(fishes) {
    if (!fishes.length) {
      return Number.NaN;
    }

    const total = fishes.reduce(
      (sum, fish) => sum + parseNumber(fish.nPrice),
      0,
    );

    return total / fishes.length;
  }

  function calculateIntervalHours(hookSpeed, baitSpeed, baitBuff, systemBuff) {
    const hookFactor = 1 + hookSpeed;
    const baitFactor = 1 + baitSpeed + baitBuff / 100;
    const systemFactor = 1 + systemBuff / 100;

    if (hookFactor <= 0 || baitFactor <= 0 || systemFactor <= 0) {
      return Number.NaN;
    }

    return config.baseIntervalHours / hookFactor / baitFactor / systemFactor;
  }

  function getProbabilityProfile(delta) {
    return config.probabilityByDelta[delta] || config.probabilityByDelta[1];
  }

  function isMapDataSelectable(fishes, profile) {
    const hasValidFishPrices =
      fishes.length > 0 && fishes.every((fish) => parseNumber(fish.nPrice) > 0);
    const hasValidProbability = config.rarityOrder.some(
      (rarity) => parseNumber(profile?.[rarity]) > 0,
    );

    return hasValidFishPrices && hasValidProbability;
  }

  function calculateExpectedFishPrice(profile, averageNPrice) {
    return config.rarityOrder.reduce((total, rarity) => {
      const probability = parseNumber(profile[rarity]) / 100;
      const multiplier = parseNumber(config.rarityMultipliers[rarity]);
      return total + probability * averageNPrice * multiplier;
    }, 0);
  }

  function calculateBaitRows(inputs, averageFishPrice, baitBuff) {
    return config.baitList.map((bait) => {
      const intervalHours = calculateIntervalHours(
        inputs.hookConfig.speed,
        bait.speed,
        baitBuff,
        inputs.systemBuff,
      );
      const theoreticalCount = Number.isFinite(intervalHours)
        ? statisticsHours / intervalHours
        : Number.NaN;
      const completedCount = Number.isFinite(theoreticalCount)
        ? Math.floor(theoreticalCount)
        : 0;
      const grossRevenue = completedCount * averageFishPrice;
      const baitCost = completedCount * bait.price;
      const netRevenue = grossRevenue - baitCost;

      return {
        bait,
        intervalHours,
        theoreticalCount,
        completedCount,
        grossRevenue,
        baitCost,
        netRevenue,
      };
    });
  }

  function calculateMapRows(inputs, rodLevel) {
    return config.maps
      .filter((map) => map.difficulty <= rodLevel)
      .map((map) => {
        const fishes = getMapFishes(map);
        const averageNPrice = calculateAverageNPrice(fishes);
        const delta = rodLevel - map.difficulty;
        const profile = getProbabilityProfile(delta);
        const isSelectable = isMapDataSelectable(fishes, profile);
        const expectedPrice = isSelectable
          ? calculateExpectedFishPrice(profile, averageNPrice)
          : Number.NaN;
        const baitBuff = getBaitBuffForMap(map.difficulty);
        const baitRows = isSelectable
          ? calculateBaitRows(inputs, expectedPrice, baitBuff)
          : [];
        const bestBaitRow = baitRows.length
          ? [...baitRows].sort((left, right) => {
              if (right.netRevenue !== left.netRevenue) {
                return right.netRevenue - left.netRevenue;
              }
              return left.bait.id - right.bait.id;
            })[0]
          : null;

        return {
          map,
          fishes,
          averageNPrice,
          delta,
          profile,
          expectedPrice,
          baitBuff,
          baitRows,
          bestBaitRow,
          isSelectable,
          unavailableReason: isSelectable ? "" : "暂无数据，请等待作者更新",
          expectedDailyRevenue: bestBaitRow ? bestBaitRow.grossRevenue : 0,
        };
      })
      .sort((left, right) => left.map.difficulty - right.map.difficulty);
  }

  function getInputs() {
    const hookLevelValue = Number.parseInt(elements.hookLevel.value, 10);
    const rodLevelValue = Number.parseInt(elements.rodLevel.value, 10);
    const systemBuffConfig = getSystemBuffConfig(elements.systemBuff.value);

    return {
      hookConfig: getHookConfig(hookLevelValue),
      rodConfig: getRodConfig(rodLevelValue),
      systemBuffConfig,
      systemBuff: parseNumber(systemBuffConfig.value),
    };
  }

  function renderFishPriceTooltip(selectedMapRow, visibleRarities) {
    const tooltip = elements.fishPriceTooltip;
    if (!tooltip) {
      return;
    }
    if (!selectedMapRow || !visibleRarities.length) {
      tooltip.hidden = true;
      tooltip.innerHTML = "";
      return;
    }

    const fishes = selectedMapRow.fishes || [];
    if (!fishes.length) {
      tooltip.hidden = true;
      tooltip.innerHTML = "";
      return;
    }

    const headerCells = visibleRarities
      .map(
        (rarity) =>
          `<th><span class="tooltip-rarity" data-rarity="${rarity}" style="--rarity-color: ${rarityColor(rarity)};">${rarity}</span></th>`,
      )
      .join("");

    const rows = fishes
      .map((fish) => {
        const cells = visibleRarities
          .map((rarity) => {
            const multiplier = parseNumber(config.rarityMultipliers[rarity]);
            const price = parseNumber(fish.nPrice) * multiplier;
            return `<td>¥${formatNumber(price, 0)}</td>`;
          })
          .join("");
        return `<tr><td>${fish.name}</td>${cells}</tr>`;
      })
      .join("");

    tooltip.hidden = false;
    tooltip.innerHTML = `
      <div class="tooltip-title">各稀有度单鱼价格</div>
      <table class="tooltip-table">
        <thead><tr><th>鱼种</th>${headerCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function rarityColor(rarity) {
    switch (rarity) {
      case "UR":
        return "#ff4d1a";
      case "SSR":
        return "#ffcc00";
      case "SR":
        return "#a44bff";
      case "R":
        return "#3b82f6";
      case "N":
      default:
        return "#9ca3af";
    }
  }

  function highlightPercentValues(text, className) {
    return String(text).replace(
      /(\d+(?:\.\d+)?)%/g,
      `<span class="${className}">$1%</span>`,
    );
  }

  function renderSummary(selectedMapRow, bestBaitRow, inputs) {
    elements.selectedMapName.textContent = selectedMapRow
      ? ` Lv.${selectedMapRow.map.difficulty} ${selectedMapRow.map.name}`
      : "-";
    elements.selectedMapDelta.className = selectedMapRow
      ? "small selected-map-delta"
      : "small";
    elements.selectedMapDelta.innerHTML = selectedMapRow
      ? `<span class="selected-map-delta-item"><span class="selected-map-delta-label">🎣渔力</span><span class="selected-map-delta-value">${selectedMapRow.delta}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🪝鱼钩</span><span class="selected-map-buff-value">${formatPercent(inputs?.hookConfig?.speed ?? 0, 2)}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">⚡${highlightPercentValues(inputs?.systemBuffConfig?.name ?? "", "selected-map-buff-value")}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🌽打窝</span><span class="selected-map-buff-value">${formatNumber(selectedMapRow.baitBuff, 2)}%</span></span>`
      : "-";
    elements.selectedFishPrice.textContent = selectedMapRow
      ? `¥${formatNumber(selectedMapRow.expectedPrice, 2)}`
      : "-";
    if (selectedMapRow) {
      const visibleRarities = config.rarityOrder
        .slice()
        .reverse()
        .filter((rarity) => parseNumber(selectedMapRow.profile[rarity]) > 0);

      const chips = visibleRarities
        .map(
          (rarity) =>
            `<span class="rarity-chip" data-rarity="${rarity}"><span style="color: ${rarityColor(
              rarity,
            )}; font-weight: 700;">${rarity}</span> <span style="color: var(--text); font-weight: 700; font-size: 1.05em;">${formatNumber(parseNumber(selectedMapRow.profile[rarity]), 2)}%</span></span>`,
        )
        .join("");
      elements.selectedMapProbability.className = "small rarity-chips";
      elements.selectedMapProbability.innerHTML = chips;

      renderFishPriceTooltip(selectedMapRow, visibleRarities);
    } else {
      elements.selectedMapProbability.className = "small";
      elements.selectedMapProbability.textContent = "-";
      renderFishPriceTooltip(null, []);
    }
    elements.selectedBestBait.textContent = bestBaitRow
      ? bestBaitRow.bait.name
      : "-";
    elements.selectedBestNet.className = bestBaitRow
      ? "small selected-best-net"
      : "small";
    elements.selectedBestNet.innerHTML = bestBaitRow
      ? `<span class="selected-best-net-item">⏱️24h 完成 <span class="selected-best-net-value">${formatNumber(bestBaitRow.completedCount, 0)}</span> 次</span><span class="selected-best-net-item">💰净收益 <span class="selected-best-net-value">¥${formatNumber(
          bestBaitRow.netRevenue,
          0,
        )}</span></span>`
      : "-";
  }

  function findBestMapLevel(mapRows) {
    let bestLevel = null;
    let bestNet = -Infinity;
    mapRows.forEach((row) => {
      if (!row.isSelectable) {
        return;
      }
      const net = row.bestBaitRow ? row.bestBaitRow.netRevenue : -Infinity;
      if (net > bestNet) {
        bestNet = net;
        bestLevel = row.map.difficulty;
      }
    });
    return bestLevel;
  }

  function renderMapCards(mapRows, selectedMapLevel) {
    if (!elements.mapCardList) {
      return;
    }

    if (!mapRows.length) {
      elements.mapCardList.innerHTML =
        '<div class="empty-state" style="padding:0;">暂无可选地图，请检查鱼竿等级配置。</div>';
      return;
    }

    const bestMapLevel = findBestMapLevel(mapRows);

    elements.mapCardList.innerHTML = mapRows
      .map((row) => {
        const isSelected = row.map.difficulty === selectedMapLevel;
        const isBest = row.isSelectable && row.map.difficulty === bestMapLevel;
        const isUnavailable = !row.isSelectable;
        const cardContent = isUnavailable
          ? `<div class="map-card-note map-card-unavailable" data-map-unavailable="${row.map.difficulty}">${row.unavailableReason}</div>`
          : `
              <div class="map-card-price" data-map-price="${row.map.difficulty}"> ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}</div>
              <div class="map-card-note map-card-best-bait" data-map-best-bait="${row.map.difficulty}">最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}</div>
              <label class="map-card-buff">
                <span>打窝 buff（%）</span>
                <div class="map-card-buff-stepper" data-bait-buff-stepper="${row.map.difficulty}">
                  <button type="button" class="stepper-btn" data-bait-buff-step="-5" data-bait-buff-map="${row.map.difficulty}" aria-label="减少">−</button>
                  <span class="stepper-value" data-bait-buff-value="${row.map.difficulty}">${formatNumber(row.baitBuff, 0)}</span>
                  <button type="button" class="stepper-btn" data-bait-buff-step="5" data-bait-buff-map="${row.map.difficulty}" aria-label="增加">+</button>
                </div>
              </label>`;
        return `
          <div class="map-card ${isSelected ? "selected" : ""} ${isBest ? "best" : ""} ${isUnavailable ? "unavailable" : ""}" data-map-level="${row.map.difficulty}" data-map-disabled="${isUnavailable}" role="button" tabindex="${isUnavailable ? "-1" : "0"}" aria-disabled="${isUnavailable ? "true" : "false"}">
            <div class="map-card-compact">
              <div class="map-card-header">
                <div class="map-card-title">
                  <span class="map-card-code">${formatNumber(getMapCode(row.map), 0)}</span>
                  <span>Lv.${row.map.difficulty} ${row.map.name}</span>
                </div>
                <div class="map-card-badges" data-map-badges="${row.map.difficulty}">
                  ${isBest ? '<span class="badge badge-best">最优</span>' : ""}
                </div>
              </div>
              ${cardContent}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function updateMapCardValues(mapRows) {
    if (!elements.mapCardList) {
      return;
    }
    const bestMapLevel = findBestMapLevel(mapRows);
    mapRows.forEach((row) => {
      const cardEl = elements.mapCardList.querySelector(
        `.map-card[data-map-level="${row.map.difficulty}"]`,
      );
      const isUnavailable = !row.isSelectable;
      if (cardEl) {
        cardEl.classList.toggle("unavailable", isUnavailable);
        cardEl.setAttribute("aria-disabled", isUnavailable ? "true" : "false");
        cardEl.setAttribute("tabindex", isUnavailable ? "-1" : "0");
      }

      if (isUnavailable) {
        const unavailableEl = elements.mapCardList.querySelector(
          `[data-map-unavailable="${row.map.difficulty}"]`,
        );
        if (unavailableEl) {
          unavailableEl.textContent = row.unavailableReason;
        }
        const badgesEl = elements.mapCardList.querySelector(
          `[data-map-badges="${row.map.difficulty}"]`,
        );
        if (badgesEl) {
          badgesEl.innerHTML = "";
        }
        return;
      }

      const priceEl = elements.mapCardList.querySelector(
        `[data-map-price="${row.map.difficulty}"]`,
      );
      if (priceEl) {
        priceEl.textContent = ` ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}`;
      }
      const bestBaitEl = elements.mapCardList.querySelector(
        `[data-map-best-bait="${row.map.difficulty}"]`,
      );
      if (bestBaitEl) {
        bestBaitEl.textContent = `最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}`;
      }
      const buffValueEl = elements.mapCardList.querySelector(
        `[data-bait-buff-value="${row.map.difficulty}"]`,
      );
      if (buffValueEl) {
        buffValueEl.textContent = formatNumber(row.baitBuff, 0);
      }

      const badgesEl = elements.mapCardList.querySelector(
        `[data-map-badges="${row.map.difficulty}"]`,
      );
      const isBest = row.map.difficulty === bestMapLevel;
      if (cardEl) {
        cardEl.classList.toggle("best", isBest);
      }
      if (badgesEl) {
        badgesEl.innerHTML = `
          ${isBest ? '<span class="badge badge-best">最优</span>' : ""}
        `;
      }
    });
  }

  function renderTable(rows, bestRow) {
    elements.bestBaitName.textContent = bestRow ? bestRow.bait.name : "-";
    elements.bestBaitNet.textContent = bestRow
      ? `¥${formatNumber(bestRow.netRevenue, 2)}`
      : "-";

    if (!rows.length) {
      elements.emptyState.hidden = false;
      elements.resultBody.innerHTML = "";
      return;
    }

    elements.emptyState.hidden = true;
    elements.resultBody.innerHTML = rows
      .slice()
      .sort((left, right) => left.bait.id - right.bait.id)
      .map((row) => {
        const isBest = row === bestRow;
        const intervalText = Number.isFinite(row.intervalHours)
          ? formatMinutes(row.intervalHours)
          : "无法计算";
        const theoreticalCountText = Number.isFinite(row.theoreticalCount)
          ? formatNumber(row.theoreticalCount, 2)
          : "-";

        return `
          <tr class="${isBest ? "best-row" : ""}">
            <td>${row.bait.id}${isBest ? '<span class="badge">最优</span>' : ""}</td>
            <td>
              <div class="bait-name">${row.bait.name}</div>
              <div class="muted">ID ${row.bait.id}</div>
            </td>
            <td>${formatNumber(row.bait.price, 0)}</td>
            <td>${formatPercent(row.bait.speed, 2)}</td>
            <td>${intervalText}</td>
            <td>${theoreticalCountText}</td>
            <td>${formatNumber(row.completedCount, 0)}</td>
            <td>¥${formatNumber(row.grossRevenue, 0)}</td>
            <td>¥${formatNumber(row.baitCost, 2)}</td>
            <td class="net ${isBest ? "best-net" : ""}">¥${formatNumber(
              row.netRevenue,
              0,
            )}</td>
          </tr>
        `;
      })
      .join("");
  }

  function render(options = {}) {
    const inputs = getInputs();
    const selectedRodLevel = Number.parseInt(elements.rodLevel.value, 10);
    const mapRows = calculateMapRows(inputs, selectedRodLevel);
    const selectableMapRows = mapRows.filter((row) => row.isSelectable);
    const storedMapLevel = Number.parseInt(
      getStoredValue(storageKeys.mapLevel) || "",
      10,
    );
    const selectedMapRow =
      selectableMapRows.find((row) => row.map.difficulty === storedMapLevel) ||
      selectableMapRows[0] ||
      null;
    const activeMapLevel = selectedMapRow ? selectedMapRow.map.difficulty : "";

    if (selectedMapRow && storedMapLevel !== activeMapLevel) {
      setStoredValue(storageKeys.mapLevel, String(activeMapLevel));
    }

    const bestBaitRow = selectedMapRow
      ? [...selectedMapRow.baitRows].sort((left, right) => {
          if (right.netRevenue !== left.netRevenue) {
            return right.netRevenue - left.netRevenue;
          }
          return left.bait.id - right.bait.id;
        })[0] || null
      : null;

    window.FISH_BAIT_CALCULATOR_STATE = {
      completedCount: bestBaitRow ? bestBaitRow.completedCount : 0,
      intervalHours: bestBaitRow ? bestBaitRow.intervalHours : Number.NaN,
      bestRow: bestBaitRow,
      rows: selectedMapRow ? selectedMapRow.baitRows : [],
      selectedMapRow,
      mapRows,
      averageNPrice: selectedMapRow ? selectedMapRow.averageNPrice : Number.NaN,
      systemBuff: inputs.systemBuffConfig,
    };

    renderSummary(selectedMapRow, bestBaitRow, inputs);
    if (options.skipMapCardRebuild) {
      updateMapCardValues(mapRows);
    } else {
      renderMapCards(mapRows, activeMapLevel);
    }
    renderTable(selectedMapRow ? selectedMapRow.baitRows : [], bestBaitRow);
  }

  function initialize() {
    const versionPrefix = config.versionPrefix || "0.0";
    const gitCommitCount = Number.parseInt(config.gitCommitCount, 10);
    const versionSuffix = Number.isFinite(gitCommitCount) ? gitCommitCount : 0;
    const versionText = `v${versionPrefix}.${versionSuffix}`;

    if (elements.versionBadge) {
      elements.versionBadge.textContent = versionText;
    }
    document.title = `钓鱼收益计算器 ${versionText}`;

    buildOption(
      elements.hookLevel,
      config.hookLevels,
      (item) => item.level,
      (item) => `${item.name} / 加速 ${formatPercent(item.speed, 2)}`,
    );
    buildOption(
      elements.rodLevel,
      config.rodLevels,
      (item) => item.level,
      (item) => item.name,
    );
    buildOption(
      elements.systemBuff,
      systemBuffs,
      (item) => item.id,
      (item) => item.name,
    );

    const storedHookLevel = Number.parseInt(
      getStoredValue(storageKeys.hookLevel) || "",
      10,
    );
    const storedRodLevel = Number.parseInt(
      getStoredValue(storageKeys.rodLevel) || "",
      10,
    );
    const storedSystemBuffId = getStoredValue(storageKeys.systemBuff);

    const defaultHookLevel = config.hookLevels[0]?.level ?? 1;
    const defaultRodLevel = config.rodLevels[0]?.level ?? 1;
    const defaultSystemBuffId = systemBuffs[0]?.id ?? "none";

    elements.hookLevel.value = String(
      config.hookLevels.some((item) => item.level === storedHookLevel)
        ? storedHookLevel
        : defaultHookLevel,
    );
    elements.rodLevel.value = String(
      config.rodLevels.some((item) => item.level === storedRodLevel)
        ? storedRodLevel
        : defaultRodLevel,
    );
    elements.systemBuff.value = systemBuffs.some(
      (item) => item.id === storedSystemBuffId,
    )
      ? storedSystemBuffId
      : defaultSystemBuffId;

    const persist = () => {
      setStoredValue(storageKeys.hookLevel, elements.hookLevel.value);
      setStoredValue(storageKeys.rodLevel, elements.rodLevel.value);
      setStoredValue(storageKeys.systemBuff, elements.systemBuff.value);
    };

    [elements.hookLevel, elements.rodLevel, elements.systemBuff].forEach(
      (element) => {
        element.addEventListener("input", () => {
          persist();
          render();
        });
        element.addEventListener("change", () => {
          persist();
          render();
        });
      },
    );

    if (elements.mapCardList) {
      elements.mapCardList.addEventListener("click", (event) => {
        const stepButton = event.target.closest("[data-bait-buff-step]");
        if (stepButton) {
          event.stopPropagation();
          const stepCard = stepButton.closest(".map-card");
          if (stepCard?.dataset.mapDisabled === "true") {
            return;
          }
          const mapLevel = stepButton.dataset.baitBuffMap;
          const stepValue = parseNumber(stepButton.dataset.baitBuffStep);
          const current = getBaitBuffForMap(mapLevel);
          const next = Math.max(0, current + stepValue);
          setBaitBuffForMap(mapLevel, next === 0 ? "" : String(next));
          clearNestBuffStatus();
          render({ skipMapCardRebuild: true });
          return;
        }

        const target = event.target.closest("[data-map-level]");
        if (!target) {
          return;
        }

        if (target.dataset.mapDisabled === "true") {
          return;
        }

        setStoredValue(storageKeys.mapLevel, target.dataset.mapLevel || "");
        render();
      });

      elements.mapCardList.addEventListener("keydown", (event) => {
        if (event.target.closest("[data-bait-buff-step]")) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const target = event.target.closest("[data-map-level]");
        if (!target) {
          return;
        }
        if (target.dataset.mapDisabled === "true") {
          return;
        }
        event.preventDefault();
        setStoredValue(storageKeys.mapLevel, target.dataset.mapLevel || "");
        render();
      });
    }

    if (elements.refreshNestBuffBtn) {
      elements.refreshNestBuffBtn.addEventListener("click", () => {
        const cooldownRemainingMs = getNestBuffCooldownRemainingMs();
        if (cooldownRemainingMs > 0) {
          showNestBuffCooldownStatus();
          return;
        }

        clearNestBuffError();
        refreshNestBuffs();
      });
    }

    persist();
    setNestBuffRefreshButtonState(false);

    if (getNestBuffCooldownRemainingMs() > 0) {
      showNestBuffCooldownStatus();
    }

    render();
  }

  initialize();
})();
