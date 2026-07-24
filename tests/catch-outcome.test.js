"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canUpgradeCatBuildingLevel,
  calculateCatBaitConsumptionFactor,
  calculateCatWeatherExpectedValue,
  calculateBestCatchDistribution,
  calculateExpectedFishQuantity,
  calculateFishSalePrice,
  calculateSpecialUtrDropRate,
  getCatBuildingLevelAfterStep,
  getClampedRarityDistribution,
  getMappedRarityEntries,
  getMappedRarityProfile,
  isMapAccessibleByRod,
  isSpecialUtrEnabled,
  normalizeCatBuildingLevels,
} = require("../catch-outcome.js");

const baseOptions = {
  rarityOrder: ["N"],
  rarityMultipliers: { N: 1 },
  profile: { N: 100 },
  materialDropRate: 0,
  materialValue: 0,
  rollCount: 2,
};

const catBuildingIds = [
  "catCabin",
  "catFishPond",
  "catClimbingPlaza",
  "catCafe",
  "catCoaster",
  "spinningCatTeaser",
  "crystalCatCastle",
  "catFerrisWheel",
  "legendaryCatStatue",
];
const catStatueId = "legendaryCatStatue";

test("配置包含幸运药水、闪光药水和猫框15次保底", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const config = global.window.FISH_FISHING_CONFIG;
  const luckyPotion = config.potions.find(
    (item) => item.id === "lucky_double",
  );
  const flashPotion = config.potions.find(
    (item) => item.id === "gamma_ray_burst",
  );
  global.window = previousWindow;

  assert.equal(luckyPotion?.bestCatchRolls, 2);
  assert.equal(luckyPotion?.rodLevelPenalty, 0);
  assert.equal(luckyPotion?.fishCatchMultiplier, 1);
  assert.equal(flashPotion?.name, "闪光药水");
  assert.equal(flashPotion?.autoSyncPriority, 0);
  assert.equal(config.catFramePityCount, 15);
});

test("配置覆盖初始鱼钩 Lv.0 和有效鱼竿 Lv.21", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const config = global.window.FISH_FISHING_CONFIG;
  global.window = previousWindow;

  assert.deepEqual(config.hookLevels[0], {
    level: 0,
    name: "鱼钩 Lv.0",
    speed: 0,
  });
  assert.equal(config.rodLevels.at(-1)?.level, 21);
  assert.equal(
    config.maps.find((map) => map.id === "S1")?.maxRarity,
    "UR",
  );
});

test("14/15 图换位后保持鱼种与基础鱼价配对", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const config = global.window.FISH_FISHING_CONFIG;
  global.window = previousWindow;

  assert.deepEqual(config.maps.find((map) => map.id === 14), {
    id: 14,
    difficulty: 13,
    name: "云鲸庭",
    fishes: [
      { name: "云须鲸鱼", nPrice: 253 },
      { name: "鲸歌鲤", nPrice: 275 },
      { name: "浮庭鲫", nPrice: 264 },
      { name: "天羽鳐", nPrice: 259 },
      { name: "雾铃鳕", nPrice: 269 },
    ],
  });
  assert.deepEqual(config.maps.find((map) => map.id === 15), {
    id: 15,
    difficulty: 14,
    name: "星砂漠",
    fishes: [
      { name: "沙星魟", nPrice: 290 },
      { name: "琉璃沙鳗", nPrice: 314 },
      { name: "星蝎鲶", nPrice: 301 },
      { name: "金尘鲷", nPrice: 296 },
      { name: "海市蜃鱼", nPrice: 308 },
    ],
  });
});

test("幸运药水同稀有度不按鱼价取优", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }, { nPrice: 20 }],
  });

  assert.equal(result.fishExpectedValue, 15);
  assert.equal(result.profile.N, 100);
});

test("幸运药水同稀有度优先未收集鱼", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [
      { nPrice: 10, collectedByRarity: { N: true } },
      { nPrice: 20, collectedByRarity: { N: false } },
    ],
    hasCollectionData: true,
  });

  assert.equal(result.fishExpectedValue, 17.5);
});

test("普通图幸运取优只使用封顶后的稀有度优先级", () => {
  const result = calculateBestCatchDistribution({
    rarityOrder: ["UR"],
    rarityMultipliers: { UR: 16 },
    profile: { UR: 100 },
    rarityEntries: [
      { selectionRarity: "UR", rarity: "UR", probability: 50 },
      { selectionRarity: "UTR", rarity: "UR", probability: 50 },
    ],
    fishes: [
      { nPrice: 10, collectedByRarity: { UR: true } },
      { nPrice: 20, collectedByRarity: { UR: false } },
    ],
    hasCollectionData: true,
    rollCount: 2,
  });

  assert.equal(result.profile.UR, 100);
  assert.equal(result.fishExpectedValue, 280);
});

test("城堡每次捕获只判定一次，幸运结果共享同一鱼竿等级", () => {
  const result = calculateBestCatchDistribution({
    rarityOrder: ["UR", "N"],
    rarityMultipliers: { UR: 16, N: 1 },
    profile: { UR: 50, N: 50 },
    fishes: [{ nPrice: 10 }],
    rollCount: 2,
    rollBranches: [
      { probability: 0.5, profile: { UR: 0, N: 100 } },
      { probability: 0.5, profile: { UR: 100, N: 0 } },
    ],
  });

  assert.deepEqual(result.profile, { UR: 50, N: 50 });
  assert.equal(result.fishExpectedValue, 85);
});

test("幸运的同稀有度未收集优先只发生在各自城堡分支内", () => {
  const result = calculateBestCatchDistribution({
    rarityOrder: ["R", "N"],
    rarityMultipliers: { R: 2, N: 1 },
    profile: { R: 30, N: 70 },
    fishes: [
      { nPrice: 10, collectedByRarity: { R: true, N: true } },
      { nPrice: 20, collectedByRarity: { R: false, N: false } },
    ],
    hasCollectionData: true,
    rollCount: 2,
    rollBranches: [
      { probability: 0.7, profile: { R: 0, N: 100 } },
      { probability: 0.3, profile: { R: 100, N: 0 } },
    ],
  });

  assert.ok(Math.abs(result.profile.R - 30) < 1e-12);
  assert.ok(Math.abs(result.profile.N - 70) < 1e-12);
  assert.equal(result.fishExpectedValue, 22.75);
});

test("过山车天气增幅作用于迷途风特殊UTR", () => {
  const normal = calculateSpecialUtrDropRate({
    rodLevel: 15,
    mapDifficulty: 6,
    baseProbabilityPercent: 0.2,
    leadStepProbabilityPercent: 0.1,
  });
  const boosted = calculateSpecialUtrDropRate({
    rodLevel: 15,
    mapDifficulty: 6,
    baseProbabilityPercent: 0.2,
    leadStepProbabilityPercent: 0.1,
    weatherBoostPercent: 10,
  });

  assert.ok(Math.abs(normal - 1) < 1e-12);
  assert.ok(Math.abs(boosted - 1.1) < 1e-12);
});

test("城堡分支混合后只应用一次共享UTR保底", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    rollCount: 2,
    specialUtrPityCount: 150,
    rollBranches: [
      { probability: 0.7, specialUtrDropRate: 0.22 },
      { probability: 0.3, specialUtrDropRate: 0.33 },
    ],
  });
  const baseLuckyRate = 1 - Math.pow(1 - 0.0022, 2);
  const bonusLuckyRate = 1 - Math.pow(1 - 0.0033, 2);
  const mixedRandomRate = baseLuckyRate * 0.7 + bonusLuckyRate * 0.3;
  const expectedRate =
    (mixedRandomRate / (1 - Math.pow(1 - mixedRandomRate, 150))) * 100;

  assert.ok(Math.abs(result.specialUtrDropRate - expectedRate) < 1e-10);
});

test("建筑未全满时材料优先于鱼", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    profile: { N: 100 },
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
    profile: { N: 100 },
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
    profile: { N: 100 },
    materialDropRate: 50,
    materialValue: 0,
    preferMaterial: true,
  });
  const fishFirst = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 1 }],
    profile: { N: 100 },
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
    profile: { R: 20, N: 80 },
    materialDropRate: 30,
    materialValue: 0,
    rollCount: 2,
    preferMaterial: true,
  });
  const totalProbability =
    result.profile.R + result.profile.N + result.materialDropRate;

  assert.ok(Math.abs(totalProbability - 100) < 1e-10);
});

test("S1 普通表封顶到 UR，不自然产出 UTR 或回落 N", () => {
  const d9 = getMappedRarityProfile({
    probabilities: [0, 0, 0.0677, 0.3774, 0.4412, 0.1137],
    maxRarity: "UR",
  });
  const d11 = getMappedRarityProfile({
    probabilities: [0, 0, 0, 0.1085, 0.4426, 0.3785, 0.0704],
    maxRarity: "UR",
  });

  assert.deepEqual(d9, {
    UTR: 0,
    UR: 55.49,
    SSR: 37.74,
    SR: 6.77,
    R: 0,
    N: 0,
  });
  assert.deepEqual(d11, {
    UTR: 0,
    UR: 89.15,
    SSR: 10.85,
    SR: 0,
    R: 0,
    N: 0,
  });
});

test("普通图高渔力概率不再归零，并按 UR 上限封顶", () => {
  const profile = getMappedRarityProfile({
    probabilities: [0, 0, 0, 0, 0.3153, 0.5039, 0.1808],
    maxRarity: "UR",
  });

  assert.deepEqual(profile, {
    UTR: 0,
    UR: 100,
    SSR: 0,
    SR: 0,
    R: 0,
    N: 0,
  });
  assert.deepEqual(
    getMappedRarityEntries({
      probabilities: [0, 0, 0.0677, 0.3774, 0.4412, 0.1137],
      maxRarity: "UR",
    }),
    [
      { selectionRarity: "SR", rarity: "SR", probability: 6.77 },
      { selectionRarity: "SSR", rarity: "SSR", probability: 37.74 },
      { selectionRarity: "UR", rarity: "UR", probability: 55.49 },
    ],
  );
});

test("高槽可归并到任意普通表上限", () => {
  assert.deepEqual(
    getMappedRarityProfile({
      probabilities: [0.1, 0.2, 0.15, 0.1, 0.15, 0.1, 0.05, 0.15],
      maxRarity: "SSR",
    }),
    {
      UTR: 0,
      UR: 0,
      SSR: 55,
      SR: 15,
      R: 20,
      N: 10,
    },
  );
});

test("流星先封顶到地图上限，再从次高档移到最高档", () => {
  const probabilities = [0, 0, 0.0677, 0.3774, 0.4412, 0.1137];
  const normal = getMappedRarityProfile({
    probabilities,
    maxRarity: "UR",
    meteorBonusPercent: 2,
  });
  const capped = getMappedRarityProfile({
    probabilities: [0, 0, 0, 0, 0.3153, 0.5039, 0.1808],
    maxRarity: "UR",
    meteorBonusPercent: 2,
  });

  assert.deepEqual(normal, {
    UTR: 0,
    UR: 57.49,
    SSR: 35.74,
    SR: 6.77,
    R: 0,
    N: 0,
  });
  assert.deepEqual(capped, {
    UTR: 0,
    UR: 100,
    SSR: 0,
    SR: 0,
    R: 0,
    N: 0,
  });
});

test("星空图普通概率截断到 UR，UTR 仅由特殊掉落补入", () => {
  const profile = getMappedRarityProfile({
    probabilities: [0, 0, 0, 0, 0.3153, 0.5039, 0.1808],
    maxRarity: "UTR",
    isStarry: true,
  });

  assert.deepEqual(profile, {
    UTR: 0,
    UR: 100,
    SSR: 0,
    SR: 0,
    R: 0,
    N: 0,
  });
});

test("高渔力差钳制到源码最后一行", () => {
  const previousWindow = global.window;
  global.window = {};
  delete require.cache[require.resolve("../config.js")];
  require("../config.js");
  const config = global.window.FISH_FISHING_CONFIG;
  const distribution = config.rarityDistribution;
  global.window = previousWindow;

  const d19 = getMappedRarityProfile({
    probabilities: getClampedRarityDistribution(distribution, 19),
    maxRarity: "UR",
  });
  const d25 = getMappedRarityProfile({
    probabilities: getClampedRarityDistribution(distribution, 25),
    maxRarity: "UR",
  });
  assert.equal(d19.UR, 100);
  assert.equal(d19.N, 0);
  assert.deepEqual(d25, d19);

  const result = calculateBestCatchDistribution({
    rarityOrder: config.rarityOrder,
    rarityMultipliers: config.rarityMultipliers,
    profile: d19,
    rarityEntries: getMappedRarityEntries({
      probabilities: getClampedRarityDistribution(distribution, 19),
      maxRarity: "UR",
    }),
    fishes: [{ nPrice: 10 }],
    rollCount: 1,
  });
  assert.equal(result.profile.UR, 100);
  assert.equal(result.profile.N, 0);
  assert.equal(result.fishExpectedValue, 160);
});

test("星空特殊 UTR 仅在完成场景成就且乱纪元有效时启用", () => {
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "chaotic_era",
      weatherInactive: false,
    }),
    true,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "solar_wind",
      weatherInactive: false,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "meteor_shower",
      weatherInactive: false,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "hengjiyuan",
      weatherInactive: false,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "unknown",
      weatherInactive: false,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: true,
      weatherType: "chaotic_era",
      weatherInactive: true,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: true,
      hasAchievement: false,
      weatherType: "chaotic_era",
      weatherInactive: false,
    }),
    false,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: false,
      weatherType: "lost_wind",
      weatherInactive: false,
    }),
    true,
  );
  assert.equal(
    isSpecialUtrEnabled({
      isStarry: false,
      weatherType: "lost_wind",
      weatherInactive: true,
    }),
    false,
  );
});

test("幸运先合并两次随机 UTR，再应用共享 150 次保底", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    specialUtrDropRate: 0.2,
    specialUtrPityCount: 150,
  });
  const randomHitRate = 1 - Math.pow(1 - 0.002, 2);
  const expectedRate =
    (randomHitRate / (1 - Math.pow(1 - randomHitRate, 150))) * 100;

  assert.ok(Math.abs(result.specialUtrDropRate - expectedRate) < 1e-8);
  assert.ok(Math.abs(result.specialUtrDropRate - 0.885) < 0.001);
});

test("展示木框与特殊 UTR 共用源码保底执行顺序", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    displayFrameDropRate: 0.7,
    displayFramePityCount: 150,
    specialUtrDropRate: 0.2,
    specialUtrPityCount: 150,
  });

  assert.ok(Math.abs(result.displayFrameDropRate - 1.582638579982) < 1e-9);
  assert.ok(Math.abs(result.specialUtrDropRate - 0.881233164924) < 1e-9);
  assert.ok(
    Math.abs(
      Object.values(result.profile).reduce((total, value) => total + value, 0) +
        result.displayFrameDropRate +
        result.materialDropRate -
        100,
    ) < 1e-9,
  );
});

test("展示木框包含 0.7% 随机掉落和 150 次保底，价值保持为0", () => {
  const result = calculateBestCatchDistribution({
    ...baseOptions,
    fishes: [{ nPrice: 10 }],
    rollCount: 1,
    displayFrameDropRate: 0.7,
    displayFramePityCount: 150,
    displayFrameValue: 0,
  });
  const expectedRate = (0.007 / (1 - Math.pow(0.993, 150))) * 100;

  assert.ok(Math.abs(result.displayFrameDropRate - expectedRate) < 1e-8);
  assert.equal(result.displayFrameExpectedValue, 0);
});

test("猫咖按鱼种和稀有度完成乘法后向下取整", () => {
  assert.equal(calculateFishSalePrice(47, 16, 10), 827);
  assert.equal(calculateFishSalePrice(47, 1, 10), 51);
});

test("多多地图准入使用原始鱼竿等级", () => {
  assert.equal(isMapAccessibleByRod(6, 6), true);
  assert.equal(isMapAccessibleByRod(6, 5), false);
});

test("多多药水与旋转逗猫棒按数量加概率组合", () => {
  assert.equal(
    calculateExpectedFishQuantity({
      baseQuantity: 2,
      extraQuantityChance: 0.1,
    }),
    2.1,
  );
});

test("猫天气整组鱼全被吃时不消耗鱼饵", () => {
  assert.ok(
    Math.abs(
      calculateCatBaitConsumptionFactor({
        fishProbability: 1,
        eatChance: 0.15,
        baseQuantity: 1,
        extraQuantityChance: 0,
      }) - 0.85,
    ) < 1e-12,
  );
  assert.ok(
    Math.abs(
      calculateCatBaitConsumptionFactor({
        fishProbability: 1,
        eatChance: 0.15,
        baseQuantity: 2,
        extraQuantityChance: 0.1,
      }) - 0.9794125,
    ) < 1e-12,
  );
});

test("猫框随机判定包含15次保底的长期稳态概率", () => {
  const normal = calculateCatWeatherExpectedValue({
    fishProbability: 1,
    eatChance: 1,
    catFrameValue: 1,
    catFramePityCount: 15,
  });
  const lucky = calculateCatWeatherExpectedValue({
    fishProbability: 1,
    eatChance: 1,
    catFrameValue: 1,
    catFramePityCount: 15,
    lucky: true,
  });
  const normalExpected = 0.15 / (1 - Math.pow(0.85, 15));
  const luckyRandomProbability = 1 - Math.pow(0.85, 2);
  const luckyExpected =
    luckyRandomProbability /
    (1 - Math.pow(1 - luckyRandomProbability, 15));

  assert.ok(Math.abs(normal - normalExpected) < 1e-12);
  assert.ok(Math.abs(lucky - luckyExpected) < 1e-12);
});

test("幸运猫礼物追加一次猫框判定，保底会替代原礼物分支", () => {
  const normal = calculateCatWeatherExpectedValue({
    fishExpectedValue: 12,
    originalHalfPriceExpectedValue: 5,
    sameRarityGiftExpectedValue: 12,
    fishProbability: 1,
    baitPrice: 2,
    eatChance: 0.15,
    catFrameValue: 200,
    catFramePityCount: 15,
    lucky: false,
  });
  const lucky = calculateCatWeatherExpectedValue({
    fishExpectedValue: 12,
    originalHalfPriceExpectedValue: 5,
    sameRarityGiftExpectedValue: 12,
    fishProbability: 1,
    baitPrice: 2,
    eatChance: 0.15,
    catFrameValue: 200,
    catFramePityCount: 15,
    lucky: true,
  });

  assert.ok(Math.abs(normal - 15.661598007438023) < 1e-12);
  assert.ok(Math.abs(lucky - 19.046658950988338) < 1e-12);
});

test("普通猫建筑升级受传奇猫雕像等级限制", () => {
  const levels = Object.fromEntries(catBuildingIds.map((id) => [id, 1]));

  assert.equal(
    canUpgradeCatBuildingLevel({
      buildingId: "catCabin",
      buildingIds: catBuildingIds,
      levels: { ...levels, catCabin: 1, [catStatueId]: 0 },
      statueId: catStatueId,
      maxLevel: 3,
    }),
    false,
  );
  assert.equal(
    canUpgradeCatBuildingLevel({
      buildingId: "catCabin",
      buildingIds: catBuildingIds,
      levels: { ...levels, catCabin: 1, [catStatueId]: 1 },
      statueId: catStatueId,
      maxLevel: 3,
    }),
    true,
  );
  assert.equal(
    canUpgradeCatBuildingLevel({
      buildingId: "catCabin",
      buildingIds: catBuildingIds,
      levels: { ...levels, catCabin: 2, [catStatueId]: 1 },
      statueId: catStatueId,
      maxLevel: 3,
    }),
    false,
  );
  assert.equal(
    canUpgradeCatBuildingLevel({
      buildingId: "catCabin",
      buildingIds: catBuildingIds,
      levels: { ...levels, catCabin: 2, [catStatueId]: 2 },
      statueId: catStatueId,
      maxLevel: 3,
    }),
    true,
  );
});

test("猫建筑等级只允许合法升级且不能手动降级", () => {
  const levelOne = Object.fromEntries(catBuildingIds.map((id) => [id, 1]));
  const blockedStatue = { ...levelOne, catCabin: 0, [catStatueId]: 0 };

  assert.equal(
    getCatBuildingLevelAfterStep({
      buildingId: "catCabin",
      buildingIds: catBuildingIds,
      levels: levelOne,
      statueId: catStatueId,
      maxLevel: 3,
      step: -1,
    }),
    1,
  );
  assert.equal(
    canUpgradeCatBuildingLevel({
      buildingId: catStatueId,
      buildingIds: catBuildingIds,
      levels: blockedStatue,
      statueId: catStatueId,
      maxLevel: 3,
    }),
    false,
  );
});

test("旧的非法猫建筑状态向下收敛为最大合法状态", () => {
  const normalized = normalizeCatBuildingLevels({
    buildingIds: catBuildingIds,
    levels: {
      ...Object.fromEntries(catBuildingIds.map((id) => [id, 3])),
      catCabin: 1,
      catFishPond: 3,
      [catStatueId]: 3,
    },
    statueId: catStatueId,
    maxLevel: 3,
  });

  assert.equal(normalized[catStatueId], 1);
  assert.equal(normalized.catCabin, 1);
  assert.equal(normalized.catFishPond, 2);
  assert.deepEqual(
    normalizeCatBuildingLevels({
      buildingIds: catBuildingIds,
      levels: normalized,
      statueId: catStatueId,
      maxLevel: 3,
    }),
    normalized,
  );
});
