"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  calculateDailyStarryExpectation,
} = require("../starry-expectation.js");

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function calculate({
  attempts = 100,
  effectiveRodLevel = 10,
  weatherType = "chaotic_era",
  modifiers = {},
  fragmentMode = "long_run",
  fragmentRemainders,
} = {}) {
  return calculateDailyStarryExpectation({
    periods: [{ attempts, effectiveRodLevel, weatherType, modifiers }],
    fragmentMode,
    fragmentRemainders,
  });
}

function reward(result, pool, key) {
  return result.rewards.find(
    (entry) => entry.pool === pool && entry.key === key,
  );
}

function readGameSource(relativePath) {
  return fs.readFileSync(
    path.resolve(__dirname, "../game-source/current", relativePath),
    "utf8",
  );
}

test("普通天气的24H积分与直接奖池匹配精确基准", () => {
  const result = calculate();

  assertClose(result.dropRate, 0.05);
  assertClose(result.expectedTriggerCount, 5);
  assertClose(result.expectedFishCount, 5);
  assert.equal(result.periods[0].selectionCount, 1);
  assert.equal(result.periods[0].duplicateCount, 1);
  assertClose(result.periods[0].meanRawScore, 0.79745076809);
  assertClose(result.score.raw, 3.98725384045);
  assertClose(result.score.rewardBonus, 0.25887375);
  assertClose(result.score.total, 4.24612759045);

  assertClose(result.poolDraws.direct.none, 2.44552);
  assertClose(result.poolDraws.direct.low, 2.07099);
  assertClose(result.poolDraws.direct.middle, 0.41354);
  assertClose(result.poolDraws.direct.high, 0.06708);
  assertClose(result.poolDraws.direct.ultimate, 0.00287);
  assert.equal(result.expectedScore, result.score);
  assert.equal(result.expectedPoolDraws, result.poolDraws);
  assert.equal(result.expectedRewards, result.rewards);
});

test("太阳风、流星雨、恒纪元和药水组合遵循源码规则", () => {
  const solar = calculate({
    attempts: 10,
    weatherType: "solar_wind",
  });
  assertClose(solar.dropRate, 0.075);
  assertClose(solar.expectedTriggerCount, 0.75);

  const meteor = calculate({ attempts: 1, weatherType: "meteor_shower" });
  assert.equal(meteor.periods[0].selectionCount, 2);
  assertClose(meteor.periods[0].meanRawScore, 1.362973106640668);

  const hengjiyuan = calculate({ attempts: 1, weatherType: "hengjiyuan" });
  assert.equal(hengjiyuan.periods[0].hengjiyuan, true);
  assertClose(hengjiyuan.periods[0].meanRawScore, 1.4333522257137756);

  const gammaLucky = calculate({
    attempts: 10,
    weatherType: "chaotic_era",
    modifiers: { gamma: true, lucky: true },
  });
  assertClose(gammaLucky.dropRate, 0.075);
  assert.equal(gammaLucky.periods[0].solarWind, true);
  assert.equal(gammaLucky.periods[0].meteorShower, true);
  assert.equal(gammaLucky.periods[0].hengjiyuan, true);
  assert.equal(gammaLucky.periods[0].selectionCount, 3);

  const duoduo = calculate({
    attempts: 10,
    effectiveRodLevel: 10,
    modifiers: { duoduo: true },
  });
  assertClose(duoduo.dropRate, 0.05);
  assertClose(duoduo.expectedTriggerCount, 0.5);
  assertClose(duoduo.expectedFishCount, 1);
  assert.equal(duoduo.periods[0].duplicateCount, 2);

  const doubleCatch = calculate({
    attempts: 10,
    modifiers: { doubleCatch: true },
  });
  assertClose(doubleCatch.baseCatchCount, 20);
  assertClose(doubleCatch.expectedTriggerCount, 1);
});

test("期望公式依赖的 Python 源码规则没有漂移", () => {
  const constants = readGameSource("constants.py");
  const engine = readGameSource("core/engine.py");
  const rewards = readGameSource("core/starry_rewards.py");

  assert.match(constants, /STARRY_FISH_DROP_RATE = 0\.05/);
  assert.match(constants, /STARRY_FISH_ROD_BONUS_THRESHOLD = 10/);
  assert.match(constants, /STARRY_FISH_ROD_BONUS_PER_LEVEL = 0\.005/);
  assert.match(constants, /STARRY_FISH_SOLAR_WIND_BONUS = 0\.025/);
  assert.match(
    engine,
    /base_catch_count = 2 if effects\["double_catch"\] else 1/,
  );
  assert.match(
    engine,
    /if has_gamma_burst:\r?\n\s+has_solar_wind = True\r?\n\s+has_meteor_shower = True\r?\n\s+has_hengjiyuan = True/,
  );
  assert.match(engine, /remaining_minutes \/ fishing_interval/);
  assert.equal((rewards.match(/"upgrade_need": 5/g) || []).length, 3);
  assert.match(rewards, /"lottery_fragment_low"[\s\S]*?"upgrade_pool": "middle"/);
  assert.match(rewards, /"lottery_fragment_mid"[\s\S]*?"upgrade_pool": "high"/);
  assert.match(rewards, /"lottery_fragment_high"[\s\S]*?"upgrade_pool": "ultimate"/);
});

test("多时段顶层掉率和候选数按基础判定及成功触发加权", () => {
  const result = calculateDailyStarryExpectation({
    periods: [
      {
        attempts: 10,
        effectiveRodLevel: 10,
        weatherType: "chaotic_era",
        modifiers: {},
      },
      {
        attempts: 10,
        effectiveRodLevel: 20,
        weatherType: "solar_wind",
        modifiers: { lucky: true, doubleCatch: true },
      },
    ],
  });

  assertClose(result.baseCatchCount, 30);
  assertClose(result.dropRate, (10 * 0.05 + 20 * 0.125) / 30);
  assertClose(result.expectedTriggerCount, 3);
  assertClose(result.selectionCount, (0.5 * 1 + 2.5 * 2) / 3);
});

test("长期碎片换奖保持各级奖池的守恒关系", () => {
  const result = calculate();
  const direct = result.poolDraws.direct;
  const total = result.poolDraws.longRun;

  assertClose(total.middle, direct.middle + direct.low / 20);
  assertClose(total.high, direct.high + total.middle / 25);
  assertClose(total.ultimate, direct.ultimate + total.high / 20);

  assertClose(reward(result, "low", "corn").expectedOccurrences, direct.low / 4);
  assertClose(
    reward(result, "middle", "duoduo_potion").expectedOccurrences,
    total.middle / 5,
  );
  assertClose(
    reward(result, "high", "time_potion").expectedOccurrences,
    total.high / 4,
  );
  const ultimateTime = reward(result, "ultimate", "time_potion");
  assertClose(ultimateTime.expectedOccurrences, total.ultimate / 2);
  assertClose(ultimateTime.expectedQuantity, (total.ultimate / 2) * 10);
});

test("当前碎片模式从零余数开始时单次判定不会提前合成", () => {
  const result = calculate({
    attempts: 1,
    fragmentMode: "current",
    fragmentRemainders: { low: 0, middle: 0, high: 0 },
  });

  for (const pool of ["none", "low", "middle", "high", "ultimate"]) {
    assertClose(result.poolDraws.current[pool], result.poolDraws.direct[pool]);
  }
  assertClose(result.fragments.expectedFinalRemainders.low, 0.0207099 / 4);
  assertClose(result.fragments.expectedFinalRemainders.middle, 0.0041354 / 5);
  assertClose(result.fragments.expectedFinalRemainders.high, 0.0006708 / 4);
  assertClose(result.fragments.finalProbabilityMass, 1);
});

test("当前碎片模式在4/4/4余数下立即完成三级连锁", () => {
  const result = calculate({
    attempts: 1,
    fragmentMode: "current",
    fragmentRemainders: { low: 4, middle: 4, high: 4 },
  });
  const direct = result.poolDraws.direct;
  const current = result.poolDraws.current;

  assertClose(current.middle, direct.middle + direct.low / 4);
  assertClose(current.high, direct.high + current.middle / 5);
  assertClose(current.ultimate, direct.ultimate + current.high / 4);
  assert.ok(current.ultimate > result.poolDraws.longRun.ultimate);
  assertClose(result.fragments.finalProbabilityMass, 1);
});

test("小数理论次数对完整双倍收杆做一次概率门控", () => {
  const options = {
    fragmentMode: "current",
    fragmentRemainders: { low: 3, middle: 4, high: 4 },
    modifiers: { doubleCatch: true },
  };
  const full = calculate({ ...options, attempts: 1 });
  const half = calculate({ ...options, attempts: 0.5 });

  for (const pool of ["none", "low", "middle", "high", "ultimate"]) {
    assertClose(half.poolDraws.current[pool], full.poolDraws.current[pool] / 2);
  }
  for (const fragment of ["low", "middle", "high"]) {
    assertClose(
      half.fragments.expectedFinalRemainders[fragment],
      (options.fragmentRemainders[fragment] +
        full.fragments.expectedFinalRemainders[fragment]) /
        2,
    );
  }
});

test("复杂当前碎片场景保持奖池质量和三级碎片守恒", () => {
  const initial = { low: 4, middle: 3, high: 2 };
  const result = calculate({
    attempts: 37.35,
    effectiveRodLevel: 20,
    weatherType: "meteor_shower",
    modifiers: {
      duoduo: true,
      lucky: true,
      doubleCatch: true,
    },
    fragmentMode: "current",
    fragmentRemainders: initial,
  });

  const occurrencesByPool = result.rewards.reduce((totals, entry) => {
    totals[entry.pool] += entry.expectedOccurrences;
    return totals;
  }, { low: 0, middle: 0, high: 0, ultimate: 0 });
  for (const pool of Object.keys(occurrencesByPool)) {
    assertClose(
      occurrencesByPool[pool],
      result.poolDraws.current[pool],
      1e-9,
    );
  }

  const fragmentOccurrence = (pool, key) =>
    reward(result, pool, key).expectedOccurrences;
  const expectedRemainders = {
    low:
      initial.low +
      fragmentOccurrence("low", "lottery_fragment_low") -
      5 * (result.poolDraws.current.middle - result.poolDraws.direct.middle),
    middle:
      initial.middle +
      fragmentOccurrence("middle", "lottery_fragment_mid") -
      5 * (result.poolDraws.current.high - result.poolDraws.direct.high),
    high:
      initial.high +
      fragmentOccurrence("high", "lottery_fragment_high") -
      5 *
        (result.poolDraws.current.ultimate -
          result.poolDraws.direct.ultimate),
  };
  for (const fragment of Object.keys(expectedRemainders)) {
    assertClose(
      result.fragments.expectedFinalRemainders[fragment],
      expectedRemainders[fragment],
      1e-9,
    );
  }
  assertClose(result.fragments.finalProbabilityMass, 1, 1e-12);
});

test("多多同编号复制与双倍捕获的独立编号保持不同相关性", () => {
  const common = {
    attempts: 1,
    effectiveRodLevel: 10,
    weatherType: "chaotic_era",
    fragmentMode: "current",
    fragmentRemainders: { low: 3, middle: 4, high: 4 },
  };
  const duoduo = calculate({
    ...common,
    modifiers: { duoduo: true },
  });
  const doubleCatch = calculate({
    ...common,
    modifiers: { doubleCatch: true },
  });

  assertClose(duoduo.expectedFishCount, doubleCatch.expectedFishCount);
  assertClose(duoduo.score.raw, doubleCatch.score.raw);
  assertClose(duoduo.poolDraws.current.middle, 0.00956516875);
  assertClose(doubleCatch.poolDraws.current.middle, 0.008297606247375626);
  assertClose(duoduo.poolDraws.current.high, 0.00308921775);
  assertClose(doubleCatch.poolDraws.current.high, 0.003000437188148723);
  assert.notEqual(
    duoduo.poolDraws.current.ultimate,
    doubleCatch.poolDraws.current.ultimate,
  );
});

test("浏览器入口消费聚合数据且暴露FISH命名空间", () => {
  const sandbox = {};
  const root = path.resolve(__dirname, "..");
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "starry-score-pmf.js"), "utf8"),
    sandbox,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "starry-expectation.js"), "utf8"),
    sandbox,
  );

  assert.equal(
    typeof sandbox.FISH_STARRY_EXPECTATION.calculateDailyStarryExpectation,
    "function",
  );
  const result = sandbox.FISH_STARRY_EXPECTATION.calculateDailyStarryExpectation({
    periods: [
      {
        attempts: 100,
        effectiveRodLevel: 10,
        weatherType: "chaotic_era",
        modifiers: {},
      },
    ],
  });
  assertClose(result.expectedFishCount, 5);
});

test("拒绝无效天气、碎片余数和过大的当前状态计算", () => {
  assert.throws(
    () => calculate({ weatherType: "rain" }),
    /unsupported starry weather type/,
  );
  assert.throws(
    () =>
      calculate({
        attempts: 1,
        fragmentMode: "current",
        fragmentRemainders: { low: 5, middle: 0, high: 0 },
      }),
    /fragmentRemainders.low/,
  );
  assert.throws(
    () =>
      calculate({
        attempts: 10001,
        fragmentMode: "current",
        fragmentRemainders: { low: 0, middle: 0, high: 0 },
      }),
    /at most 10000 intervals/,
  );
});
