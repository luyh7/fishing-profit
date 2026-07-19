(function initStarryExpectation(root, factory) {
  let scorePmf =
    root && (root.FISH_STARRY_SCORE_PMF || root.STARRY_SCORE_PMF);
  if (typeof module === "object" && module.exports) {
    try {
      scorePmf = require("./starry-score-pmf.js");
    } catch (error) {
      if (
        !error ||
        error.code !== "MODULE_NOT_FOUND" ||
        !String(error.message).includes("starry-score-pmf.js")
      ) {
        throw error;
      }
    }
    module.exports = factory(scorePmf);
    return;
  }
  const api = factory(scorePmf);
  root.FISH_STARRY_EXPECTATION = api;
  root.STARRY_EXPECTATION = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildApi(initialPmf) {
  "use strict";

  const POOLS = ["none", "low", "middle", "high", "ultimate"];
  const DRAWABLE_POOLS = POOLS.slice(1);
  const WEATHER_TYPES = new Set([
    "chaotic_era",
    "solar_wind",
    "meteor_shower",
    "hengjiyuan",
  ]);
  const CURRENT_MODE_MAX_INTERVALS = 10000;

  const REWARD_DEFINITIONS = [
    { key: "corn", name: "玉米", pool: "low", count: 1 },
    {
      key: "black_market_extra_ticket",
      name: "黑商额外兑换券",
      pool: "low",
      count: 1,
    },
    {
      key: "lottery_fragment_low",
      name: "中级抽奖碎片",
      pool: "low",
      count: 1,
      fragment: "low",
    },
    {
      key: "wish_score",
      name: "0.5积分",
      pool: "low",
      count: 1,
      scoreBonus: 0.5,
    },
    {
      key: "duoduo_potion",
      name: "真多多药水",
      pool: "middle",
      count: 1,
    },
    {
      key: "lucky_potion",
      name: "幸运药水",
      pool: "middle",
      count: 1,
    },
    {
      key: "reset_potion",
      name: "回档药水",
      pool: "middle",
      count: 1,
    },
    { key: "cat_frame", name: "猫猫框", pool: "middle", count: 1 },
    {
      key: "lottery_fragment_mid",
      name: "高级抽奖碎片",
      pool: "middle",
      count: 1,
      fragment: "middle",
    },
    {
      key: "flash_potion",
      name: "闪光药水",
      pool: "high",
      count: 1,
    },
    {
      key: "time_potion",
      name: "时光药水",
      pool: "high",
      count: 1,
    },
    {
      key: "utr_select_ticket",
      name: "UTR自选券",
      pool: "high",
      count: 1,
    },
    {
      key: "lottery_fragment_high",
      name: "究极抽奖碎片",
      pool: "high",
      count: 1,
      fragment: "high",
    },
    {
      key: "time_potion",
      name: "时光药水",
      pool: "ultimate",
      count: 10,
    },
    {
      key: "utr_select_ticket",
      name: "UTR自选券",
      pool: "ultimate",
      count: 10,
    },
  ].map((reward, index) => Object.freeze({ ...reward, index }));

  const REWARDS_BY_POOL = Object.fromEntries(
    DRAWABLE_POOLS.map((pool) => [
      pool,
      REWARD_DEFINITIONS.filter((reward) => reward.pool === pool),
    ]),
  );

  const FRAGMENT_UPGRADE_POOL = {
    low: "middle",
    middle: "high",
    high: "ultimate",
  };

  const STATE_COUNT = 125;
  const STATE_PARTS = Array.from({ length: STATE_COUNT }, (_, state) => ({
    low: state % 5,
    middle: Math.floor(state / 5) % 5,
    high: Math.floor(state / 25) % 5,
  }));
  const FRAGMENT_TRANSITIONS = Object.fromEntries(
    Object.keys(FRAGMENT_UPGRADE_POOL).map((fragment) => [
      fragment,
      STATE_PARTS.map((parts) => {
        const next = { ...parts };
        const upgrades = next[fragment] === 4;
        next[fragment] = upgrades ? 0 : next[fragment] + 1;
        return Object.freeze({
          state: next.low + next.middle * 5 + next.high * 25,
          upgradePool: upgrades ? FRAGMENT_UPGRADE_POOL[fragment] : null,
        });
      }),
    ]),
  );

  const distributionCache = new Map();
  let scorePmf = initialPmf && initialPmf.default ? initialPmf.default : initialPmf;

  function emptyPools() {
    return { none: 0, low: 0, middle: 0, high: 0, ultimate: 0 };
  }

  function addPools(target, source, multiplier = 1) {
    for (const pool of POOLS) {
      target[pool] += (source[pool] || 0) * multiplier;
    }
    return target;
  }

  function finiteNonNegative(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new TypeError(`${name} must be a finite non-negative number`);
    }
    return number;
  }

  function normalizeWeatherType(value) {
    const weatherType = value == null || value === "" ? "chaotic_era" : String(value);
    if (!WEATHER_TYPES.has(weatherType)) {
      throw new RangeError(`unsupported starry weather type: ${weatherType}`);
    }
    return weatherType;
  }

  function resolvePmf() {
    if (!scorePmf && typeof globalThis !== "undefined") {
      scorePmf =
        globalThis.FISH_STARRY_SCORE_PMF || globalThis.STARRY_SCORE_PMF;
    }
    if (scorePmf && scorePmf.default) {
      scorePmf = scorePmf.default;
    }
    if (!scorePmf || !scorePmf.domains) {
      throw new Error(
        "starry score PMF is unavailable; load starry-score-pmf.js before calculating",
      );
    }
    return scorePmf;
  }

  function normalizedDomain(domainName) {
    const pmf = resolvePmf();
    const scale = finiteNonNegative(pmf.scale, "score PMF scale");
    const domain = pmf.domains[domainName];
    if (!Number.isInteger(scale) || scale <= 0 || !domain) {
      throw new Error(`invalid starry score PMF domain: ${domainName}`);
    }
    const population = finiteNonNegative(
      domain.population,
      `${domainName} PMF population`,
    );
    if (!Number.isInteger(population) || population <= 0 || !Array.isArray(domain.entries)) {
      throw new Error(`invalid starry score PMF domain: ${domainName}`);
    }

    const countsByScore = new Map();
    for (const entry of domain.entries) {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new Error(`invalid ${domainName} PMF entry`);
      }
      const scoreMicro = Number(entry[0]);
      const count = Number(entry[1]);
      if (!Number.isInteger(scoreMicro) || scoreMicro < 0 || !Number.isInteger(count) || count <= 0) {
        throw new Error(`invalid ${domainName} PMF entry`);
      }
      countsByScore.set(scoreMicro, (countsByScore.get(scoreMicro) || 0) + count);
    }
    const entries = Array.from(countsByScore.entries()).sort((left, right) => left[0] - right[0]);
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    if (total !== population) {
      throw new Error(
        `${domainName} PMF population mismatch: expected ${population}, received ${total}`,
      );
    }
    return { scale, population, entries };
  }

  function poolForScore(scoreMicro, scale) {
    const displayScore = Math.floor(scoreMicro / scale + 0.5);
    if (displayScore <= 0) return "none";
    if (displayScore <= 2) return "low";
    if (displayScore <= 5) return "middle";
    if (displayScore <= 10) return "high";
    return "ultimate";
  }

  function selectedScoreDistribution(domainName, selectionCount) {
    const cacheKey = `${domainName}:${selectionCount}`;
    if (distributionCache.has(cacheKey)) {
      return distributionCache.get(cacheKey);
    }
    const domain = normalizedDomain(domainName);
    let cumulativeCount = 0;
    let meanRawScore = 0;
    const poolProbabilities = emptyPools();
    for (const [scoreMicro, count] of domain.entries) {
      const previousCdf = cumulativeCount / domain.population;
      cumulativeCount += count;
      const cdf = cumulativeCount / domain.population;
      const probability = cdf ** selectionCount - previousCdf ** selectionCount;
      meanRawScore += (scoreMicro / domain.scale) * probability;
      poolProbabilities[poolForScore(scoreMicro, domain.scale)] += probability;
    }
    const result = Object.freeze({
      domain: domainName,
      selectionCount,
      meanRawScore,
      poolProbabilities: Object.freeze(poolProbabilities),
    });
    distributionCache.set(cacheKey, result);
    return result;
  }

  function buildPeriod(period, index) {
    if (!period || typeof period !== "object") {
      throw new TypeError(`periods[${index}] must be an object`);
    }
    const attempts = finiteNonNegative(period.attempts, `periods[${index}].attempts`);
    const effectiveRodLevel = Math.floor(
      finiteNonNegative(
        period.effectiveRodLevel == null ? 0 : period.effectiveRodLevel,
        `periods[${index}].effectiveRodLevel`,
      ),
    );
    const weatherType = normalizeWeatherType(period.weatherType);
    const modifiers = period.modifiers || {};
    const gamma = Boolean(modifiers.gamma);
    const solarWind = gamma || weatherType === "solar_wind";
    const meteorShower = gamma || weatherType === "meteor_shower";
    const hengjiyuan = gamma || weatherType === "hengjiyuan";
    const lucky = Boolean(modifiers.lucky);
    const duoduo = Boolean(modifiers.duoduo);
    const doubleCatch = Boolean(modifiers.doubleCatch);
    const selectionCount = 1 + Number(meteorShower) + Number(lucky);
    const duplicateCount = duoduo ? 2 : 1;
    const catchesPerAttempt = doubleCatch ? 2 : 1;
    const baseCatchCount = attempts * catchesPerAttempt;
    const dropRate = Math.min(
      1,
      0.05 + Math.max(0, effectiveRodLevel - 10) * 0.005 + (solarWind ? 0.025 : 0),
    );
    const scoreDistribution = selectedScoreDistribution(
      hengjiyuan ? "hengjiyuan" : "normal",
      selectionCount,
    );
    const expectedTriggerCount = baseCatchCount * dropRate;
    const expectedFishCount = expectedTriggerCount * duplicateCount;
    const directPoolDraws = emptyPools();
    for (const pool of POOLS) {
      directPoolDraws[pool] =
        expectedFishCount * scoreDistribution.poolProbabilities[pool];
    }
    return {
      attempts,
      effectiveRodLevel,
      weatherType,
      modifiers: Object.freeze({ duoduo, lucky, gamma, doubleCatch }),
      solarWind,
      meteorShower,
      hengjiyuan,
      catchesPerAttempt,
      baseCatchCount,
      dropRate,
      selectionCount,
      duplicateCount,
      expectedTriggerCount,
      expectedFishCount,
      expectedStarryFish: expectedFishCount,
      meanRawScore: scoreDistribution.meanRawScore,
      poolProbabilities: scoreDistribution.poolProbabilities,
      directPoolDraws,
      rawScore: expectedFishCount * scoreDistribution.meanRawScore,
    };
  }

  function longRunPoolDraws(direct) {
    const total = { ...direct };
    total.middle = direct.middle + direct.low / 20;
    total.high = direct.high + total.middle / 25;
    total.ultimate = direct.ultimate + total.high / 20;
    return total;
  }

  function rewardRowsFromOccurrences(occurrences) {
    return REWARD_DEFINITIONS.map((definition) => {
      const expectedOccurrences = occurrences[definition.index] || 0;
      const expectedQuantity = expectedOccurrences * definition.count;
      return {
        key: definition.key,
        name: definition.name,
        pool: definition.pool,
        countPerOccurrence: definition.count,
        expectedOccurrences,
        expectedQuantity,
        occurrences: expectedOccurrences,
        quantity: expectedQuantity,
        scoreBonus: definition.scoreBonus || 0,
      };
    });
  }

  function longRunRewardOccurrences(poolDraws) {
    const occurrences = new Float64Array(REWARD_DEFINITIONS.length);
    for (const pool of DRAWABLE_POOLS) {
      const rewards = REWARDS_BY_POOL[pool];
      const occurrence = poolDraws[pool] / rewards.length;
      for (const reward of rewards) {
        occurrences[reward.index] = occurrence;
      }
    }
    return occurrences;
  }

  function stateIndex(remainders) {
    const values = {};
    for (const fragment of ["low", "middle", "high"]) {
      const raw = remainders && remainders[fragment] != null ? Number(remainders[fragment]) : 0;
      if (!Number.isInteger(raw) || raw < 0 || raw > 4) {
        throw new RangeError(`fragmentRemainders.${fragment} must be an integer in 0..4`);
      }
      values[fragment] = raw;
    }
    return {
      values,
      index: values.low + values.middle * 5 + values.high * 25,
    };
  }

  function distributionMass(distribution) {
    let total = 0;
    for (let index = 0; index < STATE_COUNT; index += 1) {
      total += distribution[index];
    }
    return total;
  }

  function mergeDistribution(target, source) {
    for (let state = 0; state < STATE_COUNT; state += 1) {
      target[state] += source[state];
    }
    return target;
  }

  function scaledDistribution(source, multiplier) {
    const result = new Float64Array(STATE_COUNT);
    for (let state = 0; state < STATE_COUNT; state += 1) {
      result[state] = source[state] * multiplier;
    }
    return result;
  }

  function applyPoolDraw(distribution, pool, accumulator) {
    const mass = distributionMass(distribution);
    accumulator.poolDraws[pool] += mass;
    if (pool === "none" || mass === 0) {
      return distribution;
    }

    const rewards = REWARDS_BY_POOL[pool];
    const probabilityPerReward = 1 / rewards.length;
    const output = new Float64Array(STATE_COUNT);
    const upgradeInputs = {};

    for (let state = 0; state < STATE_COUNT; state += 1) {
      const stateProbability = distribution[state];
      if (stateProbability === 0) continue;
      for (const reward of rewards) {
        const probability = stateProbability * probabilityPerReward;
        accumulator.rewardOccurrences[reward.index] += probability;
        if (!reward.fragment) {
          output[state] += probability;
          continue;
        }
        const transition = FRAGMENT_TRANSITIONS[reward.fragment][state];
        if (!transition.upgradePool) {
          output[transition.state] += probability;
          continue;
        }
        if (!upgradeInputs[transition.upgradePool]) {
          upgradeInputs[transition.upgradePool] = new Float64Array(STATE_COUNT);
        }
        upgradeInputs[transition.upgradePool][transition.state] += probability;
      }
    }

    for (const upgradePool of Object.keys(upgradeInputs)) {
      mergeDistribution(
        output,
        applyPoolDraw(upgradeInputs[upgradePool], upgradePool, accumulator),
      );
    }
    return output;
  }

  function applyBaseCatch(distribution, period, accumulator) {
    const output = scaledDistribution(distribution, 1 - period.dropRate);
    for (const pool of POOLS) {
      const poolProbability = period.poolProbabilities[pool];
      if (poolProbability === 0) continue;
      let branch = scaledDistribution(
        distribution,
        period.dropRate * poolProbability,
      );
      for (let copy = 0; copy < period.duplicateCount; copy += 1) {
        branch = applyPoolDraw(branch, pool, accumulator);
      }
      mergeDistribution(output, branch);
    }
    return output;
  }

  function applyInterval(distribution, period, fraction, accumulator) {
    const inactive = scaledDistribution(distribution, 1 - fraction);
    let active = scaledDistribution(distribution, fraction);
    for (let catchIndex = 0; catchIndex < period.catchesPerAttempt; catchIndex += 1) {
      active = applyBaseCatch(active, period, accumulator);
    }
    return mergeDistribution(inactive, active);
  }

  function calculateCurrentFragments(periods, initialRemainders) {
    const totalIntervals = periods.reduce(
      (sum, period) => sum + Math.ceil(period.attempts),
      0,
    );
    if (totalIntervals > CURRENT_MODE_MAX_INTERVALS) {
      throw new RangeError(
        `current fragment mode supports at most ${CURRENT_MODE_MAX_INTERVALS} intervals`,
      );
    }
    const initial = stateIndex(initialRemainders);
    let distribution = new Float64Array(STATE_COUNT);
    distribution[initial.index] = 1;
    const accumulator = {
      poolDraws: emptyPools(),
      rewardOccurrences: new Float64Array(REWARD_DEFINITIONS.length),
    };

    for (const period of periods) {
      const fullIntervals = Math.floor(period.attempts);
      const partialInterval = period.attempts - fullIntervals;
      for (let interval = 0; interval < fullIntervals; interval += 1) {
        distribution = applyInterval(distribution, period, 1, accumulator);
      }
      if (partialInterval > 0) {
        distribution = applyInterval(
          distribution,
          period,
          partialInterval,
          accumulator,
        );
      }
    }

    const expectedFinalRemainders = { low: 0, middle: 0, high: 0 };
    for (let state = 0; state < STATE_COUNT; state += 1) {
      const probability = distribution[state];
      expectedFinalRemainders.low += probability * STATE_PARTS[state].low;
      expectedFinalRemainders.middle += probability * STATE_PARTS[state].middle;
      expectedFinalRemainders.high += probability * STATE_PARTS[state].high;
    }
    return {
      initialRemainders: initial.values,
      expectedFinalRemainders,
      finalProbabilityMass: distributionMass(distribution),
      poolDraws: accumulator.poolDraws,
      rewardOccurrences: accumulator.rewardOccurrences,
    };
  }

  function scoreBonusFromRewards(rewards) {
    return rewards.reduce(
      (sum, reward) => sum + reward.expectedOccurrences * reward.scoreBonus,
      0,
    );
  }

  function calculateDailyStarryExpectation(input) {
    if (!input || typeof input !== "object") {
      throw new TypeError("input must be an object");
    }
    if (!Array.isArray(input.periods) || input.periods.length === 0) {
      throw new TypeError("input.periods must be a non-empty array");
    }
    const fragmentMode = input.fragmentMode == null ? "long_run" : String(input.fragmentMode);
    if (fragmentMode !== "long_run" && fragmentMode !== "current") {
      throw new RangeError("fragmentMode must be long_run or current");
    }

    const periods = input.periods.map(buildPeriod);
    const directPoolDraws = emptyPools();
    let attemptCount = 0;
    let baseCatchCount = 0;
    let weightedDropRate = 0;
    let expectedTriggerCount = 0;
    let expectedFishCount = 0;
    let rawScore = 0;
    let triggerWeightedSelectionCount = 0;
    let triggerWeightedDuplicateCount = 0;
    for (const period of periods) {
      attemptCount += period.attempts;
      baseCatchCount += period.baseCatchCount;
      weightedDropRate += period.baseCatchCount * period.dropRate;
      expectedTriggerCount += period.expectedTriggerCount;
      expectedFishCount += period.expectedFishCount;
      rawScore += period.rawScore;
      triggerWeightedSelectionCount +=
        period.expectedTriggerCount * period.selectionCount;
      triggerWeightedDuplicateCount +=
        period.expectedTriggerCount * period.duplicateCount;
      addPools(directPoolDraws, period.directPoolDraws);
    }
    const longRun = longRunPoolDraws(directPoolDraws);
    const longRunOccurrences = longRunRewardOccurrences(longRun);
    let selectedPoolDraws = longRun;
    let selectedOccurrences = longRunOccurrences;
    let current = null;
    let fragments = {
      mode: "long_run",
      upgradeDraws: {
        middle: longRun.middle - directPoolDraws.middle,
        high: longRun.high - directPoolDraws.high,
        ultimate: longRun.ultimate - directPoolDraws.ultimate,
      },
    };

    if (fragmentMode === "current") {
      current = calculateCurrentFragments(periods, input.fragmentRemainders);
      selectedPoolDraws = current.poolDraws;
      selectedOccurrences = current.rewardOccurrences;
      fragments = {
        mode: "current",
        initialRemainders: current.initialRemainders,
        expectedFinalRemainders: current.expectedFinalRemainders,
        finalProbabilityMass: current.finalProbabilityMass,
        upgradeDraws: {
          middle: current.poolDraws.middle - directPoolDraws.middle,
          high: current.poolDraws.high - directPoolDraws.high,
          ultimate: current.poolDraws.ultimate - directPoolDraws.ultimate,
        },
      };
    }

    const rewards = rewardRowsFromOccurrences(selectedOccurrences);
    const rewardBonus = scoreBonusFromRewards(rewards);
    const dropRate = baseCatchCount > 0 ? weightedDropRate / baseCatchCount : 0;
    const selectionCount =
      expectedTriggerCount > 0
        ? triggerWeightedSelectionCount / expectedTriggerCount
        : periods[0].selectionCount;
    const duplicateCount =
      expectedTriggerCount > 0
        ? triggerWeightedDuplicateCount / expectedTriggerCount
        : periods[0].duplicateCount;
    const score = {
      raw: rawScore,
      rewardBonus,
      total: rawScore + rewardBonus,
    };
    const poolDraws = {
      direct: directPoolDraws,
      longRun,
      current: current ? current.poolDraws : null,
      total: selectedPoolDraws,
    };

    return {
      fragmentMode,
      periods,
      attemptCount,
      baseCatchCount,
      dropRate,
      selectionCount,
      duplicateCount,
      expectedTriggerCount,
      expectedFishCount,
      expectedStarryFish: expectedFishCount,
      score,
      expectedScore: score,
      poolDraws,
      expectedPoolDraws: poolDraws,
      rewards,
      expectedRewards: rewards,
      fragments,
    };
  }

  return Object.freeze({ calculateDailyStarryExpectation });
});
