(function () {
  "use strict";

  const config = window.FISH_FISHING_CONFIG;

  if (!config) {
    return;
  }

  const statisticsHours = config.statisticsHours ?? 24;
  const storageKeys = {
    hookLevel: "fish_calculator_hook_level",
    rodLevel: "fish_calculator_rod_level",
    baitBuff: "fish_calculator_bait_buff",
    systemBuff: "fish_calculator_system_buff",
    mapLevel: "fish_calculator_map_level",
  };

  const zeroProbabilityProfile = config.rarityOrder.reduce(
    (profile, rarity) => {
      profile[rarity] = 0;
      return profile;
    },
    {},
  );

  const elements = {
    hookLevel: document.getElementById("hookLevel"),
    rodLevel: document.getElementById("rodLevel"),
    baitBuff: document.getElementById("baitBuff"),
    systemBuff: document.getElementById("systemBuff"),
    mapCardList: document.getElementById("mapCardList"),
    selectedMapName: document.getElementById("selectedMapName"),
    selectedMapDelta: document.getElementById("selectedMapDelta"),
    selectedFishPrice: document.getElementById("selectedFishPrice"),
    selectedMapProbability: document.getElementById("selectedMapProbability"),
    selectedBestBait: document.getElementById("selectedBestBait"),
    selectedBestNet: document.getElementById("selectedBestNet"),
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

  function getStoredPercentValue(key, fallback = 0) {
    const storedValue = getStoredValue(key);
    if (storedValue === null || storedValue === "") {
      return fallback;
    }

    const parsedValue = Number.parseFloat(storedValue);
    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    if (parsedValue !== 0 && Math.abs(parsedValue) <= 1) {
      return parsedValue * 100;
    }

    return parsedValue;
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

  function getMapFishes(map) {
    return Array.isArray(map.fishes) ? map.fishes : [];
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

  function calculateExpectedFishPrice(profile, averageNPrice) {
    return config.rarityOrder.reduce((total, rarity) => {
      const probability = parseNumber(profile[rarity]) / 100;
      const multiplier = parseNumber(config.rarityMultipliers[rarity]);
      return total + probability * averageNPrice * multiplier;
    }, 0);
  }

  function calculateBaitRows(inputs, averageFishPrice) {
    return config.baitList.map((bait) => {
      const intervalHours = calculateIntervalHours(
        inputs.hookConfig.speed,
        bait.speed,
        inputs.baitBuff,
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
      .filter((map) => map.level <= rodLevel)
      .map((map) => {
        const fishes = getMapFishes(map);
        const averageNPrice = calculateAverageNPrice(fishes);
        const delta = rodLevel - map.level;
        const profile = getProbabilityProfile(delta);
        const expectedPrice = calculateExpectedFishPrice(
          profile,
          averageNPrice,
        );
        const baitRows = calculateBaitRows(inputs, expectedPrice);
        const bestBaitRow = [...baitRows].sort((left, right) => {
          if (right.netRevenue !== left.netRevenue) {
            return right.netRevenue - left.netRevenue;
          }
          return left.bait.id - right.bait.id;
        })[0];

        return {
          map,
          fishes,
          averageNPrice,
          delta,
          profile,
          expectedPrice,
          baitRows,
          bestBaitRow,
          expectedDailyRevenue: bestBaitRow ? bestBaitRow.grossRevenue : 0,
        };
      })
      .sort((left, right) => left.map.level - right.map.level);
  }

  function getInputs() {
    const hookLevelValue = Number.parseInt(elements.hookLevel.value, 10);
    const rodLevelValue = Number.parseInt(elements.rodLevel.value, 10);

    return {
      hookConfig: getHookConfig(hookLevelValue),
      rodConfig: getRodConfig(rodLevelValue),
      baitBuff: parseNumber(elements.baitBuff.value),
      systemBuff: parseNumber(elements.systemBuff.value),
    };
  }

  function renderSummary(selectedMapRow, bestBaitRow) {
    elements.selectedMapName.textContent = selectedMapRow
      ? ` Lv.${selectedMapRow.map.level} ${selectedMapRow.map.name}`
      : "-";
    elements.selectedMapDelta.textContent = selectedMapRow
      ? `鱼竿等级 - 地图等级 = ${selectedMapRow.delta}`
      : "-";
    elements.selectedFishPrice.textContent = selectedMapRow
      ? `¥${formatNumber(selectedMapRow.expectedPrice, 2)}`
      : "-";
    elements.selectedMapProbability.textContent = selectedMapRow
      ? `${config.rarityOrder
          .map(
            (rarity) =>
              `${rarity} ${formatNumber(
                parseNumber(selectedMapRow.profile[rarity]),
                2,
              )}%`,
          )
          .join(" / ")}`
      : "-";
    elements.selectedBestBait.textContent = bestBaitRow
      ? bestBaitRow.bait.name
      : "-";
    elements.selectedBestNet.textContent = bestBaitRow
      ? `24h 完成 ${formatNumber(bestBaitRow.completedCount, 0)} 次 / 净收益 ¥${formatNumber(
          bestBaitRow.netRevenue,
          2,
        )}`
      : "-";
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

    elements.mapCardList.innerHTML = mapRows
      .map((row) => {
        const isSelected = row.map.level === selectedMapLevel;
        return `
          <button type="button" class="map-card ${isSelected ? "selected" : ""}" data-map-level="${row.map.level}">
            <div class="map-card-compact">
              <div class="map-card-header">
                <div class="map-card-title">Lv.${row.map.level} ${row.map.name}</div>
                ${isSelected ? '<span class="badge">当前</span>' : ""}
              </div>
              <div class="map-card-price"> ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}</div>
              <div class="map-card-note map-card-best-bait">最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}</div>
            </div>
          </button>
        `;
      })
      .join("");
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

  function render() {
    const inputs = getInputs();
    const selectedRodLevel = Number.parseInt(elements.rodLevel.value, 10);
    const mapRows = calculateMapRows(inputs, selectedRodLevel);
    const storedMapLevel = Number.parseInt(
      getStoredValue(storageKeys.mapLevel) || "",
      10,
    );
    const selectedMapRow =
      mapRows.find((row) => row.map.level === storedMapLevel) ||
      mapRows[0] ||
      null;
    const activeMapLevel = selectedMapRow ? selectedMapRow.map.level : "";

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
    };

    renderSummary(selectedMapRow, bestBaitRow);
    renderMapCards(mapRows, activeMapLevel);
    renderTable(selectedMapRow ? selectedMapRow.baitRows : [], bestBaitRow);
  }

  function initialize() {
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

    const storedHookLevel = Number.parseInt(
      getStoredValue(storageKeys.hookLevel) || "",
      10,
    );
    const storedRodLevel = Number.parseInt(
      getStoredValue(storageKeys.rodLevel) || "",
      10,
    );
    const storedBaitBuff = getStoredPercentValue(storageKeys.baitBuff);
    const storedSystemBuff = getStoredPercentValue(storageKeys.systemBuff);

    const defaultHookLevel = config.hookLevels[0]?.level ?? 1;
    const defaultRodLevel = config.rodLevels[0]?.level ?? 1;

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
    elements.baitBuff.value = String(storedBaitBuff);
    elements.systemBuff.value = String(storedSystemBuff);

    [
      elements.hookLevel,
      elements.rodLevel,
      elements.baitBuff,
      elements.systemBuff,
    ].forEach((element) => {
      element.addEventListener("input", () => {
        setStoredValue(storageKeys.hookLevel, elements.hookLevel.value);
        setStoredValue(storageKeys.rodLevel, elements.rodLevel.value);
        setStoredValue(storageKeys.baitBuff, elements.baitBuff.value);
        setStoredValue(storageKeys.systemBuff, elements.systemBuff.value);
        render();
      });
      element.addEventListener("change", () => {
        setStoredValue(storageKeys.hookLevel, elements.hookLevel.value);
        setStoredValue(storageKeys.rodLevel, elements.rodLevel.value);
        setStoredValue(storageKeys.baitBuff, elements.baitBuff.value);
        setStoredValue(storageKeys.systemBuff, elements.systemBuff.value);
        render();
      });
    });

    if (elements.mapCardList) {
      elements.mapCardList.addEventListener("click", (event) => {
        const target = event.target.closest("[data-map-level]");
        if (!target) {
          return;
        }

        setStoredValue(storageKeys.mapLevel, target.dataset.mapLevel || "");
        render();
      });
    }

    setStoredValue(storageKeys.hookLevel, elements.hookLevel.value);
    setStoredValue(storageKeys.rodLevel, elements.rodLevel.value);
    setStoredValue(storageKeys.baitBuff, elements.baitBuff.value);
    setStoredValue(storageKeys.systemBuff, elements.systemBuff.value);

    render();
  }

  initialize();
})();
