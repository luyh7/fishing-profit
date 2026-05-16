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
  const baseRarityOrder = config.rarityOrder.filter(
    (rarity) => rarity !== "UTR",
  );
  const collectionRarities = baseRarityOrder;
  const nestBuffSourceUrl = config.nestBuffSourceUrl || "./nest-buff.json";
  const nestBuffAutoRefreshIntervalMs = 1 * 60 * 1000;
  const collectionLongPressMs = 280;
  const storageKeys = {
    hookLevel: "fish_calculator_hook_level",
    rodLevel: "fish_calculator_rod_level",
    systemBuff: "fish_calculator_system_buff",
    mapLevel: "fish_calculator_map_level",
    baitBuffByMap: "fish_calculator_bait_buff_by_map",
    weatherOverrideByMap: "fish_calculator_weather_override_by_map",
    autoNestBuff: "fish_calculator_auto_nest_buff",
    fishCollection: "fish_calculator_fish_collection",
    playerQQ: "fish_calculator_player_qq",
    baitReminderEnabled: "fish_calculator_bait_reminder_enabled",
    baitReminderThreshold: "fish_calculator_bait_reminder_threshold",
    baitReminderLastShownAt: "fish_calculator_bait_reminder_last_shown_at",
  };

  const leaderboardTypes = [
    {
      key: "rod",
      label: "鱼竿等级榜",
      subtitle: "按鱼竿等级排序",
      metricLabel: "鱼竿等级",
      formatPrimaryValue: (entry) => `Lv.${formatNumber(entry.rodLevel, 0)}`,
      compare: (left, right) =>
        right.rodLevel - left.rodLevel ||
        right.hookLevel - left.hookLevel ||
        right.achievementCount - left.achievementCount ||
        left.userId.localeCompare(right.userId, "zh-CN", { numeric: true }),
    },
    {
      key: "hook",
      label: "鱼钩等级榜",
      subtitle: "按鱼钩等级排序",
      metricLabel: "鱼钩等级",
      formatPrimaryValue: (entry) => `Lv.${formatNumber(entry.hookLevel, 0)}`,
      compare: (left, right) =>
        right.hookLevel - left.hookLevel ||
        right.rodLevel - left.rodLevel ||
        right.achievementCount - left.achievementCount ||
        left.userId.localeCompare(right.userId, "zh-CN", { numeric: true }),
    },
    {
      key: "achievement",
      label: "成就榜",
      subtitle: "按成就数量排序",
      metricLabel: "成就数量",
      formatPrimaryValue: (entry) =>
        `${formatNumber(entry.achievementCount, 0)} 项`,
      compare: (left, right) =>
        right.achievementCount - left.achievementCount ||
        right.rodLevel - left.rodLevel ||
        right.hookLevel - left.hookLevel ||
        left.userId.localeCompare(right.userId, "zh-CN", { numeric: true }),
    },
  ];

  const elements = {
    hookLevel: document.getElementById("hookLevel"),
    rodLevel: document.getElementById("rodLevel"),
    hookLevelDisplay: document.getElementById("hookLevelDisplay"),
    rodLevelDisplay: document.getElementById("rodLevelDisplay"),
    systemBuff: document.getElementById("systemBuff"),
    playerQQ: document.getElementById("playerQQ"),
    playerQQNickname: document.getElementById("playerQQNickname"),
    playerQQError: document.getElementById("playerQQError"),
    playerLocationPanel: document.getElementById("playerLocationPanel"),
    playerLocationValue: document.getElementById("playerLocationValue"),
    playerBaitPanel: document.getElementById("playerBaitPanel"),
    playerBaitValue: document.getElementById("playerBaitValue"),
    baitReminderToggle: document.getElementById("baitReminderToggle"),
    baitReminderThreshold: document.getElementById("baitReminderThreshold"),
    baitReminderNotice: document.getElementById("baitReminderNotice"),
    baitReminderNoticeMessage: document.getElementById(
      "baitReminderNoticeMessage",
    ),
    baitReminderNoticeClose: document.getElementById("baitReminderNoticeClose"),
    openCollectionModal: document.getElementById("openCollectionModal"),
    openLeaderboardModal: document.getElementById("openLeaderboardModal"),
    collectionProgress: document.getElementById("collectionProgress"),
    collectionModal: document.getElementById("collectionModal"),
    collectionLegend: document.getElementById("collectionLegend"),
    collectionMapList: document.getElementById("collectionMapList"),
    leaderboardModal: document.getElementById("leaderboardModal"),
    leaderboardTypeList: document.getElementById("leaderboardTypeList"),
    leaderboardList: document.getElementById("leaderboardList"),
    leaderboardSummary: document.getElementById("leaderboardSummary"),
    leaderboardSummaryBadge: document.getElementById("leaderboardSummaryBadge"),
    leaderboardContentTitle: document.getElementById("leaderboardContentTitle"),
    leaderboardContentSubtitle: document.getElementById(
      "leaderboardContentSubtitle",
    ),
    versionBadge: document.getElementById("versionBadge"),
    mapCardList: document.getElementById("mapCardList"),
    selectedMapName: document.getElementById("selectedMapName"),
    selectedMapDelta: document.getElementById("selectedMapDelta"),
    selectedFishPrice: document.getElementById("selectedFishPrice"),
    selectedMapProbability: document.getElementById("selectedMapProbability"),
    selectedBestBait: document.getElementById("selectedBestBait"),
    selectedBestNet: document.getElementById("selectedBestNet"),
    autoNestBuffSwitch: document.getElementById("autoNestBuffSwitch"),
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  function formatDurationCountdown(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }

    const totalSeconds = Math.max(0, Math.floor(value / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (number) => String(number).padStart(2, "0");
    if (hours > 0) {
      return `${hours}时${pad(minutes)}分`;
    }

    return `${minutes}分${pad(seconds)}秒`;
  }

  function formatDurationElapsed(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }

    const totalSeconds = Math.max(0, Math.floor(value / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (number) => String(number).padStart(2, "0");
    if (hours > 0) {
      return `已持续 ${hours}时${pad(minutes)}分`;
    }

    return `已持续 ${minutes}分${pad(seconds)}秒`;
  }

  const weatherMetaByType = {
    sunny: {
      label: "晴天",
      emoji: "☀️",
      effectText: "",
      multiplier: 1,
      baitCostMultiplier: 1,
    },
    rain: {
      label: "雨天",
      emoji: "🌧️",
      effectText: "上鱼速度+10%",
      multiplier: 1.1,
      baitCostMultiplier: 1,
    },
    storm: {
      label: "暴雨",
      emoji: "⛈️",
      effectText: "鱼饵消耗-50%",
      multiplier: 1,
      baitCostMultiplier: 0.5,
    },
    meteor: {
      label: "流星",
      emoji: "☄️",
      effectText: "最高稀有度+2%",
      multiplier: 1,
      baitCostMultiplier: 1,
    },
    lost_wind: {
      label: "迷途风",
      emoji: "🌀",
      effectText: "有1%几率钓出UTR鱼",
      multiplier: 1,
      baitCostMultiplier: 1,
    },
  };

  const weatherCycleTypes = ["sunny", "rain", "storm", "meteor", "lost_wind"];

  function normalizeWeatherType(type) {
    return typeof type === "string" && type ? type : "sunny";
  }

  function parseWeatherTime(value) {
    if (Number.isFinite(value)) {
      return value;
    }

    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function getWeatherMeta(type) {
    const normalizedType = normalizeWeatherType(type);
    return (
      weatherMetaByType[normalizedType] || {
        label: normalizedType,
        emoji: "🌤️",
        effectText: "",
        multiplier: 1,
      }
    );
  }

  function isManualWeather(weather) {
    return Boolean(weather?.manual);
  }

  function isAutoNestBuffEffectivelyEnabled() {
    return isAutoNestBuffEnabled;
  }

  function isExpiredWeather(weather) {
    if (
      !weather ||
      isManualWeather(weather) ||
      !isAutoNestBuffEffectivelyEnabled()
    ) {
      return false;
    }

    if (normalizeWeatherType(weather.type) === "sunny") {
      return false;
    }

    const endTime = Date.parse(weather.end_time || "");
    return Number.isFinite(endTime) && Date.now() > endTime;
  }

  function isAchievementGatedLostWindWeather(weather) {
    return Boolean(
      weather?.gated &&
      weather?.gated_reason === "achievement" &&
      normalizeWeatherType(weather?.type) === "lost_wind",
    );
  }

  function isWeatherPending(weather) {
    if (
      !weather ||
      isManualWeather(weather) ||
      isAchievementGatedLostWindWeather(weather) ||
      !isAutoNestBuffEffectivelyEnabled()
    ) {
      return false;
    }

    const startTime = parseWeatherTime(weather.start_time);
    return (
      Number.isFinite(startTime) &&
      Date.now() < startTime &&
      normalizeWeatherType(weather.type) !== "sunny"
    );
  }

  function isWeatherEffectivelyInactive(weather) {
    return (
      weather?.is_active === false ||
      isExpiredWeather(weather) ||
      isWeatherPending(weather) ||
      isAchievementGatedLostWindWeather(weather)
    );
  }

  function formatWeatherElapsedText(startTime, now = Date.now()) {
    if (!Number.isFinite(startTime)) {
      return "-";
    }

    const elapsedMs = now - startTime;
    if (elapsedMs < 0) {
      return `即将开始于${formatDurationCountdown(-elapsedMs)}`;
    }

    return formatDurationElapsed(elapsedMs);
  }

  function buildManualWeather(type) {
    const normalizedType = normalizeWeatherType(type);
    return {
      type: normalizedType,
      is_active: true,
      start_time: null,
      end_time: null,
      manual: true,
    };
  }

  function buildGatedAchievementLostWindWeather(weather) {
    return {
      ...(weather || {}),
      type: normalizeWeatherType(weather?.type),
      is_active: false,
      gated: true,
      gated_reason: "achievement",
      original_type: normalizeWeatherType(weather?.type),
    };
  }

  function getWeatherForMap(mapLevel, mapId) {
    const key = String(mapLevel);
    const overrideType = weatherOverrideByMap[key];
    if (overrideType) {
      return buildManualWeather(overrideType);
    }

    const sourceKey =
      mapId !== null && mapId !== undefined ? String(mapId) : key;
    const weather = sourceWeatherByMap[sourceKey] || {
      type: "sunny",
      is_active: false,
      start_time: null,
      end_time: null,
    };

    if (shouldGateLostWindForMap(mapId, weather)) {
      return buildGatedAchievementLostWindWeather(weather);
    }

    return weather;
  }

  function getWeatherMultiplier(weather) {
    const type = normalizeWeatherType(weather?.type);
    const meta = getWeatherMeta(type);
    if (type === "rain" && !isWeatherEffectivelyInactive(weather)) {
      return meta.multiplier;
    }

    return 1;
  }

  function getWeatherBaitCostMultiplier(weather) {
    const type = normalizeWeatherType(weather?.type);
    const meta = getWeatherMeta(type);
    if (isWeatherEffectivelyInactive(weather)) {
      return 1;
    }

    return Number.isFinite(meta.baitCostMultiplier)
      ? meta.baitCostMultiplier
      : 1;
  }

  function adjustMeteorProbabilityProfile(profile) {
    const activeRarities = baseRarityOrder.filter(
      (rarity) => parseNumber(profile?.[rarity]) > 0,
    );

    if (activeRarities.length < 2) {
      return profile;
    }

    const highestRarity = activeRarities[0];
    const secondHighestRarity = activeRarities[1];
    const secondProbability = parseNumber(profile?.[secondHighestRarity]);
    const shift = Math.min(2, secondProbability);

    if (shift <= 0) {
      return profile;
    }

    const adjustedProfile = { ...profile };
    baseRarityOrder.forEach((rarity) => {
      adjustedProfile[rarity] = parseNumber(profile?.[rarity]);
    });
    adjustedProfile[highestRarity] += shift;
    adjustedProfile[secondHighestRarity] = Math.max(
      0,
      adjustedProfile[secondHighestRarity] - shift,
    );

    return adjustedProfile;
  }

  function getWeatherAdjustedProbabilityProfile(profile, weather) {
    const type = normalizeWeatherType(weather?.type);
    if (isWeatherEffectivelyInactive(weather)) {
      return profile;
    }

    if (type === "meteor") {
      return adjustMeteorProbabilityProfile(profile);
    }

    if (type !== "lost_wind") {
      return profile;
    }

    const baseProfile = {};
    const baseTotal = baseRarityOrder.reduce((total, rarity) => {
      const probability = parseNumber(profile?.[rarity]);
      baseProfile[rarity] = probability;
      return total + probability;
    }, 0);

    if (baseTotal <= 0) {
      return config.rarityOrder.reduce((adjustedProfile, rarity) => {
        adjustedProfile[rarity] = rarity === "UTR" ? 1 : 0;
        return adjustedProfile;
      }, {});
    }

    const scale = 99 / baseTotal;
    const adjustedProfile = {};
    baseRarityOrder.forEach((rarity) => {
      adjustedProfile[rarity] = baseProfile[rarity] * scale;
    });
    adjustedProfile.UTR = 1;

    return adjustedProfile;
  }

  function getWeatherTooltipContent(weather) {
    const type = normalizeWeatherType(weather?.type);
    const meta = getWeatherMeta(type);

    if (type === "sunny") {
      return "晴天";
    }

    const lines = [
      meta.effectText
        ? `<div class="tooltip-title" style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><span>${meta.emoji} ${meta.label}</span><span>${meta.effectText}</span></div>`
        : `<div class="tooltip-title">${meta.emoji} ${meta.label}</div>`,
    ];

    if (isAchievementGatedLostWindWeather(weather)) {
      lines.push(
        '<div class="weather-tooltip-warning weather-tooltip-warning--error" data-weather-gate-warning>成就未完成，不生效</div>',
      );
    }

    if (isManualWeather(weather)) {
      lines.push("<div>手动模式下不会结束</div>");
      return lines.join("");
    }

    if (!isAutoNestBuffEffectivelyEnabled()) {
      lines.push("<div>手动模式下不会结束</div>");
      return lines.join("");
    }

    const startTime = parseWeatherTime(weather?.start_time);
    const endTime = parseWeatherTime(weather?.end_time);
    const isPending = isWeatherPending(weather);
    const elapsedClassName = isPending ? ' class="is-pending"' : "";
    lines.push(
      `<div><span data-weather-elapsed data-weather-start-time="${Number.isFinite(startTime) ? startTime : ""}" data-weather-end-time="${Number.isFinite(endTime) ? endTime : ""}"${elapsedClassName}>${getWeatherElapsedText(weather)}</span></div>`,
    );
    const isExpired = isExpiredWeather(weather);
    lines.push(
      `<div class="weather-tooltip-countdown${isExpired ? " is-expired" : ""}" data-weather-countdown-line><span data-weather-countdown-label>${isExpired ? "结束于 " : "还剩余 "}</span><span data-weather-countdown data-weather-end-time="${Number.isFinite(endTime) ? endTime : ""}">${getWeatherCountdownText(weather)}</span></div>`,
    );

    return lines.join("");
  }

  function getWeatherCountdownText(weather) {
    const endTime = parseWeatherTime(weather?.end_time);
    if (!Number.isFinite(endTime)) {
      return "-";
    }

    if (isExpiredWeather(weather)) {
      return `${formatDurationCountdown(Date.now() - endTime)}前`;
    }

    return formatDurationCountdown(endTime - Date.now());
  }

  function getWeatherElapsedText(weather, now = Date.now()) {
    const endTime = parseWeatherTime(weather?.end_time);
    const effectiveNow =
      isExpiredWeather(weather) && Number.isFinite(endTime) ? endTime : now;
    return formatWeatherElapsedText(
      parseWeatherTime(weather?.start_time),
      effectiveNow,
    );
  }

  function updateWeatherTooltipCountdowns() {
    if (!elements.mapCardList) {
      return;
    }

    const now = Date.now();
    elements.mapCardList
      .querySelectorAll("[data-weather-countdown]")
      .forEach((countdownEl) => {
        const endTime = Number.parseInt(
          countdownEl.dataset.weatherEndTime || "",
          10,
        );
        if (!Number.isFinite(endTime)) {
          countdownEl.textContent = "-";
          return;
        }

        const remainingMs = endTime - now;
        const isExpired =
          isAutoNestBuffEffectivelyEnabled() && remainingMs <= 0;
        const countdownLine = countdownEl.closest(
          "[data-weather-countdown-line]",
        );
        const countdownLabel = countdownLine?.querySelector(
          "[data-weather-countdown-label]",
        );
        countdownEl.textContent = isExpired
          ? `${formatDurationCountdown(now - endTime)}前`
          : formatDurationCountdown(remainingMs);
        if (countdownLabel) {
          countdownLabel.textContent = isExpired ? "结束于 " : "还剩余 ";
        }
        countdownLine?.classList.toggle("is-expired", isExpired);

        countdownEl
          .closest(".map-card-weather")
          ?.classList.toggle("is-expired", isExpired);
      });

    elements.mapCardList
      .querySelectorAll("[data-weather-elapsed]")
      .forEach((elapsedEl) => {
        const startTime = Number.parseInt(
          elapsedEl.dataset.weatherStartTime || "",
          10,
        );
        const endTime = Number.parseInt(
          elapsedEl.dataset.weatherEndTime || "",
          10,
        );
        if (!Number.isFinite(startTime)) {
          elapsedEl.textContent = "-";
          return;
        }

        const elapsedMs = now - startTime;
        const isExpired =
          isAutoNestBuffEffectivelyEnabled() &&
          Number.isFinite(endTime) &&
          endTime <= now;
        const effectiveNow = isExpired ? endTime : now;
        const weatherCard = elapsedEl.closest(".map-card-weather");
        const isAchievementGated = weatherCard?.classList.contains(
          "is-gated-achievement",
        );
        const isPending = elapsedMs < 0 && !isAchievementGated;
        elapsedEl.textContent = formatWeatherElapsedText(
          startTime,
          effectiveNow,
        );
        elapsedEl.classList.toggle("is-pending", isPending);
        weatherCard?.classList.toggle("is-pending", isPending);
      });
  }

  function getWeatherCycleType(currentType, stepValue) {
    const normalizedType = normalizeWeatherType(currentType);
    const currentIndex = weatherCycleTypes.indexOf(normalizedType);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeIndex + stepValue + weatherCycleTypes.length) %
      weatherCycleTypes.length;
    return weatherCycleTypes[nextIndex];
  }

  function persistWeatherOverrides() {
    setStoredValue(
      storageKeys.weatherOverrideByMap,
      JSON.stringify(weatherOverrideByMap),
    );
  }

  function freezeAllCurrentWeatherAsManualOverrides() {
    const nextWeatherOverrides = {};

    config.maps.forEach((map) => {
      const mapLevel = String(map.difficulty);
      const currentWeather = getWeatherForMap(map.difficulty, map.id);
      nextWeatherOverrides[mapLevel] = normalizeWeatherType(
        currentWeather?.type,
      );
    });

    weatherOverrideByMap = nextWeatherOverrides;
    persistWeatherOverrides();
  }

  function setWeatherOverrideForMap(mapLevel, weatherType) {
    const key = String(mapLevel);
    if (!weatherType) {
      delete weatherOverrideByMap[key];
    } else {
      weatherOverrideByMap[key] = normalizeWeatherType(weatherType);
    }
    persistWeatherOverrides();
  }

  function clearWeatherOverrides() {
    weatherOverrideByMap = {};
    persistWeatherOverrides();
  }

  function getWeatherBadgeClass(weather) {
    const classes = ["map-card-weather"];
    if (isAchievementGatedLostWindWeather(weather)) {
      classes.push("is-gated-achievement");
    } else if (isWeatherPending(weather)) {
      classes.push("is-pending");
    }
    if (isExpiredWeather(weather)) {
      classes.push("is-expired");
    }

    return classes.join(" ");
  }

  function buildWeatherControlHtml(row) {
    const weather =
      row.weather || getWeatherForMap(row.map.difficulty, row.map.id);
    const tooltip = getWeatherTooltipContent(weather);
    return `
      <div class="${getWeatherBadgeClass(weather)} has-tooltip" data-map-weather="${row.map.difficulty}" data-map-id="${row.map.id}">
        <button type="button" class="weather-step-btn" data-weather-step="-1" data-weather-map="${row.map.difficulty}" data-weather-map-id="${row.map.id}" aria-label="切换到前一个天气">‹</button>
        <span class="weather-emoji" aria-hidden="true">${getWeatherMeta(weather.type).emoji}</span>
        <button type="button" class="weather-step-btn" data-weather-step="1" data-weather-map="${row.map.difficulty}" data-weather-map-id="${row.map.id}" aria-label="切换到下一个天气">›</button>
        <div class="tooltip" data-map-weather-tooltip="${row.map.difficulty}">${tooltip}</div>
      </div>
    `;
  }

  function buildMapCardBadgesHtml(row, isBest) {
    return buildWeatherControlHtml(row);
  }

  function buildMapCardCodeHtml(map) {
    const collectionCrown = hasPlayerAchievementForMap(map.id)
      ? `<span class="map-card-crown has-tooltip" aria-label="全收集"><svg class="map-card-crown-icon" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M3 17.5h18l-1.4-11.2-5.2 4.4L12 3.2 9.6 10.7 4.4 6.3 3 17.5Z"></path></svg><span class="tooltip">全收集</span></span>`
      : "";
    return `<span class="map-card-code">${formatNumber(getMapCode(map), 0)}${collectionCrown}</span>`;
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      return config.maps.reduce((normalized, map) => {
        const idKey = String(map.id);
        const value = parsed[idKey];
        if (value !== undefined && value !== null && value !== "") {
          normalized[idKey] = value;
        }
        return normalized;
      }, {});
    } catch (_error) {
      return {};
    }
  }

  function loadWeatherOverrideMap() {
    const raw = getStoredValue(storageKeys.weatherOverrideByMap);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function normalizeFishCollection(parsed) {
    const source =
      parsed?.items && typeof parsed.items === "object" ? parsed.items : parsed;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {};
    }

    return Object.entries(source).reduce((normalized, [fishKey, value]) => {
      const rarities = Array.isArray(value)
        ? value
        : value && typeof value === "object"
          ? Object.keys(value).filter((rarity) => value[rarity])
          : [];
      const rarityMap = rarities.reduce((map, rarity) => {
        if (collectionRarities.includes(rarity)) {
          map[rarity] = true;
        }
        return map;
      }, {});
      if (Object.keys(rarityMap).length > 0) {
        normalized[fishKey] = rarityMap;
      }
      return normalized;
    }, {});
  }

  function loadFishCollection() {
    const raw = getStoredValue(storageKeys.fishCollection);
    if (!raw) return {};
    try {
      return normalizeFishCollection(JSON.parse(raw));
    } catch (_error) {
      return {};
    }
  }

  function persistFishCollection() {
    setStoredValue(
      storageKeys.fishCollection,
      JSON.stringify({
        version: 1,
        items: fishCollection,
      }),
    );
  }

  let baitBuffByMap = loadBaitBuffMap();
  let fishCollection = loadFishCollection();
  let latestNestBuffPayload = null;
  let sourceWeatherByMap = {};
  let activePlayerData = null;
  let leaderboardActiveType = leaderboardTypes[0]?.key || "rod";
  let weatherOverrideByMap = loadWeatherOverrideMap();
  let isRefreshingNestBuff = false;
  let isAutoNestBuffEnabled =
    getStoredValue(storageKeys.autoNestBuff) === "true";
  let isApplyingAutoPlayerData = false;
  let autoNestBuffIntervalId = null;
  let autoNestBuffTimeoutId = null;
  let baitReminderIntervalId = null;
  let baitReminderWarmupTimeoutId = null;
  let baitReminderWarmupUntil = 0;
  let weatherTooltipRefreshIntervalId = null;
  let nestBuffStatusIntervalId = null;
  let nestBuffStatusTimeoutId = null;
  let nestBuffLastRefreshAt = 0;
  let nestBuffLastUpdateAt = "";
  const baitReminderIntervalMs = 10 * 60 * 1000;
  const baitReminderCheckIntervalMs = 60 * 1000;
  const baitReminderWarmupDelayMs = 5000;
  const baitReminderThresholdDefault = 20;
  const collectionPointerState = {
    pointerId: null,
    startDot: null,
    longPressTimerId: null,
    isDragSelecting: false,
    targetCollected: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  };
  let suppressCollectionClickUntil = 0;

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

  function clearNestBuffUpdateMark() {
    setNestBuffLastRefreshAt(0);
    setNestBuffLastUpdateAt("");
    clearNestBuffStatus();
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

  function showNestBuffSuccessStatus() {
    clearNestBuffStatusTimers();
    clearNestBuffError();
    const updateAt = getNestBuffLastUpdateAt() || getNestBuffLastRefreshAt();
    showNestBuffStatus(`数据更新于 ${formatDateTime(updateAt)}`, "success");
  }

  function getNestBuffAutoRefreshDelayMs() {
    const lastRefreshAt = getNestBuffLastRefreshAt();
    if (!Number.isFinite(lastRefreshAt) || lastRefreshAt <= 0) {
      return 0;
    }

    const elapsed = Date.now() - lastRefreshAt;
    return Math.max(0, nestBuffAutoRefreshIntervalMs - elapsed);
  }

  function getBaitBuffForMap(mapId) {
    return parseNumber(baitBuffByMap[String(mapId)]);
  }

  function setBaitBuffForMap(mapId, rawValue) {
    const key = String(mapId);
    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      delete baitBuffByMap[key];
    } else {
      baitBuffByMap[key] = rawValue;
    }
    setStoredValue(storageKeys.baitBuffByMap, JSON.stringify(baitBuffByMap));
  }

  function setAutoNestBuffSwitchState(isLoading = false) {
    if (!elements.autoNestBuffSwitch) {
      return;
    }

    elements.autoNestBuffSwitch.checked = isAutoNestBuffEnabled;
    elements.autoNestBuffSwitch.setAttribute(
      "aria-checked",
      String(isAutoNestBuffEnabled),
    );
    elements.autoNestBuffSwitch
      .closest(".auto-nest-buff-switch")
      ?.classList.toggle("is-loading", isLoading);
    document.body.classList.toggle("auto-mode", isAutoNestBuffEnabled);
  }

  function persistAutoNestBuffEnabled() {
    setStoredValue(storageKeys.autoNestBuff, String(isAutoNestBuffEnabled));
  }

  function startWeatherTooltipRefresh() {
    if (weatherTooltipRefreshIntervalId !== null) {
      return;
    }

    updateWeatherTooltipCountdowns();
    weatherTooltipRefreshIntervalId = window.setInterval(() => {
      if (!isAutoNestBuffEnabled) {
        return;
      }
      updateWeatherTooltipCountdowns();
    }, 1000);
  }

  function stopWeatherTooltipRefresh() {
    if (weatherTooltipRefreshIntervalId === null) {
      return;
    }

    window.clearInterval(weatherTooltipRefreshIntervalId);
    weatherTooltipRefreshIntervalId = null;
  }

  function stopAutoNestBuff({ persist = true } = {}) {
    freezeAllCurrentWeatherAsManualOverrides();
    isAutoNestBuffEnabled = false;
    activePlayerData = null;
    setPlayerQQError("");
    if (autoNestBuffIntervalId !== null) {
      window.clearInterval(autoNestBuffIntervalId);
      autoNestBuffIntervalId = null;
    }
    if (autoNestBuffTimeoutId !== null) {
      window.clearTimeout(autoNestBuffTimeoutId);
      autoNestBuffTimeoutId = null;
    }
    if (persist) {
      persistAutoNestBuffEnabled();
    }
    stopWeatherTooltipRefresh();
    setAutoNestBuffSwitchState(isRefreshingNestBuff);
  }

  function startAutoNestBuff({ persist = true, fetchImmediately = true } = {}) {
    isAutoNestBuffEnabled = true;
    activePlayerData = null;
    const snapshotResult = applyLatestNestBuffSnapshot();
    autoSelectSystemBuff(latestNestBuffPayload);
    if (persist) {
      persistAutoNestBuffEnabled();
    }
    setAutoNestBuffSwitchState(isRefreshingNestBuff);
    startWeatherTooltipRefresh();

    if (autoNestBuffIntervalId !== null) {
      window.clearInterval(autoNestBuffIntervalId);
      autoNestBuffIntervalId = null;
    }
    if (autoNestBuffTimeoutId !== null) {
      window.clearTimeout(autoNestBuffTimeoutId);
      autoNestBuffTimeoutId = null;
    }

    const startInterval = () => {
      autoNestBuffIntervalId = window.setInterval(() => {
        if (!isAutoNestBuffEnabled) {
          return;
        }
        clearNestBuffError();
        refreshNestBuffs();
      }, nestBuffAutoRefreshIntervalMs);
    };

    if (fetchImmediately) {
      const delayMs = getNestBuffAutoRefreshDelayMs();
      if (delayMs <= 0 || !snapshotResult.hasSnapshot) {
        clearNestBuffError();
        refreshNestBuffs();
        startInterval();
        return;
      }

      autoNestBuffTimeoutId = window.setTimeout(() => {
        autoNestBuffTimeoutId = null;
        if (!isAutoNestBuffEnabled) {
          return;
        }
        clearNestBuffError();
        refreshNestBuffs();
        startInterval();
      }, delayMs);
      render({ skipMapCardRebuild: !snapshotResult.rodChanged });
      return;
    }

    startInterval();
    startWeatherTooltipRefresh();
    render({ skipMapCardRebuild: !snapshotResult.rodChanged });
  }

  function disableAutoNestBuffForManualEdit() {
    if (isAutoNestBuffEnabled) {
      stopAutoNestBuff();
    }
    clearNestBuffUpdateMark();
  }

  function findPlayerData(payload) {
    const playerQQ = getPlayerQQValue();
    if (!playerQQ) {
      return null;
    }

    const players = Array.isArray(payload?.players) ? payload.players : [];
    return (
      players.find(
        (player) => String(player?.user_id || "").trim() === playerQQ,
      ) || null
    );
  }

  function setPlayerQQError(message = "") {
    if (!elements.playerQQError) {
      return;
    }

    elements.playerQQError.hidden = !message;
    elements.playerQQError.textContent = message;
  }

  function setSelectValueIfOptionExists(selectElement, value) {
    if (!selectElement) {
      return false;
    }

    const normalizedValue = String(value);
    const hasOption = Array.from(selectElement.options).some(
      (option) => option.value === normalizedValue,
    );
    if (!hasOption) {
      return false;
    }

    selectElement.value = normalizedValue;
    return true;
  }

  function updateLevelDisplays() {
    const defaultHookLevel = config.hookLevels[0]?.level ?? 1;
    const defaultRodLevel = config.rodLevels[0]?.level ?? 1;
    const parsedHookLevel = Number.parseInt(elements.hookLevel?.value, 10);
    const parsedRodLevel = Number.parseInt(elements.rodLevel?.value, 10);
    const hookVal = Number.isFinite(parsedHookLevel)
      ? parsedHookLevel
      : defaultHookLevel;
    const rodVal = Number.isFinite(parsedRodLevel)
      ? parsedRodLevel
      : defaultRodLevel;

    if (elements.hookLevelDisplay) {
      elements.hookLevelDisplay.textContent = `Lv.${hookVal}`;
    }
    if (elements.rodLevelDisplay) {
      elements.rodLevelDisplay.textContent = `Lv.${rodVal}`;
    }
  }

  function applyPlayerLevels(player) {
    if (!player) {
      return { changed: false, rodChanged: false };
    }

    let changed = false;
    let rodChanged = false;
    isApplyingAutoPlayerData = true;
    try {
      const hookLevel = Number.parseInt(player.hook_level, 10);
      const previousHookLevel = elements.hookLevel?.value;
      if (
        Number.isInteger(hookLevel) &&
        setSelectValueIfOptionExists(elements.hookLevel, hookLevel)
      ) {
        changed = changed || previousHookLevel !== String(hookLevel);
        setStoredValue(storageKeys.hookLevel, String(hookLevel));
      }

      const rodLevel = Number.parseInt(player.rod_level, 10);
      const previousRodLevel = elements.rodLevel?.value;
      if (
        Number.isInteger(rodLevel) &&
        setSelectValueIfOptionExists(elements.rodLevel, rodLevel)
      ) {
        rodChanged = previousRodLevel !== String(rodLevel);
        changed = changed || rodChanged;
        setStoredValue(storageKeys.rodLevel, String(rodLevel));
      }
    } finally {
      isApplyingAutoPlayerData = false;
    }

    updateLevelDisplays();
    return { changed, rodChanged };
  }

  function isChinaWeekend(utcString) {
    if (!utcString) return false;
    var date = new Date(utcString);
    if (Number.isNaN(date.getTime())) return false;
    var chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    var day = chinaTime.getUTCDay();
    return day === 0 || day === 6;
  }

  function autoSelectSystemBuff(payload) {
    if (!isAutoNestBuffEnabled) return;
    if (!elements.systemBuff) return;
    var isWeekend = isChinaWeekend(payload && payload.updated_at);
    var targetId = isWeekend ? "weekend" : "none";
    if (elements.systemBuff.value !== targetId) {
      elements.systemBuff.value = targetId;
      setStoredValue(storageKeys.systemBuff, targetId);
    }
  }

  function applyPlayerSnapshot(payload) {
    const playerQQ = getPlayerQQValue();
    if (!playerQQ || !payload) {
      activePlayerData = null;
      setPlayerQQError("");
      return { changed: false, rodChanged: false };
    }

    activePlayerData = findPlayerData(payload);
    if (activePlayerData) {
      setPlayerQQError("");
      return applyPlayerLevels(activePlayerData);
    }

    setPlayerQQError(`未在数据中找到 QQ 号 ${playerQQ}`);
    return { changed: false, rodChanged: false };
  }

  function applyLatestPlayerSnapshot() {
    return applyPlayerSnapshot(latestNestBuffPayload);
  }

  function applyLatestNestBuffSnapshot() {
    if (!latestNestBuffPayload) {
      return { changed: false, rodChanged: false, hasSnapshot: false };
    }

    clearWeatherOverrides();
    applyNestBuffSnapshot(latestNestBuffPayload);
    return {
      ...applyPlayerSnapshot(latestNestBuffPayload),
      hasSnapshot: true,
    };
  }

  function applyNestBuffSnapshot(payload) {
    const nextBaitBuffByMap = {};
    const nextWeatherByMap = {};
    const locations = Array.isArray(payload?.locations)
      ? payload.locations
      : [];

    locations.forEach((location) => {
      const mapId = Number.parseInt(location?.id, 10);
      if (!Number.isInteger(mapId) || mapId <= 0) {
        return;
      }

      const nestValue = parseNumber(location?.buffs?.nest) * 5;
      if (nestValue > 0) {
        nextBaitBuffByMap[String(mapId)] = String(nestValue);
      }

      const weather = location?.weather;
      if (weather && typeof weather === "object") {
        nextWeatherByMap[String(mapId)] = {
          type: normalizeWeatherType(weather.type),
          is_active: Boolean(weather.is_active),
          start_time: weather.start_time ?? null,
          end_time: weather.end_time ?? null,
        };
      }
    });

    baitBuffByMap = nextBaitBuffByMap;
    setStoredValue(storageKeys.baitBuffByMap, JSON.stringify(baitBuffByMap));
    sourceWeatherByMap = nextWeatherByMap;
  }

  async function refreshNestBuffs() {
    if (isRefreshingNestBuff) {
      return;
    }

    isRefreshingNestBuff = true;
    setAutoNestBuffSwitchState(true);

    try {
      const response = await fetch(nestBuffSourceUrl, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!isAutoNestBuffEnabled) {
        return;
      }
      latestNestBuffPayload = payload;
      clearWeatherOverrides();
      applyNestBuffSnapshot(payload);
      const playerSyncResult = applyPlayerSnapshot(payload);
      autoSelectSystemBuff(payload);
      setNestBuffLastUpdateAt(payload?.updated_at);
      setNestBuffLastRefreshAt(Date.now());
      showNestBuffSuccessStatus();
      render({ skipMapCardRebuild: !playerSyncResult.rodChanged });
    } catch (error) {
      console.error("获取实时打窝buff失败", error);
      showNestBuffError("获取实时打窝buff失败，请稍后重试。");
    } finally {
      isRefreshingNestBuff = false;
      setAutoNestBuffSwitchState(false);
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

  function calculateIntervalHours(
    hookSpeed,
    baitSpeed,
    baitBuff,
    systemBuff,
    weatherMultiplier,
  ) {
    const hookFactor = 1 + hookSpeed;
    const baitFactor = 1 + baitSpeed + baitBuff / 100;
    const systemFactor = 1 + systemBuff / 100;
    const weatherFactor = Number.isFinite(weatherMultiplier)
      ? weatherMultiplier
      : 1;

    if (
      hookFactor <= 0 ||
      baitFactor <= 0 ||
      systemFactor <= 0 ||
      weatherFactor <= 0
    ) {
      return Number.NaN;
    }

    return (
      config.baseIntervalHours /
      hookFactor /
      baitFactor /
      systemFactor /
      weatherFactor
    );
  }

  function getProbabilityProfile(delta) {
    return config.probabilityByDelta[delta] || config.probabilityByDelta[1];
  }

  function isMapDataSelectable(fishes, profile) {
    const hasValidFishPrices =
      fishes.length > 0 && fishes.every((fish) => parseNumber(fish.nPrice) > 0);
    const hasValidProbability = baseRarityOrder.some(
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
    const weatherMultiplier = Number.isFinite(inputs.weatherMultiplier)
      ? inputs.weatherMultiplier
      : 1;
    const baitCostMultiplier = Number.isFinite(inputs.baitCostMultiplier)
      ? inputs.baitCostMultiplier
      : 1;

    return config.baitList.map((bait) => {
      const intervalHours = calculateIntervalHours(
        inputs.hookConfig.speed,
        bait.speed,
        baitBuff,
        inputs.systemBuff,
        weatherMultiplier,
      );
      const theoreticalCount = Number.isFinite(intervalHours)
        ? statisticsHours / intervalHours
        : Number.NaN;
      const completedCount = Number.isFinite(theoreticalCount)
        ? Math.floor(theoreticalCount)
        : 0;
      const grossRevenue = completedCount * averageFishPrice;
      const hourlyTheoreticalRevenue = Number.isFinite(intervalHours)
        ? averageFishPrice / intervalHours
        : Number.NaN;
      const baitCost = completedCount * bait.price * baitCostMultiplier;
      const netRevenue = grossRevenue - baitCost;

      return {
        bait,
        intervalHours,
        theoreticalCount,
        completedCount,
        hourlyTheoreticalRevenue,
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
        const baseProfile = getProbabilityProfile(delta);
        const weather = getWeatherForMap(map.difficulty, map.id);
        const profile = getWeatherAdjustedProbabilityProfile(
          baseProfile,
          weather,
        );
        const isSelectable = isMapDataSelectable(fishes, baseProfile);
        const expectedPrice = isSelectable
          ? calculateExpectedFishPrice(profile, averageNPrice)
          : Number.NaN;
        const baitBuff = getBaitBuffForMap(map.id);
        const weatherMultiplier = getWeatherMultiplier(weather);
        const baitCostMultiplier = getWeatherBaitCostMultiplier(weather);
        const baitRows = isSelectable
          ? calculateBaitRows(
              {
                ...inputs,
                weatherMultiplier,
                baitCostMultiplier,
              },
              expectedPrice,
              baitBuff,
            )
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
          weather,
          weatherMultiplier,
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
    const achievementCells = visibleRarities
      .map((rarity) => {
        const multiplier = parseNumber(config.rarityMultipliers[rarity]);
        const totalPrice =
          fishes.reduce(
            (sum, fish) => sum + parseNumber(fish.nPrice) * multiplier,
            0,
          ) * 3;
        return `<td>¥${formatNumber(totalPrice, 0)}</td>`;
      })
      .join("");
    const achievementRow = `<tr class="tooltip-achievement-row"><td>成就</td>${achievementCells}</tr>`;

    tooltip.hidden = false;
    tooltip.innerHTML = `
      <div class="tooltip-title">各稀有度单鱼价格</div>
      <table class="tooltip-table">
        <thead><tr><th>鱼种</th>${headerCells}</tr></thead>
        <tbody>${rows}${achievementRow}</tbody>
      </table>
    `;
  }

  function rarityColor(rarity) {
    switch (rarity) {
      case "UTR":
        return "#ff3b30";
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

  function getFishCollectionKey(map, fish) {
    return `${map.id}:${fish.name}`;
  }

  function getPlayerQQValue() {
    return String(elements.playerQQ?.value || "").trim();
  }

  function getBaitReminderEnabled() {
    return getStoredValue(storageKeys.baitReminderEnabled) === "true";
  }

  function setBaitReminderEnabled(enabled) {
    setStoredValue(storageKeys.baitReminderEnabled, String(Boolean(enabled)));
  }

  function getBaitReminderThreshold() {
    const value = Number.parseInt(
      getStoredValue(storageKeys.baitReminderThreshold) || "",
      10,
    );
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : baitReminderThresholdDefault;
  }

  function setBaitReminderThreshold(value) {
    const threshold = Number.isFinite(value)
      ? Math.max(1, Math.floor(value))
      : baitReminderThresholdDefault;
    setStoredValue(storageKeys.baitReminderThreshold, String(threshold));
    return threshold;
  }

  function getBaitReminderLastShownAt() {
    const value = Number.parseInt(
      getStoredValue(storageKeys.baitReminderLastShownAt) || "",
      10,
    );
    return Number.isFinite(value) ? value : 0;
  }

  function setBaitReminderLastShownAt(timestamp) {
    const value = Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0;
    setStoredValue(storageKeys.baitReminderLastShownAt, String(value));
  }

  function clearBaitReminderWarmupTimeout() {
    if (baitReminderWarmupTimeoutId === null) {
      return;
    }

    window.clearTimeout(baitReminderWarmupTimeoutId);
    baitReminderWarmupTimeoutId = null;
  }

  function scheduleBaitReminderWarmup() {
    clearBaitReminderWarmupTimeout();
    baitReminderWarmupUntil = Date.now() + baitReminderWarmupDelayMs;
    baitReminderWarmupTimeoutId = window.setTimeout(() => {
      baitReminderWarmupTimeoutId = null;
      baitReminderWarmupUntil = 0;
      maybeShowBaitReminder();
    }, baitReminderWarmupDelayMs);
  }

  function getActivePlayerBaitRemainingCount() {
    const baitRemaining = activePlayerData?.bait_remaining;
    if (
      baitRemaining === null ||
      baitRemaining === undefined ||
      baitRemaining === ""
    ) {
      return Number.NaN;
    }

    return parseNumber(baitRemaining);
  }

  function isPlayerBaitReminderEligible() {
    return (
      getBaitReminderEnabled() &&
      Boolean(activePlayerData) &&
      Number.isFinite(getActivePlayerBaitRemainingCount())
    );
  }

  function updateBaitReminderToggleState() {
    if (elements.baitReminderToggle) {
      elements.baitReminderToggle.checked = getBaitReminderEnabled();
    }

    if (elements.baitReminderThreshold) {
      elements.baitReminderThreshold.value = String(getBaitReminderThreshold());
    }
  }

  function showBaitReminderNotice(message) {
    if (!elements.baitReminderNotice || !elements.baitReminderNoticeMessage) {
      return;
    }

    elements.baitReminderNoticeMessage.textContent = message;
    elements.baitReminderNotice.hidden = false;
    elements.baitReminderNoticeClose?.focus();
  }

  function closeBaitReminderNotice() {
    if (!elements.baitReminderNotice) {
      return;
    }

    elements.baitReminderNotice.hidden = true;
  }

  function resetBaitReminderTiming({ warmup = true } = {}) {
    setBaitReminderLastShownAt(0);
    if (warmup) {
      scheduleBaitReminderWarmup();
      return;
    }

    clearBaitReminderWarmupTimeout();
    baitReminderWarmupUntil = 0;
  }

  function maybeShowBaitReminder() {
    if (!isPlayerBaitReminderEligible()) {
      closeBaitReminderNotice();
      return;
    }

    const threshold = getBaitReminderThreshold();
    const now = Date.now();
    if (baitReminderWarmupUntil > 0 && now < baitReminderWarmupUntil) {
      return;
    }

    const baitRemaining = getActivePlayerBaitRemainingCount();
    if (!Number.isFinite(baitRemaining) || baitRemaining >= threshold) {
      closeBaitReminderNotice();
      return;
    }

    if (document.hidden) {
      return;
    }

    const lastShownAt = getBaitReminderLastShownAt();
    if (lastShownAt > 0 && now - lastShownAt < baitReminderIntervalMs) {
      return;
    }

    const baitName =
      String(activePlayerData?.bait_name || "鱼饵").trim() || "鱼饵";
    showBaitReminderNotice(
      `提醒：当前${baitName}数量只剩 ${formatNumber(baitRemaining, 0)} 个，请及时补充。`,
    );
    setBaitReminderLastShownAt(now);
  }

  function startBaitReminderMonitor() {
    if (baitReminderIntervalId !== null) {
      return;
    }

    baitReminderIntervalId = window.setInterval(() => {
      maybeShowBaitReminder();
    }, baitReminderCheckIntervalMs);
  }

  function stopBaitReminderMonitor() {
    if (baitReminderIntervalId === null) {
      return;
    }

    window.clearInterval(baitReminderIntervalId);
    baitReminderIntervalId = null;
  }

  function getPlayerAchievementCount(player) {
    return Array.isArray(player?.achievements) ? player.achievements.length : 0;
  }

  function getLeaderboardTypeConfig(typeKey) {
    return (
      leaderboardTypes.find((type) => type.key === typeKey) ||
      leaderboardTypes[0]
    );
  }

  function normalizeLeaderboardEntry(player) {
    return {
      userId: String(player?.user_id || "").trim(),
      nickname: String(player?.nickname || "").trim(),
      rodLevel: Math.max(0, Number.parseInt(player?.rod_level, 10) || 0),
      hookLevel: Math.max(0, Number.parseInt(player?.hook_level, 10) || 0),
      achievementCount: getPlayerAchievementCount(player),
    };
  }

  function getLeaderboardEntries() {
    if (!Array.isArray(latestNestBuffPayload?.players)) {
      return [];
    }

    return latestNestBuffPayload.players
      .map((player) => normalizeLeaderboardEntry(player))
      .filter((entry) => Boolean(entry.userId));
  }

  function getCurrentPlayerUserId() {
    return String(activePlayerData?.user_id || "").trim();
  }

  function getCurrentLeaderboardInfo(typeConfig) {
    const currentUserId = getCurrentPlayerUserId();
    if (!currentUserId) {
      return null;
    }

    const entries = getLeaderboardEntries();
    const sorted = [...entries].sort(typeConfig.compare);
    const index = sorted.findIndex((entry) => entry.userId === currentUserId);
    if (index < 0) {
      return null;
    }

    return {
      entry: sorted[index],
      rank: index + 1,
      sorted,
    };
  }

  function renderLeaderboardSummaryBadge() {
    if (!elements.leaderboardSummaryBadge) {
      return;
    }

    const typeConfig = getLeaderboardTypeConfig(leaderboardActiveType);
    const currentInfo = getCurrentLeaderboardInfo(typeConfig);
    if (!currentInfo) {
      elements.leaderboardSummaryBadge.hidden = true;
      elements.leaderboardSummaryBadge.textContent = "";
      elements.leaderboardSummaryBadge.title = "";
      return;
    }

    const text = `第 ${formatNumber(currentInfo.rank, 0)}`;
    elements.leaderboardSummaryBadge.hidden = false;
    elements.leaderboardSummaryBadge.textContent = text;
    elements.leaderboardSummaryBadge.title = `我的排名：${text}`;
  }

  function hasLatestAutoNestBuffData() {
    return (
      isAutoNestBuffEffectivelyEnabled() &&
      getNestBuffLastRefreshAt() > 0 &&
      Object.keys(sourceWeatherByMap).length > 0
    );
  }

  function getMapAchievementKey(mapId) {
    if (mapId === null || mapId === undefined || mapId === "") {
      return "";
    }

    return `collect_scene_${String(mapId)}`;
  }

  function hasPlayerAchievementForMap(mapId) {
    const achievementKey = getMapAchievementKey(mapId);
    const achievements = Array.isArray(activePlayerData?.achievements)
      ? activePlayerData.achievements
      : [];
    return Boolean(achievementKey && achievements.includes(achievementKey));
  }

  function shouldGateLostWindForMap(mapId, weather) {
    return (
      hasLatestAutoNestBuffData() &&
      normalizeWeatherType(weather?.type) === "lost_wind" &&
      !hasPlayerAchievementForMap(mapId)
    );
  }

  function isFishRarityCollected(fishKey, rarity) {
    return Boolean(fishCollection[fishKey]?.[rarity]);
  }

  function setFishRarityCollected(fishKey, rarity, isCollected) {
    if (!collectionRarities.includes(rarity)) {
      return;
    }

    if (isCollected) {
      fishCollection[fishKey] = {
        ...(fishCollection[fishKey] || {}),
        [rarity]: true,
      };
    } else if (fishCollection[fishKey]) {
      delete fishCollection[fishKey][rarity];
      if (Object.keys(fishCollection[fishKey]).length === 0) {
        delete fishCollection[fishKey];
      }
    }

    persistFishCollection();
    renderCollectionProgress();
    if (rarity === "UR" && hasLatestAutoNestBuffData()) {
      render({ skipMapCardRebuild: true });
    }
  }

  function getCollectionStats() {
    let collected = 0;
    let total = 0;

    config.maps.forEach((map) => {
      getMapFishes(map).forEach((fish) => {
        const fishKey = getFishCollectionKey(map, fish);
        collectionRarities.forEach((rarity) => {
          total += 1;
          if (isFishRarityCollected(fishKey, rarity)) {
            collected += 1;
          }
        });
      });
    });

    return { collected, total };
  }

  function renderCollectionProgress() {
    if (!elements.collectionProgress) {
      return;
    }

    const { collected, total } = getCollectionStats();
    elements.collectionProgress.textContent = `已收集 ${collected}/${total}`;
  }

  function setCollectionDotVisualState(dot, isCollected) {
    dot.classList.toggle("is-collected", isCollected);
    dot.dataset.collected = isCollected ? "true" : "false";
    dot.setAttribute("aria-pressed", String(isCollected));
    dot.setAttribute(
      "aria-label",
      `${dot.dataset.mapName || ""} ${dot.dataset.fishName || ""} ${dot.dataset.rarity || ""} ${isCollected ? "已收集" : "未收集"}`.trim(),
    );
  }

  function isCollectionDotCollected(dot) {
    return dot?.dataset.collected === "true";
  }

  function applyCollectionDotState(dot, shouldCollect) {
    if (!dot) {
      return;
    }

    const fishKey = dot.dataset.fishKey;
    const rarity = dot.dataset.rarity;
    if (!fishKey || !rarity) {
      return;
    }

    if (isCollectionDotCollected(dot) === shouldCollect) {
      return;
    }

    setFishRarityCollected(fishKey, rarity, shouldCollect);
    setCollectionDotVisualState(dot, shouldCollect);
  }

  function toggleCollectionDot(dot) {
    applyCollectionDotState(dot, !isCollectionDotCollected(dot));
  }

  function renderCollectionLegend() {
    if (!elements.collectionLegend) {
      return;
    }

    elements.collectionLegend.innerHTML = collectionRarities
      .map(
        (rarity) => `
          <span class="collection-legend-item">
            <span class="collection-legend-dot" style="--rarity-color: ${rarityColor(rarity)};"></span>
            <span>${escapeHtml(rarity)}</span>
          </span>
        `,
      )
      .join("");
  }

  function renderCollectionModal() {
    if (!elements.collectionMapList) {
      return;
    }

    renderCollectionLegend();

    elements.collectionMapList.innerHTML = config.maps
      .map((map) => {
        const fishCards = getMapFishes(map)
          .map((fish) => {
            const fishKey = getFishCollectionKey(map, fish);
            const dots = collectionRarities
              .map((rarity) => {
                const isCollected = isFishRarityCollected(fishKey, rarity);
                return `
                  <button
                    type="button"
                    class="collection-rarity-dot ${isCollected ? "is-collected" : ""}"
                    style="--rarity-color: ${rarityColor(rarity)};"
                    data-fish-key="${escapeHtml(fishKey)}"
                    data-rarity="${escapeHtml(rarity)}"
                    data-map-name="${escapeHtml(map.name)}"
                    data-fish-name="${escapeHtml(fish.name)}"
                    data-collected="${isCollected ? "true" : "false"}"
                    aria-pressed="${isCollected ? "true" : "false"}"
                    aria-label="${escapeHtml(`${map.name} ${fish.name} ${rarity} ${isCollected ? "已收集" : "未收集"}`)}"
                  ></button>
                `;
              })
              .join("");

            return `
              <article class="collection-fish-card">
                <div class="collection-fish-name" title="${escapeHtml(fish.name)}">${escapeHtml(fish.name)}</div>
                <div class="collection-rarity-dots">${dots}</div>
              </article>
            `;
          })
          .join("");

        return `
          <section class="collection-map-row">
            <div class="collection-map-name">${escapeHtml(map.name)}</div>
            <div class="collection-fish-grid">${fishCards}</div>
          </section>
        `;
      })
      .join("");
  }

  function renderLeaderboardList() {
    if (!elements.leaderboardList || !elements.leaderboardContentTitle) return;

    const entries = getLeaderboardEntries();
    const typeConfig = getLeaderboardTypeConfig(leaderboardActiveType);
    const sorted = [...entries].sort(typeConfig.compare);
    const currentUserId = getCurrentPlayerUserId();
    const currentIndex = currentUserId
      ? sorted.findIndex((entry) => entry.userId === currentUserId)
      : -1;

    elements.leaderboardContentTitle.textContent = typeConfig.label;
    // subtitle is intentionally hidden per UX: do not set subtitle text

    if (elements.leaderboardSummary) {
      if (currentIndex >= 0) {
        elements.leaderboardSummary.hidden = false;
        elements.leaderboardSummary.textContent = `我的排名：第 ${formatNumber(currentIndex + 1, 0)}`;
      } else {
        elements.leaderboardSummary.hidden = true;
        elements.leaderboardSummary.textContent = "";
      }
    }

    const renderLeaderboardRow = (entry, idx) => {
      const rank = idx + 1;
      const isCurrent = currentUserId && currentUserId === entry.userId;
      const topClass = idx < 3 ? ` top-${idx + 1}` : "";
      let medalHtml = "";
      if (idx === 0) {
        medalHtml =
          `<span class="leaderboard-medal" aria-hidden="true">` +
          `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="14" r="8" fill="#FFD54A"/><rect x="9" y="26" width="18" height="6" rx="2" fill="#FFB300"/><text x="18" y="17" font-size="10" text-anchor="middle" fill="#1b1b1b" font-weight="700">1</text></svg>` +
          `</span>`;
      } else if (idx === 1) {
        medalHtml =
          `<span class="leaderboard-medal" aria-hidden="true">` +
          `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="14" r="8" fill="#C0C8D6"/><rect x="9" y="26" width="18" height="6" rx="2" fill="#9AA3B8"/><text x="18" y="17" font-size="10" text-anchor="middle" fill="#1b1b1b" font-weight="700">2</text></svg>` +
          `</span>`;
      } else if (idx === 2) {
        medalHtml =
          `<span class="leaderboard-medal" aria-hidden="true">` +
          `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="14" r="8" fill="#E0B58B"/><rect x="9" y="26" width="18" height="6" rx="2" fill="#C6863A"/><text x="18" y="17" font-size="10" text-anchor="middle" fill="#1b1b1b" font-weight="700">3</text></svg>` +
          `</span>`;
      }

      const rankContent =
        idx < 3
          ? medalHtml
          : `<span class="leaderboard-rank-number">${rank}</span>`;
      return `
          <li class="leaderboard-row ${isCurrent ? "is-current" : ""}${topClass}" data-user-id="${escapeHtml(entry.userId)}" tabindex="0">
            <div class="leaderboard-rank">${rankContent}</div>
            <div class="leaderboard-main">
              <div class="leaderboard-nick">${escapeHtml(entry.nickname || entry.userId)}</div>
            </div>
            <div class="leaderboard-value">${escapeHtml(typeConfig.formatPrimaryValue(entry))}</div>
          </li>
        `;
    };

    const rows = sorted
      .slice(0, 50)
      .map((entry, idx) => renderLeaderboardRow(entry, idx));
    if (currentIndex >= 50) {
      rows.push(
        '<li class="leaderboard-current-separator">我的排名</li>',
        renderLeaderboardRow(sorted[currentIndex], currentIndex),
      );
    }

    elements.leaderboardList.innerHTML = rows.join("");
  }

  function renderLeaderboardTypes() {
    if (!elements.leaderboardTypeList) return;
    elements.leaderboardTypeList.innerHTML = leaderboardTypes
      .map((type) => {
        const isActive = type.key === leaderboardActiveType ? " is-active" : "";
        return `
          <button type="button" class="leaderboard-type-btn${isActive}" data-leaderboard-type="${escapeHtml(type.key)}" aria-pressed="${type.key === leaderboardActiveType}">
            <span class="leaderboard-type-dot" aria-hidden="true"></span>
            <span class="leaderboard-type-label">${escapeHtml(type.label)}</span>
          </button>
        `;
      })
      .join("");
  }

  function openLeaderboardModal() {
    if (!elements.leaderboardModal) return;
    renderLeaderboardTypes();
    renderLeaderboardList();
    elements.leaderboardModal.hidden = false;
    document.body.classList.add("collection-modal-open");
    elements.leaderboardModal
      .querySelector(".collection-modal-panel")
      ?.focus({ preventScroll: true });
  }

  function closeLeaderboardModal() {
    if (!elements.leaderboardModal) return;
    elements.leaderboardModal.hidden = true;
    document.body.classList.remove("collection-modal-open");
    elements.openLeaderboardModal?.focus({ preventScroll: true });
  }

  function openCollectionModal() {
    if (!elements.collectionModal) {
      return;
    }

    renderCollectionModal();
    elements.collectionModal.hidden = false;
    document.body.classList.add("collection-modal-open");
    elements.collectionModal
      .querySelector(".collection-modal-panel")
      ?.focus({ preventScroll: true });
  }

  function clearCollectionLongPressTimer() {
    if (collectionPointerState.longPressTimerId !== null) {
      window.clearTimeout(collectionPointerState.longPressTimerId);
      collectionPointerState.longPressTimerId = null;
    }
  }

  function resetCollectionPointerState(event) {
    clearCollectionLongPressTimer();
    collectionPointerState.startDot?.classList.remove("is-drag-source");
    if (
      event &&
      collectionPointerState.startDot?.hasPointerCapture?.(
        collectionPointerState.pointerId,
      )
    ) {
      try {
        collectionPointerState.startDot.releasePointerCapture(
          collectionPointerState.pointerId,
        );
      } catch (_error) {
        // Pointer capture may already be released by the browser.
      }
    }
    collectionPointerState.pointerId = null;
    collectionPointerState.startDot = null;
    collectionPointerState.isDragSelecting = false;
    collectionPointerState.targetCollected = false;
    collectionPointerState.startX = 0;
    collectionPointerState.startY = 0;
    collectionPointerState.lastX = 0;
    collectionPointerState.lastY = 0;
  }

  function closeCollectionModal() {
    if (!elements.collectionModal) {
      return;
    }

    resetCollectionPointerState();
    elements.collectionModal.hidden = true;
    document.body.classList.remove("collection-modal-open");
    elements.openCollectionModal?.focus({ preventScroll: true });
  }

  function getCollectionDotFromEvent(event) {
    if (!(event.target instanceof Element)) {
      return null;
    }
    return event.target.closest(".collection-rarity-dot");
  }

  function getCollectionDotAtPoint(clientX, clientY) {
    const elementAtPoint = document.elementFromPoint(clientX, clientY);
    const dot = elementAtPoint?.closest(".collection-rarity-dot");
    if (!dot || !elements.collectionMapList?.contains(dot)) {
      return null;
    }
    return dot;
  }

  function updateCollectionDragSourceStyle(currentDot) {
    if (!collectionPointerState.startDot) {
      return;
    }

    collectionPointerState.startDot.classList.toggle(
      "is-drag-source",
      collectionPointerState.isDragSelecting &&
        currentDot === collectionPointerState.startDot,
    );
  }

  function startCollectionDragSelection() {
    if (
      !collectionPointerState.startDot ||
      collectionPointerState.isDragSelecting
    ) {
      return;
    }

    collectionPointerState.longPressTimerId = null;
    collectionPointerState.isDragSelecting = true;
    applyCollectionDotState(
      collectionPointerState.startDot,
      collectionPointerState.targetCollected,
    );

    const currentDot = getCollectionDotAtPoint(
      collectionPointerState.lastX,
      collectionPointerState.lastY,
    );
    updateCollectionDragSourceStyle(currentDot);
    if (currentDot) {
      applyCollectionDotState(
        currentDot,
        collectionPointerState.targetCollected,
      );
    }
  }

  function handleCollectionPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const dot = getCollectionDotFromEvent(event);
    if (!dot) {
      return;
    }

    resetCollectionPointerState();
    collectionPointerState.pointerId = event.pointerId;
    collectionPointerState.startDot = dot;
    collectionPointerState.targetCollected = !isCollectionDotCollected(dot);
    collectionPointerState.startX = event.clientX;
    collectionPointerState.startY = event.clientY;
    collectionPointerState.lastX = event.clientX;
    collectionPointerState.lastY = event.clientY;
    dot.setPointerCapture?.(event.pointerId);
    collectionPointerState.longPressTimerId = window.setTimeout(
      startCollectionDragSelection,
      collectionLongPressMs,
    );
  }

  function handleCollectionPointerMove(event) {
    if (collectionPointerState.pointerId !== event.pointerId) {
      return;
    }

    collectionPointerState.lastX = event.clientX;
    collectionPointerState.lastY = event.clientY;

    if (!collectionPointerState.isDragSelecting) {
      const deltaX = event.clientX - collectionPointerState.startX;
      const deltaY = event.clientY - collectionPointerState.startY;
      const dot = getCollectionDotAtPoint(event.clientX, event.clientY);
      if (
        Math.hypot(deltaX, deltaY) > 10 &&
        dot &&
        dot !== collectionPointerState.startDot
      ) {
        clearCollectionLongPressTimer();
        startCollectionDragSelection();
        applyCollectionDotState(dot, collectionPointerState.targetCollected);
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    const dot = getCollectionDotAtPoint(event.clientX, event.clientY);
    updateCollectionDragSourceStyle(dot);
    if (dot) {
      applyCollectionDotState(dot, collectionPointerState.targetCollected);
    }
  }

  function handleCollectionPointerUp(event) {
    if (collectionPointerState.pointerId !== event.pointerId) {
      return;
    }

    if (collectionPointerState.isDragSelecting) {
      suppressCollectionClickUntil = Date.now() + 600;
      event.preventDefault();
    }

    resetCollectionPointerState(event);
  }

  function handleCollectionPointerCancel(event) {
    if (collectionPointerState.pointerId !== event.pointerId) {
      return;
    }
    resetCollectionPointerState(event);
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
      ? `<span class="selected-map-delta-item"><span class="selected-map-delta-label">🎣渔力</span><span class="selected-map-delta-value">${selectedMapRow.delta}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🪝鱼钩</span><span class="selected-map-buff-value">${formatPercent(inputs?.hookConfig?.speed ?? 0, 2)}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">⚡${highlightPercentValues(inputs?.systemBuffConfig?.name ?? "", "selected-map-buff-value")}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🌽打窝</span><span class="selected-map-buff-value">${formatNumber(selectedMapRow.baitBuff, 2)}%</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">${getWeatherMeta(selectedMapRow.weather?.type).emoji}天气</span><span class="selected-map-buff-value">${getWeatherMeta(selectedMapRow.weather?.type).label}</span></span>`
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
      ? `<span class="selected-best-net-item">⏱️1H 理论收入 <span class="selected-best-net-value">¥${formatNumber(bestBaitRow.hourlyTheoreticalRevenue, 0)}</span></span><span class="selected-best-net-item">💰24H净利润 <span class="selected-best-net-value">¥${formatNumber(
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
                <div class="map-card-buff-stepper" data-bait-buff-stepper="${row.map.id}">
                  <button type="button" class="stepper-btn" data-bait-buff-step="-5" data-bait-buff-map-id="${row.map.id}" aria-label="减少">−</button>
                  <span class="stepper-value" data-bait-buff-value="${row.map.id}">${formatNumber(row.baitBuff, 0)}</span>
                  <button type="button" class="stepper-btn" data-bait-buff-step="5" data-bait-buff-map-id="${row.map.id}" aria-label="增加">+</button>
                </div>
              </label>`;
        return `
          <div class="map-card ${isSelected ? "selected" : ""} ${isBest ? "best" : ""} ${isUnavailable ? "unavailable" : ""}" data-map-level="${row.map.difficulty}" data-map-disabled="${isUnavailable}" role="button" tabindex="${isUnavailable ? "-1" : "0"}" aria-disabled="${isUnavailable ? "true" : "false"}">
            <div class="map-card-compact">
              <div class="map-card-header">
                <div class="map-card-title">
                  ${buildMapCardCodeHtml(row.map)}
                  <span>${row.map.name}</span>
                </div>
                <div class="map-card-badges" data-map-badges="${row.map.difficulty}">
                  ${buildMapCardBadgesHtml(row, isBest)}
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

      const unavailableEl = elements.mapCardList.querySelector(
        `[data-map-unavailable="${row.map.difficulty}"]`,
      );
      if (unavailableEl) {
        unavailableEl.textContent = row.unavailableReason;
      }

      const priceEl = elements.mapCardList.querySelector(
        `[data-map-price="${row.map.difficulty}"]`,
      );
      if (priceEl && row.isSelectable) {
        priceEl.textContent = ` ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}`;
      }
      const bestBaitEl = elements.mapCardList.querySelector(
        `[data-map-best-bait="${row.map.difficulty}"]`,
      );
      if (bestBaitEl && row.isSelectable) {
        bestBaitEl.textContent = `最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}`;
      }
      const buffValueEl = elements.mapCardList.querySelector(
        `[data-bait-buff-value="${row.map.id}"]`,
      );
      if (buffValueEl && row.isSelectable) {
        buffValueEl.textContent = formatNumber(row.baitBuff, 0);
      }
      const codeEl = cardEl?.querySelector(".map-card-code");
      if (codeEl) {
        codeEl.outerHTML = buildMapCardCodeHtml(row.map);
      }

      const badgesEl = elements.mapCardList.querySelector(
        `[data-map-badges="${row.map.difficulty}"]`,
      );
      const isBest = row.map.difficulty === bestMapLevel;
      if (cardEl) {
        cardEl.classList.toggle("best", isBest);
      }
      if (badgesEl) {
        badgesEl.innerHTML = buildMapCardBadgesHtml(row, isBest);
      }
    });
  }

  function canUpdateMapCardsInPlace(mapRows, selectedMapLevel) {
    if (!elements.mapCardList) {
      return false;
    }

    const cards = Array.from(
      elements.mapCardList.querySelectorAll(".map-card[data-map-level]"),
    );
    if (cards.length !== mapRows.length) {
      return false;
    }

    const selectedLevel = String(selectedMapLevel);
    return cards.every((card, index) => {
      const expectedLevel = String(mapRows[index]?.map?.difficulty ?? "");
      const cardLevel = card.dataset.mapLevel || "";
      const shouldBeSelected =
        selectedLevel !== "" && cardLevel === selectedLevel;
      return (
        cardLevel === expectedLevel &&
        card.classList.contains("selected") === shouldBeSelected
      );
    });
  }

  function renderTable(rows, bestRow) {
    elements.bestBaitName.textContent = bestRow ? bestRow.bait.name : "-";
    elements.bestBaitNet.textContent = bestRow
      ? `¥${formatNumber(bestRow.netRevenue, 0)}`
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
        const hourlyTheoreticalRevenueText = Number.isFinite(
          row.hourlyTheoreticalRevenue,
        )
          ? `¥${formatNumber(row.hourlyTheoreticalRevenue, 0)}`
          : "-";

        return `
          <tr class="${isBest ? "best-row" : ""}">
            <td>${row.bait.id}${isBest ? '<span class="badge">最优</span>' : ""}</td>
            <td>
              <div class="bait-name">${row.bait.name}</div>
            </td>
            <td>${formatNumber(row.bait.price, 0)}</td>
            <td>${formatPercent(row.bait.speed, 2)}</td>
            <td>${intervalText}</td>
            <td>${theoreticalCountText}</td>
            <td>${hourlyTheoreticalRevenueText}</td>
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

  function hidePlayerInfo() {
    if (!isAutoNestBuffEnabled || !activePlayerData) {
      if (elements.playerLocationPanel && elements.playerLocationValue) {
        elements.playerLocationPanel.hidden = true;
        elements.playerLocationValue.textContent = "-";
      }
      if (elements.playerBaitPanel && elements.playerBaitValue) {
        elements.playerBaitPanel.hidden = true;
        elements.playerBaitValue.textContent = "-";
      }
      return true;
    }

    return false;
  }

  function renderPlayerQQNickname() {
    if (!elements.playerQQ || !elements.playerQQNickname) {
      return;
    }

    const nickname = String(activePlayerData?.nickname || "").trim();
    const hasNickname = Boolean(nickname);
    const inputShell = elements.playerQQ.closest(".player-qq-input-shell");

    elements.playerQQNickname.textContent = nickname;
    elements.playerQQNickname.hidden = !hasNickname;
    elements.playerQQNickname.title = nickname;
    inputShell?.classList.toggle("has-player-nickname", hasNickname);
  }

  function renderPlayerInfo() {
    renderPlayerQQNickname();
    renderLeaderboardSummaryBadge();
    if (hidePlayerInfo()) {
      return;
    }

    if (elements.playerLocationPanel && elements.playerLocationValue) {
      const locationId = String(activePlayerData.location_id || "").trim();
      const locationName = String(activePlayerData.location_name || "").trim();
      const locationMap = config.maps.find(
        (map) => String(map.id) === locationId,
      );
      elements.playerLocationValue.innerHTML = locationId
        ? `<span class="player-map-code">${escapeHtml(locationId)}</span>${locationName ? `<span>${escapeHtml(locationName)}</span>` : ""}`
        : "-";
      elements.playerLocationPanel.hidden = !locationId;
    }

    if (elements.playerBaitPanel && elements.playerBaitValue) {
      const baitName = String(activePlayerData.bait_name || "").trim();
      const baitId = String(activePlayerData.bait_id || "").trim();
      const baitRemaining = activePlayerData.bait_remaining;
      const hasRemaining =
        baitRemaining !== null &&
        baitRemaining !== undefined &&
        baitRemaining !== "";
      const baitParts = [
        baitName || (baitId ? `鱼饵 ${baitId}` : ""),
        hasRemaining ? `${formatNumber(parseNumber(baitRemaining), 0)}` : "",
      ].filter(Boolean);
      elements.playerBaitValue.textContent = baitParts.length
        ? baitParts.join(" / ")
        : "-";
      elements.playerBaitPanel.hidden = baitParts.length === 0;
      updateBaitReminderToggleState();
      maybeShowBaitReminder();
    }
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
      player: activePlayerData,
    };

    renderSummary(selectedMapRow, bestBaitRow, inputs);
    renderPlayerInfo();
    // If leaderboard modal is open, refresh its contents so it stays up-to-date
    if (elements.leaderboardModal && !elements.leaderboardModal.hidden) {
      renderLeaderboardTypes();
      renderLeaderboardList();
    }
    if (
      options.skipMapCardRebuild &&
      canUpdateMapCardsInPlace(mapRows, activeMapLevel)
    ) {
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
    const storedPlayerQQ = getStoredValue(storageKeys.playerQQ) || "";

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

    updateLevelDisplays();
    elements.systemBuff.value = systemBuffs.some(
      (item) => item.id === storedSystemBuffId,
    )
      ? storedSystemBuffId
      : defaultSystemBuffId;
    if (elements.playerQQ) {
      elements.playerQQ.value = storedPlayerQQ;
    }

    const persist = () => {
      setStoredValue(storageKeys.hookLevel, elements.hookLevel.value);
      setStoredValue(storageKeys.rodLevel, elements.rodLevel.value);
      setStoredValue(storageKeys.systemBuff, elements.systemBuff.value);
    };

    const handleManualLevelChange = () => {
      if (isAutoNestBuffEnabled && !isApplyingAutoPlayerData) {
        disableAutoNestBuffForManualEdit();
      }
      persist();
      render();
    };

    [elements.hookLevel, elements.rodLevel].forEach((element) => {
      element.addEventListener("input", (e) => {
        handleManualLevelChange(e);
        updateLevelDisplays();
      });
      element.addEventListener("change", (e) => {
        handleManualLevelChange(e);
        updateLevelDisplays();
      });
    });

    elements.systemBuff.addEventListener("input", () => {
      if (isAutoNestBuffEnabled) {
        disableAutoNestBuffForManualEdit();
      }
      persist();
      render();
    });
    elements.systemBuff.addEventListener("change", () => {
      if (isAutoNestBuffEnabled) {
        disableAutoNestBuffForManualEdit();
      }
      persist();
      render();
    });

    if (elements.playerQQ) {
      const playerQQShell = elements.playerQQ.closest(".player-qq-input-shell");
      const persistPlayerQQ = () => {
        setStoredValue(storageKeys.playerQQ, getPlayerQQValue());
      };
      const syncPlayerQQ = () => {
        persistPlayerQQ();
        activePlayerData = null;
        let playerSyncResult = { changed: false, rodChanged: false };
        if (isAutoNestBuffEnabled) {
          playerSyncResult = applyLatestPlayerSnapshot();
        }
        render({ skipMapCardRebuild: !playerSyncResult.rodChanged });
      };
      elements.playerQQ.addEventListener("input", syncPlayerQQ);
      elements.playerQQ.addEventListener("change", syncPlayerQQ);

      playerQQShell?.addEventListener("click", (event) => {
        if (event.target === elements.playerQQ) {
          return;
        }
        elements.playerQQ.focus();
      });
    }

    updateBaitReminderToggleState();
    startBaitReminderMonitor();
    resetBaitReminderTiming();

    if (elements.baitReminderToggle) {
      elements.baitReminderToggle.addEventListener("change", () => {
        const enabled = Boolean(elements.baitReminderToggle?.checked);
        setBaitReminderEnabled(enabled);
        if (enabled) {
          resetBaitReminderTiming({ warmup: false });
          maybeShowBaitReminder();
        } else {
          clearBaitReminderWarmupTimeout();
          baitReminderWarmupUntil = 0;
          closeBaitReminderNotice();
        }
      });
    }

    if (elements.baitReminderThreshold) {
      const commitBaitReminderThreshold = ({ normalize = true } = {}) => {
        const nextThreshold = setBaitReminderThreshold(
          parseNumber(elements.baitReminderThreshold?.value),
        );
        if (normalize) {
          elements.baitReminderThreshold.value = String(nextThreshold);
        }
        resetBaitReminderTiming({ warmup: false });
        if (getBaitReminderEnabled()) {
          maybeShowBaitReminder();
        }
      };

      elements.baitReminderThreshold.addEventListener("input", () => {
        const value = Number.parseInt(
          elements.baitReminderThreshold?.value || "",
          10,
        );
        if (!Number.isFinite(value) || value <= 0) {
          return;
        }
        commitBaitReminderThreshold({ normalize: false });
      });
      elements.baitReminderThreshold.addEventListener("change", () => {
        commitBaitReminderThreshold();
      });
    }

    if (elements.baitReminderNoticeClose) {
      elements.baitReminderNoticeClose.addEventListener("click", () => {
        closeBaitReminderNotice();
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        maybeShowBaitReminder();
      }
    });

    if (elements.mapCardList) {
      elements.mapCardList.addEventListener("click", (event) => {
        const weatherButton = event.target.closest("[data-weather-step]");
        if (weatherButton) {
          event.stopPropagation();
          const mapLevel = weatherButton.dataset.weatherMap;
          const mapId = weatherButton.dataset.weatherMapId;
          const stepValue = parseNumber(weatherButton.dataset.weatherStep);
          const currentWeather = getWeatherForMap(mapLevel, mapId);
          const nextType = getWeatherCycleType(currentWeather.type, stepValue);
          setWeatherOverrideForMap(mapLevel, nextType);
          disableAutoNestBuffForManualEdit();
          render({ skipMapCardRebuild: true });
          return;
        }

        const stepButton = event.target.closest("[data-bait-buff-step]");
        if (stepButton) {
          event.stopPropagation();
          const stepCard = stepButton.closest(".map-card");
          if (stepCard?.dataset.mapDisabled === "true") {
            return;
          }
          const mapId =
            stepButton.dataset.baitBuffMapId || stepButton.dataset.baitBuffMap;
          const stepValue = parseNumber(stepButton.dataset.baitBuffStep);
          const current = getBaitBuffForMap(mapId);
          const next = Math.max(0, current + stepValue);
          setBaitBuffForMap(mapId, next === 0 ? "" : String(next));
          disableAutoNestBuffForManualEdit();
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

    if (elements.autoNestBuffSwitch) {
      elements.autoNestBuffSwitch.addEventListener("change", () => {
        if (elements.autoNestBuffSwitch.checked) {
          startAutoNestBuff();
          return;
        }

        stopAutoNestBuff();
        render({ skipMapCardRebuild: true });
      });
    }

    if (elements.openCollectionModal) {
      elements.openCollectionModal.addEventListener("click", () => {
        openCollectionModal();
      });
    }

    if (elements.openLeaderboardModal) {
      elements.openLeaderboardModal.addEventListener("click", () => {
        openLeaderboardModal();
      });
    }

    if (elements.leaderboardModal) {
      elements.leaderboardModal.addEventListener("click", (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-collection-close]")
        ) {
          closeLeaderboardModal();
        }
      });

      elements.leaderboardModal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeLeaderboardModal();
        }
      });
    }

    if (elements.leaderboardTypeList) {
      elements.leaderboardTypeList.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-leaderboard-type]");
        if (!btn) return;
        const typeKey = btn.dataset.leaderboardType;
        if (!typeKey) return;
        leaderboardActiveType = typeKey;
        renderLeaderboardSummaryBadge();
        renderLeaderboardTypes();
        renderLeaderboardList();
      });
    }

    if (elements.leaderboardList) {
      elements.leaderboardList.addEventListener("click", (event) => {
        const row = event.target.closest(".leaderboard-row");
        if (!row) return;
        const userId = row.dataset.userId;
        if (!userId) return;
        // focus or highlight logic could be added here
      });
    }

    if (elements.collectionModal) {
      elements.collectionModal.addEventListener("click", (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-collection-close]")
        ) {
          closeCollectionModal();
        }
      });

      elements.collectionModal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCollectionModal();
        }
      });
    }

    if (elements.collectionMapList) {
      elements.collectionMapList.addEventListener("click", (event) => {
        const dot = getCollectionDotFromEvent(event);
        if (!dot) {
          return;
        }

        if (Date.now() < suppressCollectionClickUntil) {
          event.preventDefault();
          return;
        }

        toggleCollectionDot(dot);
      });

      elements.collectionMapList.addEventListener(
        "pointerdown",
        handleCollectionPointerDown,
      );
      elements.collectionMapList.addEventListener(
        "pointermove",
        handleCollectionPointerMove,
      );
      elements.collectionMapList.addEventListener(
        "pointerup",
        handleCollectionPointerUp,
      );
      elements.collectionMapList.addEventListener(
        "pointercancel",
        handleCollectionPointerCancel,
      );
    }

    persist();
    renderCollectionProgress();
    setAutoNestBuffSwitchState(false);

    if (isAutoNestBuffEnabled) {
      startAutoNestBuff({ persist: false });
    }

    if (!isAutoNestBuffEnabled) {
      stopWeatherTooltipRefresh();
    }

    render();
  }

  initialize();
})();
