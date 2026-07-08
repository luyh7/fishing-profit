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
  const collectionRarities = [...baseRarityOrder].reverse().concat("UTR");
  const nestBuffSourceUrl = config.nestBuffSourceUrl || "./nest-buff.json";
  const nestBuffAutoRefreshIntervalMs = 1 * 60 * 1000;
  const collectionLongPressMs = 280;
  const catParadiseConfig = config.catParadise || {};
  const catParadiseMapId = normalizeMapId(catParadiseConfig.mapId || "S1");
  const catParadiseCollectionIndex = Number.isInteger(
    Number(catParadiseConfig.collectionIndex),
  )
    ? Number(catParadiseConfig.collectionIndex)
    : 20;
  const catParadiseBuildings = Array.isArray(catParadiseConfig.buildings)
    ? catParadiseConfig.buildings
    : [];
  const catParadiseMaxOpenLevel = Number.isFinite(
    Number(catParadiseConfig.maxOpenLevel),
  )
    ? Number(catParadiseConfig.maxOpenLevel)
    : 1;
  const storageKeys = {
    hookLevel: "fish_calculator_hook_level",
    rodLevel: "fish_calculator_rod_level",
    systemBuff: "fish_calculator_system_buff",
    mapLevel: "fish_calculator_map_level",
    mapId: "fish_calculator_map_id",
    baitBuffByMap: "fish_calculator_bait_buff_by_map",
    weatherOverrideByMap: "fish_calculator_weather_override_by_map_v2",
    catBuildingLevels: "fish_calculator_cat_building_levels",
    autoNestBuff: "fish_calculator_auto_nest_buff",
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
        right.achievementPoints - left.achievementPoints ||
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
        right.achievementPoints - left.achievementPoints ||
        left.userId.localeCompare(right.userId, "zh-CN", { numeric: true }),
    },
    {
      key: "achievement",
      label: "成就榜",
      subtitle: "按成就点数排序",
      metricLabel: "成就点数",
      formatPrimaryValue: (entry) =>
        entry.achievementPoints > 0
          ? `成就点数 ${formatNumber(entry.achievementPoints, 0)}`
          : "",
      compare: (left, right) =>
        right.achievementPoints - left.achievementPoints ||
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
    collectionSetting: document.getElementById("collectionSetting"),
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
    catBuildingsModal: document.getElementById("catBuildingsModal"),
    catBuildingsSummary: document.getElementById("catBuildingsSummary"),
    catBuildingsList: document.getElementById("catBuildingsList"),
    versionBadge: document.getElementById("versionBadge"),
    mapCardList: document.getElementById("mapCardList"),
    selectedMapName: document.getElementById("selectedMapName"),
    selectedMapDelta: document.getElementById("selectedMapDelta"),
    selectedFishPrice: document.getElementById("selectedFishPrice"),
    selectedMapProbability: document.getElementById("selectedMapProbability"),
    selectedBestBait: document.getElementById("selectedBestBait"),
    selectedBestNet: document.getElementById("selectedBestNet"),
    autoNestBuffSwitches: Array.from(
      document.querySelectorAll("[data-auto-nest-buff-switch]"),
    ),
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

  function normalizeMapId(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  function getMapId(map) {
    return normalizeMapId(map?.id);
  }

  function getMapDisplayCode(map) {
    return getMapId(map) || "-";
  }

  function compareMapIdsForDisplay(left, right) {
    const leftId = normalizeMapId(
      left && typeof left === "object" ? left.id : left,
    );
    const rightId = normalizeMapId(
      right && typeof right === "object" ? right.id : right,
    );
    const leftIsNumeric = /^\d+$/.test(leftId);
    const rightIsNumeric = /^\d+$/.test(rightId);

    if (leftIsNumeric && rightIsNumeric) {
      return Number.parseInt(leftId, 10) - Number.parseInt(rightId, 10);
    }
    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }

    return leftId.localeCompare(rightId, "zh-CN", { numeric: true });
  }

  function getMapIndexById(mapId) {
    const normalizedMapId = normalizeMapId(mapId);
    if (!normalizedMapId) {
      return -1;
    }

    return config.maps.findIndex((map) => getMapId(map) === normalizedMapId);
  }

  function getMapAchievementId(map, mapIndex) {
    return getMapId(map) || String(mapIndex + 1);
  }

  function getMapCollectionIndex(map, mapIndex) {
    return isCatParadiseMap(map) ? catParadiseCollectionIndex : mapIndex;
  }

  function getMapCardElement(mapId) {
    if (!elements.mapCardList) {
      return null;
    }

    const normalizedMapId = normalizeMapId(mapId);
    return (
      Array.from(
        elements.mapCardList.querySelectorAll(".map-card[data-map-id]"),
      ).find((card) => card.dataset.mapId === normalizedMapId) || null
    );
  }

  function parseCollectionValue(value) {
    if (typeof value === "bigint") {
      return value >= 0n ? value : 0n;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value) || value <= 0) {
        return 0n;
      }

      return BigInt(Math.trunc(value));
    }

    const text = String(value ?? "");
    const decimalText = text.trim();
    if (/^\d+$/.test(decimalText)) {
      try {
        return BigInt(decimalText);
      } catch (_error) {
        return 0n;
      }
    }

    let collectionValue = 0n;
    for (let index = 0; index < text.length; index += 1) {
      const chunk = text.charCodeAt(index) - 32;
      if (chunk < 0 || chunk > 63) {
        return 0n;
      }
      collectionValue |= BigInt(chunk) << BigInt(index * 6);
    }

    return collectionValue;
  }

  function parseNestBuffPayload(text) {
    // Preserve collection bitmaps before JSON.parse can round large integers.
    const quoteIntegerTokens = (value) => {
      let result = "";
      let index = 0;
      let inString = false;
      let escaped = false;

      while (index < value.length) {
        const char = value[index];
        if (inString) {
          result += char;
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === '"') {
            inString = false;
          }
          index += 1;
          continue;
        }

        if (char === '"') {
          inString = true;
          result += char;
          index += 1;
          continue;
        }

        if (char === "-" || (char >= "0" && char <= "9")) {
          const start = index;
          index += 1;
          while (/[0-9.eE+-]/.test(value[index] || "")) {
            index += 1;
          }
          const token = value.slice(start, index);
          result += /^-?(?:0|[1-9]\d*)$/.test(token)
            ? `"${token}"`
            : token;
          continue;
        }

        result += char;
        index += 1;
      }

      return result;
    };

    const normalizedText = String(text).replace(
      /("collections"\s*:\s*)\[([^\]]*)\]/g,
      (_match, prefix, body) => `${prefix}[${quoteIntegerTokens(body)}]`,
    );

    return JSON.parse(normalizedText);
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
      effectText: "有概率钓出UTR",
      multiplier: 1,
      baitCostMultiplier: 1,
    },
    cat: {
      label: "猫",
      emoji: "🐱",
      effectText: "哈基米把你的鱼吃掉了！",
      detailText:
        "哈基米是好基米，吃掉你的鱼时也会送上一份礼物，哈基米的礼物价值不可估量！",
      multiplier: 1,
      baitCostMultiplier: 1,
    },
  };

  const lostWindUtrBaseProbability = 0.2;
  const lostWindUtrDeltaStepProbability = 0.1;
  const lostWindUtrPityCount = 150;

  const weatherTypeAliases = {
    猫: "cat",
  };

  const weatherCycleTypes = [
    "sunny",
    "rain",
    "storm",
    "meteor",
    "lost_wind",
    "cat",
  ];

  function normalizeWeatherType(type) {
    if (typeof type !== "string") {
      return "sunny";
    }

    const trimmedType = type.trim();
    if (!trimmedType) {
      return "sunny";
    }

    return weatherTypeAliases[trimmedType] || trimmedType;
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
    const key = normalizeMapId(mapId) || String(mapLevel);
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

  function getBoostedWeatherEffectFactor(weatherBoostPercent) {
    return 1 + Math.max(0, parseNumber(weatherBoostPercent)) / 100;
  }

  function getWeatherMultiplier(weather, weatherBoostPercent = 0) {
    const type = normalizeWeatherType(weather?.type);
    const meta = getWeatherMeta(type);
    if (type === "rain" && !isWeatherEffectivelyInactive(weather)) {
      const baseMultiplier = Number.isFinite(meta.multiplier)
        ? meta.multiplier
        : 1;
      return 1 + (baseMultiplier - 1) * getBoostedWeatherEffectFactor(weatherBoostPercent);
    }

    return 1;
  }

  function getWeatherBaitCostMultiplier(weather, weatherBoostPercent = 0) {
    const type = normalizeWeatherType(weather?.type);
    const meta = getWeatherMeta(type);
    if (isWeatherEffectivelyInactive(weather)) {
      return 1;
    }

    const baseMultiplier = Number.isFinite(meta.baitCostMultiplier)
      ? meta.baitCostMultiplier
      : 1;
    if (type !== "storm") {
      return baseMultiplier;
    }

    const savingRate = Math.max(0, 1 - baseMultiplier);
    return Math.max(
      0,
      1 - savingRate * getBoostedWeatherEffectFactor(weatherBoostPercent),
    );
  }

  function adjustMeteorProbabilityProfile(profile, weatherBoostPercent = 0) {
    const activeRarities = baseRarityOrder.filter(
      (rarity) => parseNumber(profile?.[rarity]) > 0,
    );

    if (activeRarities.length < 2) {
      return profile;
    }

    const highestRarity = activeRarities[0];
    const secondHighestRarity = activeRarities[1];
    const secondProbability = parseNumber(profile?.[secondHighestRarity]);
    const shift = Math.min(
      2 * getBoostedWeatherEffectFactor(weatherBoostPercent),
      secondProbability,
    );

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

  function getLostWindBaseUtrProbability(rodLevel, mapDifficulty) {
    const sceneLevel = parseNumber(mapDifficulty) + 1;
    const levelDelta = Math.max(0, parseNumber(rodLevel) - sceneLevel);
    return Math.min(
      100,
      lostWindUtrBaseProbability +
        levelDelta * lostWindUtrDeltaStepProbability,
    );
  }

  function getLostWindEffectiveUtrProbability(baseProbability) {
    const baseRate = Math.max(0, Math.min(100, parseNumber(baseProbability))) / 100;
    const pityCount = Math.max(1, Math.floor(lostWindUtrPityCount));
    if (baseRate <= 0) {
      return 0;
    }

    if (baseRate >= 1) {
      return 100;
    }

    const cycleHitProbability = 1 - Math.pow(1 - baseRate, pityCount);
    if (cycleHitProbability <= 0) {
      return baseRate * 100;
    }

    return Math.min(100, (baseRate / cycleHitProbability) * 100);
  }

  function getCatAdjustedLostWindUtrProbability(rodLevel, mapDifficulty, effects) {
    const bonusChance =
      Math.max(0, Math.min(100, parseNumber(effects?.rodLevelBonusChancePercent))) /
      100;
    const baseProbability = getLostWindBaseUtrProbability(rodLevel, mapDifficulty);
    if (bonusChance <= 0) {
      return getLostWindEffectiveUtrProbability(baseProbability);
    }

    const bonusProbability = getLostWindBaseUtrProbability(
      parseNumber(rodLevel) + 1,
      mapDifficulty,
    );
    return (
      getLostWindEffectiveUtrProbability(baseProbability) * (1 - bonusChance) +
      getLostWindEffectiveUtrProbability(bonusProbability) * bonusChance
    );
  }

  function getWeatherAdjustedProbabilityProfile(
    profile,
    weather,
    weatherBoostPercent = 0,
    lostWindUtrProbability = 0,
  ) {
    const type = normalizeWeatherType(weather?.type);
    if (isWeatherEffectivelyInactive(weather)) {
      return profile;
    }

    if (type === "meteor") {
      return adjustMeteorProbabilityProfile(profile, weatherBoostPercent);
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

    const utrProbability = Math.max(
      0,
      Math.min(100, parseNumber(lostWindUtrProbability)),
    );

    if (baseTotal <= 0) {
      return config.rarityOrder.reduce((adjustedProfile, rarity) => {
        adjustedProfile[rarity] = rarity === "UTR" ? utrProbability : 0;
        return adjustedProfile;
      }, {});
    }

    const scale = (100 - utrProbability) / baseTotal;
    const adjustedProfile = {};
    baseRarityOrder.forEach((rarity) => {
      adjustedProfile[rarity] = baseProfile[rarity] * scale;
    });
    adjustedProfile.UTR = utrProbability;

    return adjustedProfile;
  }

  function getStormRemainingBaitCount(
    endTime,
    intervalHours,
    baitCostMultiplier,
    now = Date.now(),
  ) {
    if (
      !Number.isFinite(endTime) ||
      !Number.isFinite(intervalHours) ||
      intervalHours <= 0
    ) {
      return Number.NaN;
    }

    const remainingMs = endTime - now;
    if (remainingMs <= 0) {
      return 0;
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    const baitMultiplier = Number.isFinite(baitCostMultiplier)
      ? baitCostMultiplier
      : 1;
    return Math.ceil((remainingMs / intervalMs) * baitMultiplier);
  }

  function getStormBaitConsumptionRate(intervalHours, baitCostMultiplier) {
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      return Number.NaN;
    }

    const baitMultiplier = Number.isFinite(baitCostMultiplier)
      ? baitCostMultiplier
      : 1;
    return baitMultiplier / intervalHours;
  }

  function getStormRemainingBaitLineHtml(weather, bestBaitRow) {
    const type = normalizeWeatherType(weather?.type);
    const endTime = parseWeatherTime(weather?.end_time);
    const intervalHours = bestBaitRow?.intervalHours;
    const baitCostMultiplier = Number.isFinite(bestBaitRow?.baitCostMultiplier)
      ? bestBaitRow.baitCostMultiplier
      : getWeatherBaitCostMultiplier(weather);
    const baitName = String(bestBaitRow?.bait?.name || "鱼饵").trim() || "鱼饵";
    const isActiveStorm =
      type === "storm" &&
      !isManualWeather(weather) &&
      isAutoNestBuffEffectivelyEnabled() &&
      !isWeatherPending(weather) &&
      !isExpiredWeather(weather) &&
      !isWeatherEffectivelyInactive(weather) &&
      Number.isFinite(endTime);

    if (!isActiveStorm) {
      return "";
    }

    const baitCount = getStormRemainingBaitCount(
      endTime,
      intervalHours,
      baitCostMultiplier,
    );
    if (!Number.isFinite(baitCount)) {
      return "";
    }

    const consumptionRate = getStormBaitConsumptionRate(
      intervalHours,
      baitCostMultiplier,
    );
    if (!Number.isFinite(consumptionRate)) {
      return "";
    }

    return `<div class="weather-tooltip-bait" data-storm-bait-line><div>预计还需<span data-storm-bait-count data-weather-end-time="${endTime}" data-weather-interval-hours="${intervalHours}" data-weather-bait-cost-multiplier="${baitCostMultiplier}">${formatNumber(baitCount, 0)}</span>个${escapeHtml(baitName)}</div><div>消耗速率${formatNumber(consumptionRate, 2)}个/h</div></div>`;
  }

  function getWeatherTooltipContent(weather, row = null) {
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

    if (meta.detailText) {
      lines.push(`<div class="tooltip-title">${meta.detailText}</div>`);
    }

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
    const stormBaitLine = getStormRemainingBaitLineHtml(
      weather,
      row?.bestBaitRow,
    );
    if (stormBaitLine) {
      lines.push(stormBaitLine);
    }

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
    let shouldRenderWeatherTransition = false;
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

        const weatherCard = countdownEl.closest(".map-card-weather");
        if (
          weatherCard &&
          weatherCard.classList.contains("is-expired") !== isExpired
        ) {
          shouldRenderWeatherTransition = true;
        }
        weatherCard?.classList.toggle("is-expired", isExpired);
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
        if (
          weatherCard &&
          weatherCard.classList.contains("is-pending") !== isPending
        ) {
          shouldRenderWeatherTransition = true;
        }
        elapsedEl.classList.toggle("is-pending", isPending);
        weatherCard?.classList.toggle("is-pending", isPending);
      });

    elements.mapCardList
      .querySelectorAll("[data-storm-bait-count]")
      .forEach((baitCountEl) => {
        const endTime = Number.parseInt(
          baitCountEl.dataset.weatherEndTime || "",
          10,
        );
        const intervalHours = parseNumber(
          baitCountEl.dataset.weatherIntervalHours,
        );
        const baitCostMultiplier = parseNumber(
          baitCountEl.dataset.weatherBaitCostMultiplier,
        );
        const baitLine = baitCountEl.closest("[data-storm-bait-line]");
        const remainingMs = endTime - now;
        if (!Number.isFinite(endTime) || remainingMs <= 0) {
          if (baitLine) {
            baitLine.hidden = true;
          }
          return;
        }

        const baitCount = getStormRemainingBaitCount(
          endTime,
          intervalHours,
          baitCostMultiplier,
          now,
        );
        if (!Number.isFinite(baitCount)) {
          if (baitLine) {
            baitLine.hidden = true;
          }
          return;
        }

        if (baitLine) {
          baitLine.hidden = false;
        }
        baitCountEl.textContent = formatNumber(baitCount, 0);
      });

    if (shouldRenderWeatherTransition) {
      render({ skipMapCardRebuild: true });
    }
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
      const mapKey = getMapId(map);
      const currentWeather = getWeatherForMap(map.difficulty, map.id);
      nextWeatherOverrides[mapKey] = normalizeWeatherType(
        currentWeather?.type,
      );
    });

    weatherOverrideByMap = nextWeatherOverrides;
    persistWeatherOverrides();
  }

  function setWeatherOverrideForMap(mapId, weatherType) {
    const key = normalizeMapId(mapId);
    if (!key) {
      return;
    }

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
    const tooltip = getWeatherTooltipContent(weather, row);
    const mapId = escapeHtml(getMapId(row.map));
    return `
      <div class="${getWeatherBadgeClass(weather)} has-tooltip" data-map-weather="${row.map.difficulty}" data-map-id="${mapId}">
        <button type="button" class="weather-step-btn" data-weather-step="-1" data-weather-map="${row.map.difficulty}" data-weather-map-id="${mapId}" aria-label="切换到前一个天气">‹</button>
        <span class="weather-emoji" aria-hidden="true">${getWeatherMeta(weather.type).emoji}</span>
        <button type="button" class="weather-step-btn" data-weather-step="1" data-weather-map="${row.map.difficulty}" data-weather-map-id="${mapId}" aria-label="切换到下一个天气">›</button>
        <div class="tooltip" data-map-weather-tooltip="${mapId}">${tooltip}</div>
      </div>
    `;
  }

  function buildMapCardBadgesHtml(row, isBest) {
    return buildWeatherControlHtml(row);
  }

  function buildCatBuildingsButtonHtml(row) {
    return isCatParadiseMap(row.map)
      ? `<button type="button" class="cat-buildings-btn" data-cat-buildings-open aria-label="猫猫乐园建设" title=""><span class="cat-buildings-open-icon" aria-hidden="true">🏠</span></button>`
      : "";
  }

  function buildMapCardCodeHtml(map) {
    const collectionCrown = hasPlayerAchievementForMap(map.id)
      ? `<span class="map-card-crown has-tooltip" aria-label="全收集"><svg class="map-card-crown-icon" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M3 17.5h18l-1.4-11.2-5.2 4.4L12 3.2 9.6 10.7 4.4 6.3 3 17.5Z"></path></svg><span class="tooltip">全收集</span></span>`
      : "";
    return `<span class="map-card-code">${escapeHtml(getMapDisplayCode(map))}${collectionCrown}</span>`;
  }

  function buildCollectionMapCodeHtml(map) {
    return `<span class="map-card-code collection-map-code">${escapeHtml(getMapDisplayCode(map))}</span>`;
  }

  function getHighestCatchableRarity(profile) {
    return (
      config.rarityOrder.find((rarity) => parseNumber(profile?.[rarity]) > 0) ||
      ""
    );
  }

  function isMapRarityFullyCollected(map, rarity) {
    const fishes = getMapFishes(map);
    if (!rarity || !fishes.length) {
      return false;
    }

    return fishes.every((fish) =>
      isFishRarityCollected(getFishCollectionKey(map, fish), rarity),
    );
  }

  function getMapCardCollectionTargetRarity(row) {
    if (
      !activePlayerData ||
      !Array.isArray(activePlayerData.collections) ||
      !row?.isSelectable
    ) {
      return "";
    }

    const highestRarity = getHighestCatchableRarity(row.profile);
    if (!highestRarity) {
      return "";
    }

    return isMapRarityFullyCollected(row.map, highestRarity)
      ? ""
      : highestRarity;
  }

  function getMapCardCollectionAttributes(row) {
    const targetRarity = getMapCardCollectionTargetRarity(row);
    if (!targetRarity) {
      return {
        className: "",
        attributes: "",
      };
    }

    return {
      className: " has-collection-target",
      attributes:
        ` data-map-collection-rarity="${escapeHtml(targetRarity)}"` +
        ` style="--map-card-collection-border: ${rarityColorWithAlpha(targetRarity, 0.32)};"` +
        ` title="${escapeHtml(`${targetRarity} 未集齐`)}"`,
    };
  }

  function applyMapCardCollectionVisual(cardEl, row) {
    if (!cardEl) {
      return;
    }

    const targetRarity = getMapCardCollectionTargetRarity(row);
    cardEl.classList.toggle("has-collection-target", Boolean(targetRarity));
    if (!targetRarity) {
      delete cardEl.dataset.mapCollectionRarity;
      cardEl.style.removeProperty("--map-card-collection-fill");
      cardEl.style.removeProperty("--map-card-collection-border");
      cardEl.removeAttribute("title");
      return;
    }

    cardEl.dataset.mapCollectionRarity = targetRarity;
    cardEl.style.removeProperty("--map-card-collection-fill");
    cardEl.style.setProperty(
      "--map-card-collection-border",
      rarityColorWithAlpha(targetRarity, 0.32),
    );
    cardEl.title = `${targetRarity} 未集齐`;
  }

  function buildSelectedMapTitleHtml(map) {
    return `<span class="map-card-code selected-map-code">${escapeHtml(getMapDisplayCode(map))}</span><span class="selected-map-name-text">${escapeHtml(map.name)}</span>`;
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

  function getCatBuildingConfiguredMaxLevel(building) {
    const levels = Array.isArray(building?.levels) ? building.levels : [];
    return levels.reduce(
      (maxLevel, item) => Math.max(maxLevel, Number.parseInt(item.level, 10) || 0),
      0,
    );
  }

  function getOrderedCatParadiseBuildings() {
    return catParadiseBuildings.slice().sort(
      (left, right) =>
        (Number.parseInt(left.order, 10) || 0) -
        (Number.parseInt(right.order, 10) || 0),
    );
  }

  function getCatBuildingMaxLevel(building) {
    return Math.min(
      catParadiseMaxOpenLevel,
      getCatBuildingConfiguredMaxLevel(building),
    );
  }

  function normalizeCatBuildingLevel(building, rawValue) {
    const level = Number.parseInt(rawValue, 10);
    return Math.max(
      0,
      Math.min(getCatBuildingMaxLevel(building), Number.isFinite(level) ? level : 0),
    );
  }

  function loadCatBuildingLevels() {
    const raw = getStoredValue(storageKeys.catBuildingLevels);
    let parsed = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (_error) {
        parsed = {};
      }
    }

    return getOrderedCatParadiseBuildings().reduce((normalized, building) => {
      normalized[building.id] = normalizeCatBuildingLevel(
        building,
        parsed?.[building.id],
      );
      return normalized;
    }, {});
  }

  function persistCatBuildingLevels() {
    setStoredValue(
      storageKeys.catBuildingLevels,
      JSON.stringify(catBuildingLevels),
    );
  }

  function getCatBuildingLevel(buildingId) {
    return Number.parseInt(catBuildingLevels?.[buildingId], 10) || 0;
  }

  function buildCatBuildingLevelsFromPlayer(player) {
    if (!player || player.cat_park === null || player.cat_park === undefined) {
      return null;
    }

    const rawCatPark = Array.isArray(player.cat_park)
      ? player.cat_park
      : String(player.cat_park).trim().split("");
    if (!rawCatPark.length) {
      return null;
    }

    return getOrderedCatParadiseBuildings().reduce(
      (levels, building, index) => {
        levels[building.id] = normalizeCatBuildingLevel(
          building,
          rawCatPark[index],
        );
        return levels;
      },
      {},
    );
  }

  function applyPlayerCatPark(player) {
    const nextLevels = buildCatBuildingLevelsFromPlayer(player);
    if (!nextLevels) {
      return { changed: false };
    }

    let changed = false;
    const mergedLevels = { ...catBuildingLevels };
    getOrderedCatParadiseBuildings().forEach((building) => {
      const nextLevel = normalizeCatBuildingLevel(
        building,
        nextLevels[building.id],
      );
      if (getCatBuildingLevel(building.id) !== nextLevel) {
        changed = true;
      }
      mergedLevels[building.id] = nextLevel;
    });

    if (changed) {
      catBuildingLevels = mergedLevels;
      persistCatBuildingLevels();
      refreshCatBuildingsModalIfOpen();
    }

    return { changed };
  }

  function isCatParadiseMap(mapOrId) {
    const mapId =
      mapOrId && typeof mapOrId === "object" ? getMapId(mapOrId) : mapOrId;
    return normalizeMapId(mapId) === catParadiseMapId;
  }

  function addCatEffectValues(target, effects) {
    if (!effects || typeof effects !== "object") {
      return target;
    }

    Object.entries(effects).forEach(([key, value]) => {
      const numericValue = parseNumber(value);
      if (numericValue === 0) {
        return;
      }

      target[key] = parseNumber(target[key]) + numericValue;
    });
    return target;
  }

  function getCatParadiseBuildingEffects() {
    return catParadiseBuildings.reduce((effects, building) => {
      addCatEffectValues(effects, building.baseEffects);
      const level = getCatBuildingLevel(building.id);
      const levelConfigs = Array.isArray(building.levels)
        ? building.levels
        : [];
      levelConfigs
        .filter((item) => Number.parseInt(item.level, 10) <= level)
        .sort(
          (left, right) =>
            (Number.parseInt(left.level, 10) || 0) -
            (Number.parseInt(right.level, 10) || 0),
        )
        .forEach((item) => addCatEffectValues(effects, item.effects));
      return effects;
    }, {});
  }

  function getGlobalCatBuildingEffects() {
    const effects = getCatParadiseBuildingEffects();
    return {
      rodLevelBonus: effects.rodLevelBonus,
    };
  }

  function getCatParadiseEffectsForMap(map) {
    return isCatParadiseMap(map) ? getCatParadiseBuildingEffects() : {};
  }

  function isCollectionBitCollected(collectionValue, bitIndex) {
    const normalizedValue = parseCollectionValue(collectionValue);
    if (normalizedValue <= 0n || bitIndex < 0) {
      return false;
    }

    return ((normalizedValue >> BigInt(bitIndex)) & 1n) === 1n;
  }

  function buildFishCollectionFromPlayer(player) {
    const collectionValues = Array.isArray(player?.collections)
      ? player.collections
      : [];

    return config.maps.reduce((normalized, map, mapIndex) => {
      const collectionIndex = getMapCollectionIndex(map, mapIndex);
      const mapCollectionValue = parseCollectionValue(
        collectionValues[collectionIndex],
      );
      if (mapCollectionValue <= 0n) {
        return normalized;
      }

      getMapFishes(map).forEach((fish, fishIndex) => {
        const fishKey = getFishCollectionKey(map, fish);
        const rarityMap = collectionRarities.reduce(
          (mapState, rarity, rarityIndex) => {
            const bitIndex =
              fishIndex * collectionRarities.length + rarityIndex;
            if (isCollectionBitCollected(mapCollectionValue, bitIndex)) {
              mapState[rarity] = true;
            }
            return mapState;
          },
          {},
        );

        if (Object.keys(rarityMap).length > 0) {
          normalized[fishKey] = rarityMap;
        }
      });

      return normalized;
    }, {});
  }

  function syncFishCollectionFromPlayer(player) {
    fishCollection = buildFishCollectionFromPlayer(player);
  }

  function updateCollectionSettingVisibility() {
    if (!elements.collectionSetting) {
      return;
    }

    const shouldShow = Boolean(isAutoNestBuffEnabled && activePlayerData);
    elements.collectionSetting.hidden = !shouldShow;
    elements.collectionSetting.classList.toggle("is-visible", shouldShow);
  }

  let baitBuffByMap = loadBaitBuffMap();
  let catBuildingLevels = loadCatBuildingLevels();
  let fishCollection = {};
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
  const achievementTooltipState = {
    entries: new Map(),
    hoverTrigger: null,
    repositionFrameId: 0,
  };
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

  function getAutoNestBuffSwitches() {
    const switches = Array.from(
      document.querySelectorAll("[data-auto-nest-buff-switch]"),
    );
    elements.autoNestBuffSwitches = switches;
    return switches;
  }

  function setAutoNestBuffSwitchState(isLoading = false) {
    getAutoNestBuffSwitches().forEach((switchElement) => {
      switchElement.checked = isAutoNestBuffEnabled;
      switchElement.setAttribute(
        "aria-checked",
        String(isAutoNestBuffEnabled),
      );
      switchElement
        .closest(".auto-nest-buff-switch")
        ?.classList.toggle("is-loading", isLoading);
    });
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
    fishCollection = {};
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
    fishCollection = {};
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
      render({
        skipMapCardRebuild:
          !snapshotResult.rodChanged && !snapshotResult.catParkChanged,
      });
      return;
    }

    startInterval();
    startWeatherTooltipRefresh();
    render({
      skipMapCardRebuild:
        !snapshotResult.rodChanged && !snapshotResult.catParkChanged,
    });
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
      const rodLevelBonus = getGlobalRodLevelBonus();
      elements.rodLevelDisplay.innerHTML =
        `<span>Lv.${formatNumber(rodVal, 0)}</span>` +
        (rodLevelBonus > 0
          ? `<span class="select-level-bonus">+${formatNumber(rodLevelBonus, 0)}</span>`
          : "");
    }
  }

  function applyPlayerLevels(player) {
    if (!player) {
      return { changed: false, rodChanged: false, catParkChanged: false };
    }

    let changed = false;
    let rodChanged = false;
    let catParkChanged = false;
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

      const catParkResult = applyPlayerCatPark(player);
      catParkChanged = catParkResult.changed;
      changed = changed || catParkChanged;
    } finally {
      isApplyingAutoPlayerData = false;
    }

    updateLevelDisplays();
    return { changed, rodChanged, catParkChanged };
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
      fishCollection = {};
      setPlayerQQError("");
      return { changed: false, rodChanged: false, catParkChanged: false };
    }

    activePlayerData = findPlayerData(payload);
    if (activePlayerData) {
      syncFishCollectionFromPlayer(activePlayerData);
      setPlayerQQError("");
      return applyPlayerLevels(activePlayerData);
    }

    fishCollection = {};
    setPlayerQQError(`未在数据中找到 QQ 号 ${playerQQ}`);
    return { changed: false, rodChanged: false, catParkChanged: false };
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
      const mapId = normalizeMapId(location?.id);
      if (!mapId) {
        return;
      }

      const nestValue = (parseNumber(location?.buffs?.nest) + parseNumber(location?.buffs?.frame)) * 5;
      if (nestValue > 0) {
        nextBaitBuffByMap[mapId] = String(nestValue);
      }

      const weather = location?.weather;
      if (weather && typeof weather === "object") {
        nextWeatherByMap[mapId] = {
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

      const payload = parseNestBuffPayload(await response.text());
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
      render({
        skipMapCardRebuild:
          !playerSyncResult.rodChanged && !playerSyncResult.catParkChanged,
      });
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
    independentSpeedPercent = 0,
  ) {
    const hookFactor = 1 + hookSpeed;
    const baitFactor = 1 + baitSpeed + baitBuff / 100;
    const systemFactor = 1 + systemBuff / 100;
    const weatherFactor = Number.isFinite(weatherMultiplier)
      ? weatherMultiplier
      : 1;
    const independentSpeedFactor =
      1 + Math.max(0, parseNumber(independentSpeedPercent)) / 100;

    if (
      hookFactor <= 0 ||
      baitFactor <= 0 ||
      systemFactor <= 0 ||
      weatherFactor <= 0 ||
      independentSpeedFactor <= 0
    ) {
      return Number.NaN;
    }

    return (
      config.baseIntervalHours /
      hookFactor /
      baitFactor /
      systemFactor /
      weatherFactor /
      independentSpeedFactor
    );
  }

  function getProbabilityProfile(delta) {
    const probabilityByDelta = config.probabilityByDelta || {};
    const deltas = Object.keys(probabilityByDelta)
      .map((key) => Number.parseInt(key, 10))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (!deltas.length) {
      return {};
    }

    const normalizedDelta = Math.floor(parseNumber(delta));
    const matchedDelta = deltas.includes(normalizedDelta)
      ? normalizedDelta
      : deltas.reduce(
          (candidate, current) =>
            current <= normalizedDelta ? current : candidate,
          deltas[0],
        );
    return probabilityByDelta[matchedDelta] || probabilityByDelta[deltas[0]];
  }

  function blendProbabilityProfiles(baseProfile, bonusProfile, chancePercent) {
    const chance = Math.max(0, Math.min(100, parseNumber(chancePercent))) / 100;
    if (chance <= 0) {
      return baseProfile;
    }

    return config.rarityOrder.reduce((profile, rarity) => {
      profile[rarity] =
        parseNumber(baseProfile?.[rarity]) * (1 - chance) +
        parseNumber(bonusProfile?.[rarity]) * chance;
      return profile;
    }, {});
  }

  function getCatAdjustedBaseProfile(delta, effects) {
    return blendProbabilityProfiles(
      getProbabilityProfile(delta),
      config.probabilityByDelta[delta + 1] || getProbabilityProfile(delta),
      effects.rodLevelBonusChancePercent,
    );
  }

  function getCatRodLevelBonus(effects) {
    return Math.max(0, Math.floor(parseNumber(effects?.rodLevelBonus)));
  }

  function getGlobalRodLevelBonus() {
    return getCatRodLevelBonus(getGlobalCatBuildingEffects());
  }

  function getEffectiveRodLevel(rodLevel) {
    return rodLevel + getGlobalRodLevelBonus();
  }

  function getCatAdjustedFishes(fishes, effects) {
    const fishPricePercent = parseNumber(effects.fishPricePercent);
    if (fishPricePercent === 0) {
      return fishes;
    }

    const priceFactor = 1 + fishPricePercent / 100;
    return fishes.map((fish) => ({
      ...fish,
      nPrice: Math.round(parseNumber(fish.nPrice) * priceFactor),
    }));
  }

  function getCatMaterialDropRate(effects) {
    return Math.max(
      0,
      Math.min(100, parseNumber(effects?.materialDropRatePercent)),
    );
  }

  function getCatMaterialValue(effects) {
    return Math.max(0, parseNumber(effects?.materialValue));
  }

  function calculateMaterialExpectedValue(materialDropRate, materialValue) {
    return (
      (getCatMaterialDropRate({ materialDropRatePercent: materialDropRate }) /
        100) *
      Math.max(0, parseNumber(materialValue))
    );
  }

  function getMaterialAdjustedProbabilityProfile(profile, materialDropRate) {
    const fishRate = Math.max(0, 1 - getCatMaterialDropRate({
      materialDropRatePercent: materialDropRate,
    }) / 100);

    if (fishRate >= 1) {
      return profile;
    }

    return config.rarityOrder.reduce((adjustedProfile, rarity) => {
      adjustedProfile[rarity] = parseNumber(profile?.[rarity]) * fishRate;
      return adjustedProfile;
    }, {});
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

  function getFishCatchProbabilityFactor(profile) {
    const totalProbability = config.rarityOrder.reduce(
      (total, rarity) => total + parseNumber(profile?.[rarity]),
      0,
    );
    return Math.max(0, Math.min(1, totalProbability / 100));
  }

  function getBestBaitRow(baitRows) {
    return baitRows.length
      ? [...baitRows].sort((left, right) => {
          if (right.netRevenue !== left.netRevenue) {
            return right.netRevenue - left.netRevenue;
          }
          return left.bait.id - right.bait.id;
        })[0]
      : null;
  }

  function getActivePlayerEquippedBaitPrice(fallbackBait) {
    const fallbackPrice = fallbackBait ? parseNumber(fallbackBait.price) : 0;
    if (!activePlayerData) {
      return fallbackPrice;
    }

    const baitId = String(activePlayerData.bait_id ?? "").trim();
    if (baitId) {
      const baitById = config.baitList.find(
        (bait) => String(bait.id) === baitId,
      );
      if (baitById) {
        return parseNumber(baitById.price);
      }
    }

    return fallbackPrice;
  }

  function calculateHighestSameRarityFishPrice(profile, fishes) {
    const highestNPrice = (Array.isArray(fishes) ? fishes : []).reduce(
      (highest, fish) => Math.max(highest, parseNumber(fish.nPrice)),
      0,
    );

    if (highestNPrice <= 0) {
      return 0;
    }

    return config.rarityOrder.reduce((total, rarity) => {
      const probability = parseNumber(profile?.[rarity]) / 100;
      const multiplier = parseNumber(config.rarityMultipliers[rarity]);
      return total + probability * highestNPrice * multiplier;
    }, 0);
  }

  function getCatSameRarityRewardPrice(
    expectedFishPrice,
    profile,
    fishes,
    mapId,
  ) {
    if (!hasPlayerAchievementForMap(mapId)) {
      return expectedFishPrice;
    }

    return calculateHighestSameRarityFishPrice(profile, fishes);
  }

  function getWeatherAdjustedExpectedFishPrice(
    expectedFishPrice,
    weather,
    fallbackBait,
    profile,
    fishes,
    mapId,
    weatherBoostPercent = 0,
  ) {
    if (!Number.isFinite(expectedFishPrice)) {
      return expectedFishPrice;
    }

    if (
      normalizeWeatherType(weather?.type) !== "cat" ||
      isWeatherEffectivelyInactive(weather)
    ) {
      return expectedFishPrice;
    }

    const weatherEffectFactor = getBoostedWeatherEffectFactor(weatherBoostPercent);
    const fishCatchProbabilityFactor = getFishCatchProbabilityFactor(profile);
    const equippedBaitPrice = getActivePlayerEquippedBaitPrice(fallbackBait);
    const sameRarityRewardPrice = getCatSameRarityRewardPrice(
      expectedFishPrice,
      profile,
      fishes,
      mapId,
    );
    const catDelta =
      expectedFishPrice * (1 - 0.15 + 0.15 * 0.3 * 0.5) +
      equippedBaitPrice * (fishCatchProbabilityFactor * 0.15 * 0.15 * 3) +
      sameRarityRewardPrice * (0.15 * 0.1) -
      expectedFishPrice;
    return expectedFishPrice + catDelta * weatherEffectFactor;
  }

  function calculateBaitRows(inputs, averageFishPrice, baitBuff) {
    const weatherMultiplier = Number.isFinite(inputs.weatherMultiplier)
      ? inputs.weatherMultiplier
      : 1;
    const baitCostMultiplier = Number.isFinite(inputs.baitCostMultiplier)
      ? inputs.baitCostMultiplier
      : 1;
    const independentSpeedPercent = parseNumber(inputs.independentSpeedPercent);
    const baitSavingPercent = Math.max(0, parseNumber(inputs.baitSavingPercent));

    return config.baitList.map((bait) => {
      const intervalHours = calculateIntervalHours(
        inputs.hookConfig.speed,
        bait.speed,
        baitBuff,
        inputs.systemBuff,
        weatherMultiplier,
        independentSpeedPercent,
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
      const baitCost =
        completedCount *
        bait.price *
        baitCostMultiplier *
        Math.max(0, 1 - baitSavingPercent / 100);
      const netRevenue = grossRevenue - baitCost;

      return {
        bait,
        intervalHours,
        theoreticalCount,
        completedCount,
        hourlyTheoreticalRevenue,
        grossRevenue,
        baitCost,
        baitCostMultiplier,
        netRevenue,
      };
    });
  }

  function calculateMapRows(inputs, rodLevel) {
    const effectiveRodLevel = getEffectiveRodLevel(rodLevel);
    return config.maps
      .filter((map) => map.difficulty <= effectiveRodLevel)
      .map((map) => {
        const catEffects = getCatParadiseEffectsForMap(map);
        const sourceFishes = getMapFishes(map);
        const fishes = getCatAdjustedFishes(sourceFishes, catEffects);
        const averageNPrice = calculateAverageNPrice(fishes);
        const delta = effectiveRodLevel - map.difficulty;
        const baseProfile = getCatAdjustedBaseProfile(delta, catEffects);
        const weather = getWeatherForMap(map.difficulty, map.id);
        const lostWindUtrProbability = getCatAdjustedLostWindUtrProbability(
          effectiveRodLevel,
          map.difficulty,
          catEffects,
        );
        const weatherProfile = getWeatherAdjustedProbabilityProfile(
          baseProfile,
          weather,
          catEffects.weatherBoostPercent,
          lostWindUtrProbability,
        );
        const materialDropRate = getCatMaterialDropRate(catEffects);
        const profile = getMaterialAdjustedProbabilityProfile(
          weatherProfile,
          materialDropRate,
        );
        const isSelectable = isMapDataSelectable(fishes, baseProfile);
        const baitBuff = getBaitBuffForMap(map.id);
        const weatherMultiplier = getWeatherMultiplier(
          weather,
          catEffects.weatherBoostPercent,
        );
        const baitCostMultiplier = getWeatherBaitCostMultiplier(
          weather,
          catEffects.weatherBoostPercent,
        );
        const baseExpectedPrice = isSelectable
          ? calculateExpectedFishPrice(profile, averageNPrice)
          : Number.NaN;
        const materialValue = getCatMaterialValue(catEffects);
        const materialExpectedValue = isSelectable
          ? calculateMaterialExpectedValue(materialDropRate, materialValue)
          : 0;
        const fallbackBaitRow = isSelectable
          ? getBestBaitRow(
              calculateBaitRows(
                {
                  ...inputs,
                  weatherMultiplier,
                  baitCostMultiplier,
                  independentSpeedPercent: catEffects.fishingSpeedPercent,
                  baitSavingPercent: catEffects.baitSavingPercent,
                },
                baseExpectedPrice,
                baitBuff,
              ),
            )
          : null;
        const expectedPrice = isSelectable
          ? getWeatherAdjustedExpectedFishPrice(
              baseExpectedPrice,
              weather,
              fallbackBaitRow?.bait || null,
              profile,
              fishes,
              map.id,
              catEffects.weatherBoostPercent,
            )
          : Number.NaN;
        const displayExpectedPrice = Number.isFinite(expectedPrice)
          ? expectedPrice + materialExpectedValue
          : expectedPrice;
        const profitExpectedPrice = Number.isFinite(expectedPrice)
          ? expectedPrice *
              (1 + Math.max(0, parseNumber(catEffects.doubleCatchPercent)) / 100) +
            materialExpectedValue
          : expectedPrice;
        const baitRows = isSelectable
          ? calculateBaitRows(
              {
                ...inputs,
                weatherMultiplier,
                baitCostMultiplier,
                independentSpeedPercent: catEffects.fishingSpeedPercent,
                baitSavingPercent: catEffects.baitSavingPercent,
              },
              profitExpectedPrice,
              baitBuff,
            )
          : [];
        const bestBaitRow = getBestBaitRow(baitRows);

        return {
          map,
          fishes,
          averageNPrice,
          delta,
          profile,
          baseExpectedPrice,
          expectedPrice,
          displayExpectedPrice,
          profitExpectedPrice,
          materialDropRate,
          materialExpectedValue,
          catEffects,
          baitBuff,
          weather,
          weatherMultiplier,
          baitCostMultiplier,
          baitRows,
          bestBaitRow,
          isSelectable,
          unavailableReason: isSelectable ? "" : "暂无数据，请等待作者更新",
          expectedDailyRevenue: bestBaitRow ? bestBaitRow.grossRevenue : 0,
        };
      })
      .sort((left, right) => compareMapIdsForDisplay(left.map, right.map));
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
    const shouldMarkMissingPrices = Boolean(
      activePlayerData && Array.isArray(activePlayerData.collections),
    );

    const rows = fishes
      .map((fish) => {
        const fishKey = getFishCollectionKey(selectedMapRow.map, fish);
        const cells = visibleRarities
          .map((rarity) => {
            const multiplier = parseNumber(config.rarityMultipliers[rarity]);
            const price = parseNumber(fish.nPrice) * multiplier;
            const isMissing =
              shouldMarkMissingPrices &&
              !isFishRarityCollected(fishKey, rarity);
            const priceClass = `tooltip-price${isMissing ? " is-missing" : ""}`;
            const priceLabel = `${fish.name} ${rarity} ${
              isMissing ? "未收集" : "已收集"
            }`;
            const priceStyle = `--rarity-color: ${rarityColor(rarity)};`;
            const priceText = `¥${formatNumber(price, 0)}`;
            return (
              `<td><span class="${priceClass}" style="${priceStyle}" ` +
              `aria-label="${escapeHtml(priceLabel)}">${priceText}</span></td>`
            );
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
      <div class="tooltip-title">${isCatParadiseMap(selectedMapRow.map) ? "各稀有度单鱼价格（已含建筑鱼价）" : "各稀有度单鱼价格"}</div>
      <table class="tooltip-table">
        <thead><tr><th>鱼种</th>${headerCells}</tr></thead>
        <tbody>${rows}${achievementRow}</tbody>
      </table>
    `;
  }

  function rarityColor(rarity) {
    switch (rarity) {
      case "UTR":
        return "#ff2d95";
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

  function hexToRgba(hexColor, alpha) {
    const normalized = String(hexColor || "")
      .trim()
      .replace(/^#/, "");
    if (normalized.length !== 6) {
      return String(hexColor || "");
    }

    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    const opacity = Number.isFinite(Number(alpha))
      ? Math.max(0, Math.min(1, Number(alpha)))
      : 1;

    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  function rarityColorWithAlpha(rarity, alpha) {
    return hexToRgba(rarityColor(rarity), alpha);
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

  function getCollectionAchievementPointWeight(rarity) {
    switch (rarity) {
      case "N":
        return 1;
      case "R":
        return 2;
      case "SR":
        return 3;
      case "SSR":
        return 4;
      case "UR":
        return 5;
      case "UTR":
        return 10;
      default:
        return 0;
    }
  }

  function getLegacyAchievementVisualStage() {
    const urIndex = collectionRarities.indexOf("UR");
    return urIndex >= 0
      ? urIndex + 1
      : Math.max(0, collectionRarities.length - 1);
  }

  function getMapAchievementPointMultiplier(mapId) {
    const normalizedMapId = normalizeMapId(mapId);
    if (isCatParadiseMap(normalizedMapId)) {
      return 20;
    }

    const numericMapId = Number.parseInt(normalizedMapId, 10);
    return /^\d+$/.test(normalizedMapId) && numericMapId > 0 ? numericMapId : 0;
  }

  function getPlayerAchievementSummary(player) {
    if (Array.isArray(player?.collections)) {
      let achievementPoints = 0;
      const collectedMapIds = [];
      const achievementMapStates = [];

      config.maps.forEach((map, mapIndex) => {
        const mapId = getMapAchievementId(map, mapIndex);
        const collectionIndex = getMapCollectionIndex(map, mapIndex);
        const mapCollectionValue = parseCollectionValue(
          player.collections[collectionIndex],
        );
        if (mapCollectionValue <= 0n) {
          achievementMapStates.push({
            mapId,
            stage: 0,
            fillRarity: "",
            isFullCollected: false,
            hasUrFullCollected: false,
            hasUtrFullCollected: false,
          });
          return;
        }

        const fishes = getMapFishes(map);
        if (!Array.isArray(fishes) || fishes.length === 0) {
          achievementMapStates.push({
            mapId,
            stage: 0,
            fillRarity: "",
            isFullCollected: false,
            hasUrFullCollected: false,
            hasUtrFullCollected: false,
          });
          return;
        }

        let mapPoints = 0;
        let stage = 0;
        let fillRarity = "";
        let hasUrFullCollected = false;
        let hasUtrFullCollected = false;
        collectionRarities.forEach((rarity, rarityIndex) => {
          const rarityPoints = getCollectionAchievementPointWeight(rarity);
          if (rarityPoints <= 0) {
            return;
          }

          const isFullyCollected = fishes.every((_, fishIndex) => {
            const bitIndex =
              fishIndex * collectionRarities.length + rarityIndex;
            return isCollectionBitCollected(mapCollectionValue, bitIndex);
          });

          if (isFullyCollected) {
            mapPoints += rarityPoints;
            fillRarity = rarity;
            if (rarity === "UR") {
              hasUrFullCollected = true;
            } else if (rarity === "UTR") {
              hasUtrFullCollected = true;
            }
            if (rarity !== "UTR") {
              stage += 1;
            }
          }
        });

        achievementMapStates.push({
          mapId,
          stage,
          fillRarity,
          isFullCollected: stage === collectionRarities.length - 1,
          hasUrFullCollected,
          hasUtrFullCollected,
        });

        if (mapPoints > 0) {
          achievementPoints += mapPoints * getMapAchievementPointMultiplier(mapId);
          collectedMapIds.push(mapId);
        }
      });

      return {
        achievementPoints,
        collectedMapIds,
        achievementMapStates,
      };
    }

    let achievementPoints = 0;
    const collectedMapIds = [];
    const achievementMapStates = config.maps.map((map, mapIndex) => {
      return {
        mapId: getMapAchievementId(map, mapIndex),
        stage: 0,
        fillRarity: "",
        isFullCollected: false,
        hasUrFullCollected: false,
        hasUtrFullCollected: false,
      };
    });
    if (Array.isArray(player?.achievements)) {
      const legacyStage = getLegacyAchievementVisualStage();
      const legacyFillRarity = collectionRarities[legacyStage - 1] || "UR";
      for (const key of player.achievements) {
        const m = String(key).match(/^collect_scene_(.+)$/);
        if (m) {
          const mapId = normalizeMapId(m[1]);
          const pointMultiplier = getMapAchievementPointMultiplier(mapId);
          if (!mapId || pointMultiplier <= 0) {
            continue;
          }

          collectedMapIds.push(mapId);
          achievementPoints += pointMultiplier;
          const state = achievementMapStates.find(
            (item) => normalizeMapId(item.mapId) === mapId,
          );
          if (state) {
            state.stage = legacyStage;
            state.fillRarity = legacyFillRarity;
            state.isFullCollected = true;
            state.hasUrFullCollected = true;
            state.hasUtrFullCollected = false;
          }
        }
      }
    }

    return {
      achievementPoints,
      collectedMapIds,
      achievementMapStates,
    };
  }

  function getPlayerAchievementPoints(player) {
    return getPlayerAchievementSummary(player).achievementPoints;
  }

  function getLeaderboardTypeConfig(typeKey) {
    return (
      leaderboardTypes.find((type) => type.key === typeKey) ||
      leaderboardTypes[0]
    );
  }

  function normalizeLeaderboardEntry(player) {
    const achievementSummary = getPlayerAchievementSummary(player);
    return {
      userId: String(player?.user_id || "").trim(),
      nickname: String(player?.nickname || "").trim(),
      rodLevel: Math.max(0, Number.parseInt(player?.rod_level, 10) || 0),
      hookLevel: Math.max(0, Number.parseInt(player?.hook_level, 10) || 0),
      achievementPoints: achievementSummary.achievementPoints,
      collectedMapIds: achievementSummary.collectedMapIds,
      achievementMapStates: achievementSummary.achievementMapStates,
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

  function getCurrentBestLeaderboardInfo() {
    return leaderboardTypes.reduce((bestInfo, typeConfig) => {
      const currentInfo = getCurrentLeaderboardInfo(typeConfig);
      if (!currentInfo) {
        return bestInfo;
      }

      const leaderboardInfo = {
        ...currentInfo,
        typeConfig,
      };

      if (!bestInfo || leaderboardInfo.rank < bestInfo.rank) {
        return leaderboardInfo;
      }

      return bestInfo;
    }, null);
  }

  function renderLeaderboardSummaryBadge() {
    if (!elements.leaderboardSummaryBadge) {
      return;
    }

    const currentInfo = getCurrentBestLeaderboardInfo();
    if (!currentInfo) {
      elements.leaderboardSummaryBadge.hidden = true;
      elements.leaderboardSummaryBadge.textContent = "";
      elements.leaderboardSummaryBadge.title = "";
      return;
    }

    const text = `最佳排名：第 ${formatNumber(currentInfo.rank, 0)}`;
    elements.leaderboardSummaryBadge.hidden = false;
    elements.leaderboardSummaryBadge.textContent = text;
    elements.leaderboardSummaryBadge.title = `${text}（${currentInfo.typeConfig.label}）`;
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

    return `collect_scene_${normalizeMapId(mapId)}`;
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

  function getCollectionFishCardVisualState(map, fish) {
    const fishKey = getFishCollectionKey(map, fish);
    const firstMissingIndex = collectionRarities.findIndex(
      (rarity) => !isFishRarityCollected(fishKey, rarity),
    );
    const isFullCollected = firstMissingIndex < 0;
    const fillRarity = isFullCollected
      ? collectionRarities[collectionRarities.length - 1] || ""
      : collectionRarities[firstMissingIndex - 1] || "";
    const fillColor = fillRarity
      ? rarityColorWithAlpha(fillRarity, 0.18)
      : "rgba(255, 255, 255, 0.055)";
    const borderColor = fillRarity
      ? rarityColorWithAlpha(fillRarity, 0.34)
      : "rgba(255, 255, 255, 0.045)";

    return {
      fishKey,
      fillRarity,
      fillColor,
      borderColor,
      isFullCollected,
    };
  }

  function buildCollectionFishCrownHtml() {
    return `<span class="collection-fish-crown has-tooltip" aria-label="全收集"><svg class="collection-fish-crown-icon" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M3 17.5h18l-1.4-11.2-5.2 4.4L12 3.2 9.6 10.7 4.4 6.3 3 17.5Z"></path></svg><span class="tooltip">全收集</span></span>`;
  }

  function setFishRarityCollected(fishKey, rarity, isCollected) {
    return;
  }

  function getCollectionStats() {
    if (!activePlayerData) {
      return { collected: 0, total: 0 };
    }

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

    if (!activePlayerData) {
      elements.collectionProgress.textContent = "-";
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
    return;
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

    if (!activePlayerData) {
      elements.collectionMapList.innerHTML = "";
      return;
    }

    renderCollectionLegend();

    elements.collectionMapList.innerHTML = config.maps
      .map((map) => {
        const fishCards = getMapFishes(map)
          .map((fish) => {
            const fishState = getCollectionFishCardVisualState(map, fish);
            const dots = collectionRarities
              .map((rarity) => {
                const isCollected = isFishRarityCollected(
                  fishState.fishKey,
                  rarity,
                );
                return `
                  <span
                    class="collection-rarity-dot ${isCollected ? "is-collected" : ""}"
                    style="--rarity-color: ${rarityColor(rarity)};"
                    data-fish-key="${escapeHtml(fishState.fishKey)}"
                    data-rarity="${escapeHtml(rarity)}"
                    data-map-name="${escapeHtml(map.name)}"
                    data-fish-name="${escapeHtml(fish.name)}"
                    data-collected="${isCollected ? "true" : "false"}"
                    role="img"
                    aria-label="${escapeHtml(`${map.name} ${fish.name} ${rarity} ${isCollected ? "已收集" : "未收集"}`)}"
                  ></span>
                `;
              })
              .join("");

            return `
              <article class="collection-fish-card${fishState.isFullCollected ? " is-full-collected" : ""}" style="--collection-card-fill: ${fishState.fillColor}; --collection-card-border: ${fishState.borderColor};">
                ${fishState.isFullCollected ? buildCollectionFishCrownHtml() : ""}
                <div class="collection-fish-name" title="${escapeHtml(fish.name)}">${escapeHtml(fish.name)}</div>
                <div class="collection-rarity-dots">${dots}</div>
              </article>
            `;
          })
          .join("");

        return `
          <section class="collection-map-row">
            <div class="collection-map-name">${buildCollectionMapCodeHtml(map)}<span class="collection-map-title-text" title="${escapeHtml(map.name)}">${escapeHtml(map.name)}</span></div>
            <div class="collection-fish-grid">${fishCards}</div>
          </section>
        `;
      })
      .join("");
  }

  function getAchievementStageRarities() {
    return collectionRarities.filter((rarity) => rarity !== "UTR");
  }

  function buildAchievementMapBoxHtml(mapId, state, options = {}) {
    const stageRarities = getAchievementStageRarities();
    const stage = Math.max(
      0,
      Math.min(stageRarities.length, Number.parseInt(state?.stage, 10) || 0),
    );
    const fillRarity =
      stage > 0 && state?.fillRarity
        ? state.fillRarity
        : stageRarities[stage - 1] || "";
    const fillColor =
      stage > 0 ? rarityColor(fillRarity) : "rgba(255, 255, 255, 0.06)";
    const fillHeight =
      stageRarities.length > 0 ? (stage / stageRarities.length) * 100 : 0;
    const isFilled = stage > 0;
    const isFull = Boolean(state?.isFullCollected || options.showCrown);
    const crown = isFull
      ? `<span class="ach-tooltip-crown"><svg class="ach-tooltip-crown-icon" viewBox="0 0 24 20" aria-hidden="true" focusable="false"><path d="M3 17.5h18l-1.4-11.2-5.2 4.4L12 3.2 9.6 10.7 4.4 6.3 3 17.5Z"></path></svg></span>`
      : "";
    const extraClass = options.className ? ` ${options.className}` : "";
    const ariaLabel = options.ariaLabel
      ? ` aria-label="${escapeHtml(options.ariaLabel)}"`
      : "";

    return `<span class="ach-tooltip-box ${isFilled ? "is-collected" : ""}${isFull ? " is-full" : ""}${extraClass}"${ariaLabel} style="--achievement-fill-color: ${fillColor}; --achievement-fill-height: ${fillHeight}%;">${crown}${escapeHtml(String(mapId))}</span>`;
  }

  function buildAchievementTooltipGrid(collectedMapIds) {
    const stageRarities = getAchievementStageRarities();
    const stateByMapId = new Map();

    if (Array.isArray(collectedMapIds)) {
      collectedMapIds.forEach((item) => {
        if (item && typeof item === "object") {
          const mapId = normalizeMapId(item.mapId ?? item.id);
          if (!mapId) {
            return;
          }

          stateByMapId.set(mapId, {
            stage: Math.max(
              0,
              Math.min(
                stageRarities.length,
                Number.parseInt(item.stage, 10) || 0,
              ),
            ),
            fillRarity: String(item.fillRarity || ""),
            isFullCollected: Boolean(item.isFullCollected || item.full),
            hasUrFullCollected: Boolean(item.hasUrFullCollected),
            hasUtrFullCollected: Boolean(item.hasUtrFullCollected),
          });
          return;
        }

        const mapId = normalizeMapId(item);
        if (mapId) {
          const legacyStage = getLegacyAchievementVisualStage();
          stateByMapId.set(mapId, {
            stage: legacyStage,
            fillRarity: collectionRarities[legacyStage - 1] || "UR",
            isFullCollected: true,
            hasUrFullCollected: true,
            hasUtrFullCollected: false,
          });
        }
      });
    }

    return config.maps
      .map((map, mapIndex) => getMapAchievementId(map, mapIndex))
      .map((mapId) => {
        const state = stateByMapId.get(mapId) || {
          stage: 0,
          fillRarity: "",
          isFullCollected: false,
          hasUrFullCollected: false,
          hasUtrFullCollected: false,
        };
        return buildAchievementMapBoxHtml(mapId, state);
      })
      .join("");
  }

  function hasUrOrUtrFullCollectedForMap(state) {
    const fillRarity = String(state?.fillRarity || "");
    return Boolean(
      state?.hasUrFullCollected ||
        state?.hasUtrFullCollected ||
        state?.isFullCollected ||
        fillRarity === "UR" ||
        fillRarity === "UTR",
    );
  }

  function buildLeaderboardMapAchievementsHtml(entry) {
    const states = Array.isArray(entry?.achievementMapStates)
      ? entry.achievementMapStates
      : [];
    const badges = states
      .filter((state) => hasUrOrUtrFullCollectedForMap(state))
      .map((state) => {
        const mapId = normalizeMapId(state?.mapId);
        return {
          state,
          mapId,
        };
      })
      .filter((item) => Boolean(item.mapId))
      .sort(
        (left, right) =>
          getMapAchievementPointMultiplier(left.mapId) -
          getMapAchievementPointMultiplier(right.mapId),
      )
      .map(({ state, mapId }) => {
        const completedRarity =
          state?.hasUtrFullCollected || state?.fillRarity === "UTR"
            ? "UTR"
            : "UR";
        const badgeState = {
          ...(state || {}),
          isFullCollected: true,
        };

        return buildAchievementMapBoxHtml(mapId, badgeState, {
          className: "leaderboard-map-achievement-box",
          showCrown: true,
          ariaLabel: `地图 ${getMapDisplayCode({ id: mapId })} 已集齐 ${completedRarity}`,
        });
      });

    return badges.length
      ? `<span class="leaderboard-map-achievements">${badges.join("")}</span>`
      : "";
  }

  function buildLeaderboardAchievementValueHtml(entry, typeConfig) {
    if (entry.achievementPoints <= 0) {
      return "";
    }

    const achievementMapStates = Array.isArray(entry.achievementMapStates)
      ? entry.achievementMapStates
      : [];
    const collectedMapIds = Array.isArray(entry.collectedMapIds)
      ? entry.collectedMapIds
      : [];
    const mapAchievements = buildLeaderboardMapAchievementsHtml(entry);

    return `<span class="has-tooltip ach-trigger leaderboard-achievement-summary" data-achievement-state='${escapeHtml(JSON.stringify(achievementMapStates))}' data-ach-maps="${escapeHtml(collectedMapIds.join(","))}">${mapAchievements}<span class="leaderboard-achievement-points">${escapeHtml(typeConfig.formatPrimaryValue(entry))}</span></span>`;
  }

  function getAchievementTooltipState(trigger) {
    let achievementState = [];
    const achievementStateRaw = trigger.dataset.achievementState || "";
    if (achievementStateRaw) {
      try {
        achievementState = JSON.parse(achievementStateRaw);
      } catch (_error) {
        achievementState = [];
      }
    }

    if (!Array.isArray(achievementState) || achievementState.length === 0) {
      const mapIds = (trigger.dataset.achMaps || "")
        .split(",")
        .filter(Boolean)
        .map(normalizeMapId);
      const legacyStage = getLegacyAchievementVisualStage();
      const legacyFillRarity = collectionRarities[legacyStage - 1] || "UR";
      achievementState = mapIds
        .filter(Boolean)
        .map((mapId) => ({
          mapId,
          stage: legacyStage,
          fillRarity: legacyFillRarity,
          isFullCollected: true,
          hasUrFullCollected: true,
          hasUtrFullCollected: false,
        }));
    }

    return achievementState;
  }

  function getLeaderboardScrollContainer() {
    return elements.leaderboardList?.closest(".collection-body") || null;
  }

  function createAchTooltipEntry(trigger, row) {
    const tooltip = document.createElement("div");
    tooltip.className = "ach-tooltip";
    tooltip.setAttribute("aria-hidden", "false");

    const grid = document.createElement("span");
    grid.className = "ach-tooltip-grid";
    tooltip.appendChild(grid);
    row.appendChild(tooltip);
    row.classList.add("has-ach-tooltip");

    return {
      trigger,
      row,
      tooltip,
      grid,
      pinned: false,
    };
  }

  function removeAchTooltipEntry(trigger) {
    const entry = achievementTooltipState.entries.get(trigger);
    if (!entry) {
      return;
    }

    trigger.classList.remove("is-tooltip-pinned");
    entry.tooltip.remove();
    entry.row?.classList.remove("has-ach-tooltip");
    achievementTooltipState.entries.delete(trigger);
    if (achievementTooltipState.hoverTrigger === trigger) {
      achievementTooltipState.hoverTrigger = null;
    }
  }

  function hideAchTooltip(trigger) {
    if (trigger instanceof Element) {
      removeAchTooltipEntry(trigger);
      return;
    }

    achievementTooltipState.entries.forEach((entry) => {
      entry.trigger.classList.remove("is-tooltip-pinned");
      entry.row?.classList.remove("has-ach-tooltip");
      entry.tooltip.remove();
    });
    achievementTooltipState.entries.clear();
    achievementTooltipState.hoverTrigger = null;
  }

  function hideHoverAchTooltip() {
    const hoverTrigger = achievementTooltipState.hoverTrigger;
    if (!hoverTrigger) {
      return;
    }

    const entry = achievementTooltipState.entries.get(hoverTrigger);
    if (entry && !entry.pinned) {
      removeAchTooltipEntry(hoverTrigger);
    }
    achievementTooltipState.hoverTrigger = null;
  }

  function positionAchTooltipEntry(entry) {
    const { tooltip, trigger, row } = entry;
    if (!tooltip || !trigger || !row) {
      return;
    }

    if (!document.body.contains(trigger) || !document.body.contains(row)) {
      removeAchTooltipEntry(trigger);
      return;
    }

    const scrollContainer = getLeaderboardScrollContainer();
    if (!scrollContainer) {
      removeAchTooltipEntry(trigger);
      return;
    }

    if (tooltip.parentElement !== row) {
      row.appendChild(tooltip);
    }

    const triggerRect = trigger.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const ttWidth = tooltip.offsetWidth;
    const ttHeight = tooltip.offsetHeight;
    const margin = 8;
    const gap = 8;
    const mapAchievements = trigger.querySelector(
      ".leaderboard-map-achievements",
    );
    const mapAchievementsRect = mapAchievements?.getBoundingClientRect();
    const shouldOverlayMapAchievements = Boolean(
      mapAchievementsRect &&
        mapAchievementsRect.width > 0 &&
        mapAchievementsRect.height > 0,
    );
    const achievementPoints = trigger.querySelector(
      ".leaderboard-achievement-points",
    );
    const achievementPointsRect = achievementPoints?.getBoundingClientRect();
    const canAvoidAchievementPoints = Boolean(
      shouldOverlayMapAchievements &&
        achievementPointsRect &&
        achievementPointsRect.width > 0,
    );

    let left = canAvoidAchievementPoints
      ? achievementPointsRect.left - ttWidth - gap
      : triggerRect.left - ttWidth - gap;
    let top = rowRect.top + rowRect.height / 2 - ttHeight / 2;

    if (left < containerRect.left + margin) {
      left = rowRect.left + rowRect.width / 2 - ttWidth / 2;
      top = rowRect.bottom + gap;
    }

    left = Math.max(
      containerRect.left + margin,
      Math.min(left, containerRect.right - ttWidth - margin),
    );
    tooltip.style.left = `${left - rowRect.left}px`;
    tooltip.style.top = `${top - rowRect.top}px`;
  }

  function positionAchTooltips() {
    achievementTooltipState.repositionFrameId = 0;
    [...achievementTooltipState.entries.values()].forEach(
      positionAchTooltipEntry,
    );
  }

  function requestAchTooltipPosition() {
    if (achievementTooltipState.repositionFrameId) {
      return;
    }
    achievementTooltipState.repositionFrameId =
      window.requestAnimationFrame(positionAchTooltips);
  }

  function showAchTooltip(trigger, options = {}) {
    const row = trigger.closest(".leaderboard-row");
    if (!row) {
      return;
    }

    const pinned = Boolean(options.pinned);
    let entry = achievementTooltipState.entries.get(trigger);
    if (!entry) {
      entry = createAchTooltipEntry(trigger, row);
      achievementTooltipState.entries.set(trigger, entry);
    } else {
      entry.row?.classList.remove("has-ach-tooltip");
      entry.row = row;
      row.classList.add("has-ach-tooltip");
    }

    if (!pinned) {
      const previousHoverTrigger = achievementTooltipState.hoverTrigger;
      if (previousHoverTrigger && previousHoverTrigger !== trigger) {
        const previousEntry =
          achievementTooltipState.entries.get(previousHoverTrigger);
        if (previousEntry && !previousEntry.pinned) {
          removeAchTooltipEntry(previousHoverTrigger);
        }
      }
      achievementTooltipState.hoverTrigger = trigger;
    }

    entry.grid.innerHTML = buildAchievementTooltipGrid(
      getAchievementTooltipState(trigger),
    );
    entry.row = row;
    entry.pinned = pinned || entry.pinned;
    trigger.classList.toggle("is-tooltip-pinned", entry.pinned);
    entry.tooltip.classList.toggle("is-pinned", entry.pinned);
    positionAchTooltipEntry(entry);
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
          `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="10" r="6" fill="#FFD54A"/><rect x="7" y="20" width="14" height="5" rx="2" fill="#FFB300"/><text x="14" y="13" font-size="8" text-anchor="middle" fill="#1b1b1b" font-weight="700">1</text></svg>` +
          `</span>`;
      } else if (idx === 1) {
        medalHtml =
          `<span class="leaderboard-medal" aria-hidden="true">` +
          `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="10" r="6" fill="#C0C8D6"/><rect x="7" y="20" width="14" height="5" rx="2" fill="#9AA3B8"/><text x="14" y="13" font-size="8" text-anchor="middle" fill="#1b1b1b" font-weight="700">2</text></svg>` +
          `</span>`;
      } else if (idx === 2) {
        medalHtml =
          `<span class="leaderboard-medal" aria-hidden="true">` +
          `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="10" r="6" fill="#E0B58B"/><rect x="7" y="20" width="14" height="5" rx="2" fill="#C6863A"/><text x="14" y="13" font-size="8" text-anchor="middle" fill="#1b1b1b" font-weight="700">3</text></svg>` +
          `</span>`;
      }

      const rankContent =
        idx < 3
          ? medalHtml
          : `<span class="leaderboard-rank-number">${rank}</span>`;
      const valueHtml =
        typeConfig.key === "achievement"
          ? buildLeaderboardAchievementValueHtml(entry, typeConfig)
          : escapeHtml(typeConfig.formatPrimaryValue(entry));
      return `
          <li class="leaderboard-row ${isCurrent ? "is-current" : ""}${topClass}" data-user-id="${escapeHtml(entry.userId)}" tabindex="0">
            <div class="leaderboard-rank">${rankContent}</div>
            <div class="leaderboard-main">
              <div class="leaderboard-nick">${escapeHtml(entry.nickname || entry.userId)}</div>
            </div>
            <div class="leaderboard-value">${valueHtml}</div>
          </li>
        `;
    };

    const rows = sorted
      .slice(0, 100)
      .map((entry, idx) => renderLeaderboardRow(entry, idx));
    if (currentIndex >= 100) {
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

  function renderCatBuildingsModal() {
    if (!elements.catBuildingsList || !elements.catBuildingsSummary) {
      return;
    }

    const effects = getCatParadiseBuildingEffects();
    const summaryItems = [
      ["fishPricePercent", "鱼价"],
      ["fishingSpeedPercent", "钓鱼速度"],
      ["baitSavingPercent", "鱼饵节省"],
      ["weatherBoostPercent", "天气增幅"],
      ["doubleCatchPercent", "双倍鱼获"],
      ["rodLevelBonusChancePercent", "钓鱼等级+1"],
      ["rodLevelBonus", "鱼竿等级"],
      ["materialDropRatePercent", "材料率"],
      ["materialValue", "材料价值"],
      ["dailySignDraws", "每日签到"],
      ["unlockLevel", "解锁"],
    ];

    const summaryText = summaryItems
      .filter(
        ([key]) =>
          parseNumber(effects[key]) > 0 &&
          !(key === "unlockLevel" && getCatRodLevelBonus(effects) > 0),
      )
      .map(([key, label]) => {
        const value =
          key === "dailySignDraws"
            ? `${formatNumber(parseNumber(effects[key]), 0)}抽`
            : key === "unlockLevel"
              ? `Lv${formatNumber(parseNumber(effects[key]), 0)}`
              : key === "rodLevelBonus"
                ? `+${formatNumber(parseNumber(effects[key]), 0)}`
                : key === "materialValue"
                  ? `¥${formatNumber(parseNumber(effects[key]), 0)}`
                  : `${formatNumber(parseNumber(effects[key]), 2)}%`;
        return `${label} ${value}`;
      })
      .join("、");
    const autoSwitchHtml = `
      <label class="auto-nest-buff-switch cat-buildings-auto-switch">
        <input
          type="checkbox"
          data-auto-nest-buff-switch
          role="switch"
          aria-label="自动更新数据"
        />
        <span class="auto-nest-buff-switch-track" aria-hidden="true"></span>
        <span class="auto-nest-buff-switch-text">自动更新数据</span>
      </label>
    `;
    elements.catBuildingsSummary.innerHTML = `
      ${
        summaryText
          ? `<span class="cat-buildings-chip cat-buildings-summary-trigger"><span>累计效果</span><span class="cat-buildings-summary-tooltip">${escapeHtml(summaryText)}</span></span>`
          : `<span class="cat-buildings-chip"><span>累计效果</span><span class="cat-buildings-chip-value">无</span></span>`
      }
      ${autoSwitchHtml}
    `;
    setAutoNestBuffSwitchState(isRefreshingNestBuff);

    elements.catBuildingsList.innerHTML = getOrderedCatParadiseBuildings()
      .map((building) => {
        const level = getCatBuildingLevel(building.id);
        const maxLevel = getCatBuildingMaxLevel(building);
        const accumulatedEffectText = formatCatEffects(
          getCatBuildingAccumulatedEffects(building, level),
        );
        const nextLevelConfig = getCatBuildingNextLevelConfig(building);
        const nextEffectText = nextLevelConfig
          ? formatCatEffects(
              getCatBuildingAccumulatedEffects(building, level + 1),
            )
          : "";
        const upgradeAllowed = canUpgradeCatBuilding(building);
        const prerequisiteText = getCatBuildingPrerequisiteText(building);
        const prerequisite = prerequisiteText
          ? `<div class="cat-building-meta">${escapeHtml(prerequisiteText)}</div>`
          : "";
        const effectHtml = `
          ${accumulatedEffectText ? `<div>当前效果：<span class="cat-building-current-effect">${escapeHtml(accumulatedEffectText)}</span></div>` : '<div class="cat-building-meta">当前无加成</div>'}
          ${nextEffectText ? `<div>下级效果：<span class="cat-building-next-effect">${escapeHtml(nextEffectText)}</span></div>` : '<div class="cat-building-meta">暂无下级效果</div>'}
          ${prerequisite}
        `;

        return `
          <article class="cat-building-row">
            <div class="cat-building-order">${formatNumber(parseNumber(building.order), 0)}</div>
            <div class="cat-building-name">${escapeHtml(building.name)}</div>
            <div class="cat-building-stepper" data-cat-building="${escapeHtml(building.id)}">
              <button type="button" data-cat-building-step="-1" data-cat-building-id="${escapeHtml(building.id)}" ${level <= 0 ? "disabled" : ""} aria-label="降低${escapeHtml(building.name)}等级">−</button>
              <span class="cat-building-level">Lv${formatNumber(level, 0)}</span>
              <button type="button" data-cat-building-step="1" data-cat-building-id="${escapeHtml(building.id)}" ${!upgradeAllowed || level >= maxLevel ? "disabled" : ""} aria-label="提升${escapeHtml(building.name)}等级">+</button>
            </div>
            <div class="cat-building-effect">${effectHtml}</div>
          </article>
        `;
      })
      .join("");
    updateCatBuildingsSummaryGutter();
  }

  function updateCatBuildingsSummaryGutter() {
    if (!elements.catBuildingsModal || !elements.catBuildingsSummary) {
      return;
    }

    const body = elements.catBuildingsModal.querySelector(".collection-body");
    const gutter = body ? Math.max(0, body.offsetWidth - body.clientWidth) : 0;
    elements.catBuildingsSummary.style.setProperty(
      "--cat-buildings-scrollbar-gutter",
      `${gutter}px`,
    );
  }

  function openCatBuildingsModal() {
    if (!elements.catBuildingsModal) {
      return;
    }

    renderCatBuildingsModal();
    elements.catBuildingsModal.hidden = false;
    document.body.classList.add("collection-modal-open");
    updateCatBuildingsSummaryGutter();
    elements.catBuildingsModal
      .querySelector(".collection-modal-panel")
      ?.focus({ preventScroll: true });
  }

  function closeCatBuildingsModal() {
    if (!elements.catBuildingsModal) {
      return;
    }

    elements.catBuildingsModal.hidden = true;
    document.body.classList.remove("collection-modal-open");
    elements.mapCardList
      ?.querySelector("[data-cat-buildings-open]")
      ?.focus({ preventScroll: true });
  }

  function refreshCatBuildingsModalIfOpen() {
    if (elements.catBuildingsModal && !elements.catBuildingsModal.hidden) {
      renderCatBuildingsModal();
    }
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
    hideAchTooltip();
    elements.openLeaderboardModal?.focus({ preventScroll: true });
  }

  function openCollectionModal() {
    if (!elements.collectionModal || !activePlayerData) {
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

  function buildCatParadiseSummaryChips(row) {
    if (!row || !isCatParadiseMap(row.map)) {
      return "";
    }

    const effects = row.catEffects || {};
    const materialRate = getCatMaterialDropRate(effects);
    const chips = [];
    if (materialRate > 0) {
      chips.push(
        `<span class="rarity-chip" style="--rarity-color: var(--good);"><span style="color: var(--good); font-weight: 700;" role="img" aria-label="材料率">🧶</span> <span style="color: var(--text); font-weight: 700; font-size: 1.05em;">${formatNumber(materialRate, 2)}%</span></span>`,
      );
    }

    if (parseNumber(effects.fishPricePercent) > 0) {
      chips.push(
        `<span class="rarity-chip" style="--rarity-color: var(--good);"><span style="color: var(--good); font-weight: 700;">鱼价</span> <span style="color: var(--text); font-weight: 700; font-size: 1.05em;">+${formatNumber(parseNumber(effects.fishPricePercent), 2)}%</span></span>`,
      );
    }

    return chips.join("");
  }

  function formatSignedPercent(value) {
    const numericValue = parseNumber(value);
    return `${numericValue > 0 ? "+" : ""}${formatNumber(numericValue, 2)}%`;
  }

  function formatCatEffectItem(key, value) {
    const numericValue = parseNumber(value);
    switch (key) {
      case "baitSavingPercent":
        return `鱼饵节省 ${formatNumber(numericValue, 2)}%`;
      case "fishingSpeedPercent":
        return `钓鱼速度 ${formatSignedPercent(numericValue)}`;
      case "materialDropRatePercent":
        return `材料率 ${formatNumber(numericValue, 2)}%`;
      case "materialValue":
        return `材料价值 ¥${formatNumber(numericValue, 0)}`;
      case "fishPricePercent":
        return `鱼价 ${formatSignedPercent(numericValue)}`;
      case "weatherBoostPercent":
        return `天气增幅 ${formatNumber(numericValue, 2)}%`;
      case "doubleCatchPercent":
        return `双倍鱼获 ${formatNumber(numericValue, 2)}%`;
      case "rodLevelBonusChancePercent":
        return `钓鱼等级+1概率 ${formatNumber(numericValue, 2)}%`;
      case "rodLevelBonus":
        return `鱼竿等级 +${formatNumber(numericValue, 0)}`;
      case "dailySignDraws":
        return `每日签到 ${formatNumber(numericValue, 0)}抽`;
      case "unlockLevel":
        return `解锁 Lv${formatNumber(numericValue, 0)}`;
      default:
        return `${key} ${formatNumber(numericValue, 2)}`;
    }
  }

  function formatCatEffects(effects) {
    if (!effects || typeof effects !== "object") {
      return "";
    }

    return Object.entries(effects)
      .filter(
        ([key, value]) =>
          parseNumber(value) !== 0 &&
          !(key === "unlockLevel" && getCatRodLevelBonus(effects) > 0),
      )
      .map(([key, value]) => formatCatEffectItem(key, value))
      .join("、");
  }

  function getCatBuildingAccumulatedEffects(building, level) {
    const effects = {};
    addCatEffectValues(effects, building?.baseEffects);
    const normalizedLevel = normalizeCatBuildingLevel(building, level);
    (Array.isArray(building?.levels) ? building.levels : [])
      .filter((item) => Number.parseInt(item.level, 10) <= normalizedLevel)
      .sort(
        (left, right) =>
          (Number.parseInt(left.level, 10) || 0) -
          (Number.parseInt(right.level, 10) || 0),
      )
      .forEach((item) => addCatEffectValues(effects, item.effects));
    return effects;
  }

  function getCatBuildingNextLevelConfig(building) {
    const currentLevel = getCatBuildingLevel(building.id);
    const nextLevel = currentLevel + 1;
    return (Array.isArray(building.levels) ? building.levels : []).find(
      (item) => Number.parseInt(item.level, 10) === nextLevel,
    );
  }

  function getCatBuildingNextLevel(building) {
    const currentLevel = getCatBuildingLevel(building.id);
    if (currentLevel >= getCatBuildingMaxLevel(building)) {
      return null;
    }

    return currentLevel + 1;
  }

  function getCatBuildingPrerequisiteLevel(building) {
    if (building?.id !== "legendaryCatStatue") {
      return null;
    }

    return getCatBuildingNextLevel(building);
  }

  function getCatBuildingPrerequisiteText(building) {
    const prerequisiteLevel = getCatBuildingPrerequisiteLevel(building);
    if (!prerequisiteLevel) {
      return "";
    }

    return `需要其他8栋建筑全部达到 Lv${formatNumber(prerequisiteLevel, 0)}`;
  }

  function canUpgradeCatBuilding(building) {
    const nextLevel = getCatBuildingNextLevel(building);
    if (!nextLevel) {
      return false;
    }

    if (building.id !== "legendaryCatStatue") {
      return true;
    }

    return catParadiseBuildings
      .filter((item) => item.id !== building.id)
      .every((item) => getCatBuildingLevel(item.id) >= nextLevel);
  }

  function renderSummary(selectedMapRow, bestBaitRow, inputs) {
    elements.selectedMapName.className = selectedMapRow
      ? "value selected-map-name"
      : "value";
    elements.selectedMapName.innerHTML = selectedMapRow
      ? buildSelectedMapTitleHtml(selectedMapRow.map)
      : "-";
    elements.selectedMapDelta.className = selectedMapRow
      ? "small selected-map-delta"
      : "small";
    elements.selectedMapDelta.innerHTML = selectedMapRow
      ? `<span class="selected-map-delta-item"><span class="selected-map-delta-label">🎣渔力</span><span class="selected-map-delta-value">${selectedMapRow.delta}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🪝鱼钩</span><span class="selected-map-buff-value">${formatPercent(inputs?.hookConfig?.speed ?? 0, 2)}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">⚡${highlightPercentValues(inputs?.systemBuffConfig?.name ?? "", "selected-map-buff-value")}</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">🌽打窝</span><span class="selected-map-buff-value">${formatNumber(selectedMapRow.baitBuff, 2)}%</span></span><span class="selected-map-delta-item"><span class="selected-map-delta-label">${getWeatherMeta(selectedMapRow.weather?.type).emoji}天气</span><span class="selected-map-buff-value">${getWeatherMeta(selectedMapRow.weather?.type).label}</span></span>`
      : "-";
    elements.selectedFishPrice.textContent = selectedMapRow
      ? `¥${formatNumber(selectedMapRow.displayExpectedPrice, 2)}`
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
        .concat(buildCatParadiseSummaryChips(selectedMapRow))
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

  function findBestMapId(mapRows) {
    let bestMapId = "";
    let bestNet = -Infinity;
    mapRows.forEach((row) => {
      if (!row.isSelectable) {
        return;
      }
      const net = row.bestBaitRow ? row.bestBaitRow.netRevenue : -Infinity;
      if (net > bestNet) {
        bestNet = net;
        bestMapId = getMapId(row.map);
      }
    });
    return bestMapId;
  }

  function renderMapCards(mapRows, selectedMapId) {
    if (!elements.mapCardList) {
      return;
    }

    if (!mapRows.length) {
      elements.mapCardList.innerHTML =
        '<div class="empty-state" style="padding:0;">暂无可选地图，请检查鱼竿等级配置。</div>';
      return;
    }

    const bestMapId = findBestMapId(mapRows);

    elements.mapCardList.innerHTML = mapRows
      .map((row) => {
        const rowMapId = getMapId(row.map);
        const escapedMapId = escapeHtml(rowMapId);
        const isSelected = rowMapId === selectedMapId;
        const isBest = row.isSelectable && rowMapId === bestMapId;
        const isUnavailable = !row.isSelectable;
        const catBuildingsButton = buildCatBuildingsButtonHtml(row);
        const collectionState = getMapCardCollectionAttributes(row);
        const cardClasses = [
          "map-card",
          isSelected ? "selected" : "",
          isBest ? "best" : "",
          isUnavailable ? "unavailable" : "",
          collectionState.className.trim(),
        ]
          .filter(Boolean)
          .join(" ");
        const cardContent = isUnavailable
          ? `<div class="map-card-note map-card-unavailable" data-map-unavailable="${escapedMapId}">${row.unavailableReason}</div>`
          : `
              <div class="map-card-main-row">
                <div class="map-card-price" data-map-price="${escapedMapId}"> ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}</div>
              </div>
              <div class="map-card-note map-card-best-bait" data-map-best-bait="${escapedMapId}">最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}</div>
              <label class="map-card-buff">
                <span>打窝 buff（%）</span>
                <div class="map-card-buff-stepper" data-bait-buff-stepper="${escapedMapId}">
                  <button type="button" class="stepper-btn" data-bait-buff-step="-5" data-bait-buff-map-id="${escapedMapId}" aria-label="减少">−</button>
                  <span class="stepper-value" data-bait-buff-value="${escapedMapId}">${formatNumber(row.baitBuff, 0)}</span>
                  <button type="button" class="stepper-btn" data-bait-buff-step="5" data-bait-buff-map-id="${escapedMapId}" aria-label="增加">+</button>
                </div>
              </label>`;
        return `
          <div class="${cardClasses}" data-map-id="${escapedMapId}" data-map-level="${row.map.difficulty}" data-map-disabled="${isUnavailable}" role="button" tabindex="${isUnavailable ? "-1" : "0"}" aria-disabled="${isUnavailable ? "true" : "false"}"${collectionState.attributes}>
            ${catBuildingsButton}
            <div class="map-card-compact">
              <div class="map-card-header">
                <div class="map-card-title">
                  ${buildMapCardCodeHtml(row.map)}
                  <span>${row.map.name}</span>
                </div>
                <div class="map-card-badges" data-map-badges="${escapedMapId}">
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
    const bestMapId = findBestMapId(mapRows);
    mapRows.forEach((row) => {
      const cardEl = getMapCardElement(row.map.id);
      const isUnavailable = !row.isSelectable;
      if (cardEl) {
        cardEl.classList.toggle("unavailable", isUnavailable);
        cardEl.setAttribute("aria-disabled", isUnavailable ? "true" : "false");
        cardEl.setAttribute("tabindex", isUnavailable ? "-1" : "0");
        applyMapCardCollectionVisual(cardEl, row);
      }

      const unavailableEl = cardEl?.querySelector("[data-map-unavailable]");
      if (unavailableEl) {
        unavailableEl.textContent = row.unavailableReason;
      }

      const priceEl = cardEl?.querySelector("[data-map-price]");
      if (priceEl && row.isSelectable) {
        priceEl.textContent = ` ¥${formatNumber(row.bestBaitRow?.netRevenue ?? 0, 0)}`;
      }
      const existingCatBuildingsButton = cardEl?.querySelector(
        "[data-cat-buildings-open]",
      );
      const nextCatBuildingsButtonHtml = row.isSelectable
        ? buildCatBuildingsButtonHtml(row)
        : "";
      if (cardEl && nextCatBuildingsButtonHtml && !existingCatBuildingsButton) {
        cardEl.insertAdjacentHTML("afterbegin", nextCatBuildingsButtonHtml);
      } else if (!nextCatBuildingsButtonHtml && existingCatBuildingsButton) {
        existingCatBuildingsButton.remove();
      }
      const bestBaitEl = cardEl?.querySelector("[data-map-best-bait]");
      if (bestBaitEl && row.isSelectable) {
        bestBaitEl.textContent = `最优鱼饵：${row.bestBaitRow ? row.bestBaitRow.bait.name : "-"}`;
      }
      const buffValueEl = cardEl?.querySelector("[data-bait-buff-value]");
      if (buffValueEl && row.isSelectable) {
        buffValueEl.textContent = formatNumber(row.baitBuff, 0);
      }
      const codeEl = cardEl?.querySelector(".map-card-code");
      if (codeEl) {
        codeEl.outerHTML = buildMapCardCodeHtml(row.map);
      }

      const badgesEl = cardEl?.querySelector("[data-map-badges]");
      const isBest = getMapId(row.map) === bestMapId;
      if (cardEl) {
        cardEl.classList.toggle("best", isBest);
      }
      if (badgesEl) {
        badgesEl.innerHTML = buildMapCardBadgesHtml(row, isBest);
      }
    });
  }

  function canUpdateMapCardsInPlace(mapRows, selectedMapId) {
    if (!elements.mapCardList) {
      return false;
    }

    const cards = Array.from(
      elements.mapCardList.querySelectorAll(".map-card[data-map-id]"),
    );
    if (cards.length !== mapRows.length) {
      return false;
    }

    const normalizedSelectedMapId = normalizeMapId(selectedMapId);
    return cards.every((card, index) => {
      const expectedMapId = getMapId(mapRows[index]?.map);
      const cardMapId = card.dataset.mapId || "";
      const shouldBeSelected =
        normalizedSelectedMapId !== "" && cardMapId === normalizedSelectedMapId;
      return (
        cardMapId === expectedMapId &&
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
    updateCollectionSettingVisibility();
    renderCollectionProgress();

    if (!isAutoNestBuffEnabled || !activePlayerData) {
      if (elements.playerLocationPanel && elements.playerLocationValue) {
        elements.playerLocationPanel.hidden = true;
        elements.playerLocationValue.textContent = "-";
      }
      if (elements.playerBaitPanel && elements.playerBaitValue) {
        elements.playerBaitPanel.hidden = true;
        elements.playerBaitPanel.classList.remove("is-bait-mismatch");
        elements.playerBaitPanel.title = "";
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

  function getActivePlayerMapRow(mapRows) {
    const locationId = String(activePlayerData?.location_id || "").trim();
    if (!locationId) {
      return null;
    }

    return (
      (Array.isArray(mapRows) ? mapRows : []).find(
        (row) => String(row?.map?.id) === locationId,
      ) || null
    );
  }

  function getPlayerBaitMismatchInfo(mapRows) {
    if (!isAutoNestBuffEnabled || !activePlayerData) {
      return { isMismatch: false, bestBait: null };
    }

    const currentBaitId = String(activePlayerData.bait_id ?? "").trim();
    if (!currentBaitId) {
      return { isMismatch: false, bestBait: null };
    }

    const playerMapRow = getActivePlayerMapRow(mapRows);
    const bestBait = playerMapRow?.bestBaitRow?.bait || null;
    if (!bestBait) {
      return { isMismatch: false, bestBait: null };
    }

    return {
      isMismatch: String(bestBait.id) !== currentBaitId,
      bestBait,
    };
  }

  function renderPlayerInfo(mapRows = []) {
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
      const mismatchInfo = getPlayerBaitMismatchInfo(mapRows);
      elements.playerBaitPanel.classList.toggle(
        "is-bait-mismatch",
        mismatchInfo.isMismatch,
      );
      elements.playerBaitPanel.title = mismatchInfo.isMismatch
        ? `当前鱼饵与当前地图最优鱼饵不一致，推荐：${mismatchInfo.bestBait.name}`
        : "";
      updateBaitReminderToggleState();
      maybeShowBaitReminder();
    }
  }

  function render(options = {}) {
    updateLevelDisplays();
    const inputs = getInputs();
    const selectedRodLevel = Number.parseInt(elements.rodLevel.value, 10);
    const mapRows = calculateMapRows(inputs, selectedRodLevel);
    const selectableMapRows = mapRows.filter((row) => row.isSelectable);
    const storedMapId = normalizeMapId(getStoredValue(storageKeys.mapId));
    const storedMapLevel = Number.parseInt(
      getStoredValue(storageKeys.mapLevel) || "",
      10,
    );
    const selectedMapRow =
      (storedMapId
        ? selectableMapRows.find((row) => getMapId(row.map) === storedMapId)
        : null) ||
      selectableMapRows.find((row) => row.map.difficulty === storedMapLevel) ||
      selectableMapRows[0] ||
      null;
    const activeMapId = selectedMapRow ? getMapId(selectedMapRow.map) : "";
    const activeMapLevel = selectedMapRow ? selectedMapRow.map.difficulty : "";

    if (selectedMapRow && storedMapId !== activeMapId) {
      setStoredValue(storageKeys.mapId, activeMapId);
    }
    if (selectedMapRow && String(storedMapLevel) !== String(activeMapLevel)) {
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
    renderPlayerInfo(mapRows);
    // If leaderboard modal is open, refresh its contents so it stays up-to-date
    if (elements.leaderboardModal && !elements.leaderboardModal.hidden) {
      hideAchTooltip();
      renderLeaderboardTypes();
      renderLeaderboardList();
    }
    if (
      options.skipMapCardRebuild &&
      canUpdateMapCardsInPlace(mapRows, activeMapId)
    ) {
      updateMapCardValues(mapRows);
    } else {
      renderMapCards(mapRows, activeMapId);
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
        let playerSyncResult = {
          changed: false,
          rodChanged: false,
          catParkChanged: false,
        };
        if (isAutoNestBuffEnabled) {
          playerSyncResult = applyLatestPlayerSnapshot();
        }
        render({
          skipMapCardRebuild:
            !playerSyncResult.rodChanged && !playerSyncResult.catParkChanged,
        });
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
        const catBuildingsButton = event.target.closest(
          "[data-cat-buildings-open]",
        );
        if (catBuildingsButton) {
          event.preventDefault();
          event.stopPropagation();
          openCatBuildingsModal();
          return;
        }

        const weatherButton = event.target.closest("[data-weather-step]");
        if (weatherButton) {
          event.stopPropagation();
          const mapLevel = weatherButton.dataset.weatherMap;
          const mapId = weatherButton.dataset.weatherMapId;
          const stepValue = parseNumber(weatherButton.dataset.weatherStep);
          const currentWeather = getWeatherForMap(mapLevel, mapId);
          const nextType = getWeatherCycleType(currentWeather.type, stepValue);
          setWeatherOverrideForMap(mapId, nextType);
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

        const target = event.target.closest("[data-map-id]");
        if (!target) {
          return;
        }

        if (target.dataset.mapDisabled === "true") {
          return;
        }

        setStoredValue(storageKeys.mapId, target.dataset.mapId || "");
        setStoredValue(storageKeys.mapLevel, target.dataset.mapLevel || "");
        render();
      });

      elements.mapCardList.addEventListener("keydown", (event) => {
        if (
          event.target.closest("[data-bait-buff-step]") ||
          event.target.closest("[data-cat-buildings-open]")
        ) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const target = event.target.closest("[data-map-id]");
        if (!target) {
          return;
        }
        if (target.dataset.mapDisabled === "true") {
          return;
        }
        event.preventDefault();
        setStoredValue(storageKeys.mapId, target.dataset.mapId || "");
        setStoredValue(storageKeys.mapLevel, target.dataset.mapLevel || "");
        render();
      });
    }

    document.addEventListener("change", (event) => {
      const switchElement =
        event.target instanceof Element
          ? event.target.closest("[data-auto-nest-buff-switch]")
          : null;
      if (!switchElement) {
        return;
      }

      if (switchElement.checked) {
        startAutoNestBuff();
        return;
      }

      stopAutoNestBuff();
      render({ skipMapCardRebuild: true });
    });

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

    if (elements.catBuildingsModal) {
      elements.catBuildingsModal.addEventListener("click", (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-cat-buildings-close]")
        ) {
          closeCatBuildingsModal();
          return;
        }

        const stepButton =
          event.target instanceof Element
            ? event.target.closest("[data-cat-building-step]")
            : null;
        if (!stepButton) {
          return;
        }

        const buildingId = stepButton.dataset.catBuildingId;
        const building = catParadiseBuildings.find(
          (item) => item.id === buildingId,
        );
        if (!building) {
          return;
        }

        const step = Number.parseInt(stepButton.dataset.catBuildingStep, 10);
        const currentLevel = getCatBuildingLevel(building.id);
        const nextLevel = normalizeCatBuildingLevel(
          building,
          currentLevel + (Number.isFinite(step) ? step : 0),
        );
        if (nextLevel > currentLevel && !canUpgradeCatBuilding(building)) {
          return;
        }

        if (nextLevel === currentLevel) {
          return;
        }

        disableAutoNestBuffForManualEdit();
        catBuildingLevels[building.id] = nextLevel;
        persistCatBuildingLevels();
        renderCatBuildingsModal();
        render({ skipMapCardRebuild: true });
      });

      elements.catBuildingsModal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCatBuildingsModal();
        }
      });
    }

    if (elements.leaderboardTypeList) {
      elements.leaderboardTypeList.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-leaderboard-type]");
        if (!btn) return;
        const typeKey = btn.dataset.leaderboardType;
        if (!typeKey) return;
        hideAchTooltip();
        leaderboardActiveType = typeKey;
        renderLeaderboardSummaryBadge();
        renderLeaderboardTypes();
        renderLeaderboardList();
      });
    }

    if (elements.leaderboardList) {
      elements.leaderboardList.addEventListener("click", (event) => {
        const trigger =
          event.target instanceof Element
            ? event.target.closest(".ach-trigger")
            : null;
        if (trigger && elements.leaderboardList.contains(trigger)) {
          event.preventDefault();
          event.stopPropagation();

          const entry = achievementTooltipState.entries.get(trigger);
          if (entry?.pinned) {
            hideAchTooltip(trigger);
            return;
          }

          showAchTooltip(trigger, { pinned: true });
          return;
        }

        const row = event.target.closest(".leaderboard-row");
        if (!row) return;
        const userId = row.dataset.userId;
        if (!userId) return;
        // focus or highlight logic could be added here
      });

      elements.leaderboardList.addEventListener("mouseover", (event) => {
        const trigger =
          event.target instanceof Element
            ? event.target.closest(".ach-trigger")
            : null;
        if (!trigger || !elements.leaderboardList.contains(trigger)) {
          return;
        }

        if (
          event.relatedTarget instanceof Node &&
          trigger.contains(event.relatedTarget)
        ) {
          return;
        }

        if (achievementTooltipState.entries.get(trigger)?.pinned) {
          return;
        }

        showAchTooltip(trigger);
      });

      elements.leaderboardList.addEventListener("mouseout", (event) => {
        const trigger =
          event.target instanceof Element
            ? event.target.closest(".ach-trigger")
            : null;
        if (!trigger || achievementTooltipState.hoverTrigger !== trigger) {
          return;
        }

        if (achievementTooltipState.entries.get(trigger)?.pinned) {
          return;
        }

        if (
          event.relatedTarget instanceof Node &&
          trigger.contains(event.relatedTarget)
        ) {
          return;
        }

        hideHoverAchTooltip();
      });

      elements.leaderboardList.addEventListener("mouseleave", () => {
        hideAchTooltip();
      });

      window.addEventListener("resize", requestAchTooltipPosition);
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
