"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateBestCatchDistribution,
} = require("../catch-outcome.js");

const baseOptions = {
  rarityOrder: ["N"],
  rarityMultipliers: { N: 1 },
  profile: { N: 100 },
  materialDropRate: 0,
  materialValue: 0,
  rollCount: 2,
};

test("配置包含 id 为 lucky_double 的幸运药水", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const potion = global.window.FISH_FISHING_CONFIG.potions.find(
    (item) => item.id === "lucky_double",
  );
  global.window = previousWindow;

  assert.equal(potion?.bestCatchRolls, 2);
  assert.equal(potion?.rodLevelPenalty, 0);
  assert.equal(potion?.fishCatchMultiplier, 1);
});

test("幸运药水按实际鱼价从两次判定中取更贵的鱼", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }, { nPrice: 20 }],
  });

  assert.equal(result.fishExpectedValue, 17.5);
  assert.equal(result.profile.N, 100);
});

test("建筑未全满时材料优先于鱼", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    profile: { N: 70 },
    materialDropRate: 30,
    materialValue: 80,
    preferMaterial: true,
  });

  assert.ok(Math.abs(result.materialDropRate - 51) < 1e-10);
  assert.ok(Math.abs(result.materialExpectedValue - 40.8) < 1e-10);
  assert.ok(Math.abs(result.fishExpectedValue - 4.9) < 1e-10);
});

test("建筑全满 Lv3 时鱼优先于材料", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    profile: { N: 70 },
    materialDropRate: 30,
    materialValue: 80,
    preferMaterial: false,
  });

  assert.ok(Math.abs(result.materialDropRate - 9) < 1e-10);
  assert.ok(Math.abs(result.materialExpectedValue - 7.2) < 1e-10);
  assert.ok(Math.abs(result.fishExpectedValue - 9.1) < 1e-10);
});

test("鱼与材料的优先级不按材料金币价值决定", () => {
  const materialFirst = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 100 }],
    profile: { N: 50 },
    materialDropRate: 50,
    materialValue: 0,
    preferMaterial: true,
  });
  const fishFirst = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 1 }],
    profile: { N: 50 },
    materialDropRate: 50,
    materialValue: 1000,
    preferMaterial: false,
  });

  assert.equal(materialFirst.materialDropRate, 75);
  assert.equal(fishFirst.materialDropRate, 25);
});

test("取优后的鱼和材料概率总和保持 100%", () => {
  const result = calculateBestCatchDistribution({
    rarityOrder: ["R", "N"],
    rarityMultipliers: { R: 2, N: 1 },
    fishes: [{ nPrice: 10 }, { nPrice: 15 }],
    profile: { R: 14, N: 56 },
    materialDropRate: 30,
    materialValue: 0,
    rollCount: 2,
    preferMaterial: true,
  });
  const totalProbability =
    result.profile.R + result.profile.N + result.materialDropRate;

  assert.ok(Math.abs(totalProbability - 100) < 1e-10);
});
