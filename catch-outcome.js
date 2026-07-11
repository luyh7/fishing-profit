(function (globalScope, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.FISH_CATCH_OUTCOME = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function buildCatchOutcomes(options) {
    const profile = options?.profile || {};
    const rarityOrder = Array.isArray(options?.rarityOrder)
      ? options.rarityOrder
      : [];
    const rarityMultipliers = options?.rarityMultipliers || {};
    const fishes = Array.isArray(options?.fishes) ? options.fishes : [];
    const outcomes = [];

    if (fishes.length > 0) {
      rarityOrder.forEach((rarity) => {
        const rarityProbability = Math.max(
          0,
          toFiniteNumber(profile[rarity]) / 100,
        );
        const probabilityPerFish = rarityProbability / fishes.length;
        const rarityMultiplier = toFiniteNumber(rarityMultipliers[rarity]);

        fishes.forEach((fish) => {
          outcomes.push({
            kind: "fish",
            rarity,
            price: toFiniteNumber(fish?.nPrice) * rarityMultiplier,
            probability: probabilityPerFish,
          });
        });
      });
    }

    const materialProbability = Math.max(
      0,
      Math.min(1, toFiniteNumber(options?.materialDropRate) / 100),
    );
    if (materialProbability > 0) {
      outcomes.push({
        kind: "material",
        rarity: "",
        price: Math.max(0, toFiniteNumber(options?.materialValue)),
        probability: materialProbability,
      });
    }

    const totalProbability = outcomes.reduce(
      (total, outcome) => total + outcome.probability,
      0,
    );
    if (totalProbability <= 0) {
      return [];
    }

    return outcomes.map((outcome, index) => ({
      ...outcome,
      index,
      probability: outcome.probability / totalProbability,
    }));
  }

  function selectBetterOutcome(left, right, preferMaterial) {
    if (left.kind !== right.kind) {
      if (preferMaterial) {
        return left.kind === "material" ? left : right;
      }
      return left.kind === "fish" ? left : right;
    }

    if (left.kind === "fish" && right.price > left.price) {
      return right;
    }
    return left;
  }

  function calculateBestCatchDistribution(options) {
    const outcomes = buildCatchOutcomes(options);
    const rollCount = Math.max(
      1,
      Math.floor(toFiniteNumber(options?.rollCount) || 1),
    );
    const preferMaterial = Boolean(options?.preferMaterial);
    const rarityOrder = Array.isArray(options?.rarityOrder)
      ? options.rarityOrder
      : [];
    const profile = rarityOrder.reduce((result, rarity) => {
      result[rarity] = 0;
      return result;
    }, {});

    if (!outcomes.length) {
      return {
        profile,
        fishExpectedValue: 0,
        materialDropRate: 0,
        materialExpectedValue: 0,
      };
    }

    let selectedDistribution = outcomes.map((outcome) => ({
      outcome,
      probability: outcome.probability,
    }));

    for (let roll = 1; roll < rollCount; roll += 1) {
      const nextProbabilityByOutcome = new Map();
      selectedDistribution.forEach((selected) => {
        outcomes.forEach((contender) => {
          const winner = selectBetterOutcome(
            selected.outcome,
            contender,
            preferMaterial,
          );
          const probability = selected.probability * contender.probability;
          nextProbabilityByOutcome.set(
            winner.index,
            (nextProbabilityByOutcome.get(winner.index) || 0) + probability,
          );
        });
      });
      selectedDistribution = outcomes
        .filter((outcome) => nextProbabilityByOutcome.has(outcome.index))
        .map((outcome) => ({
          outcome,
          probability: nextProbabilityByOutcome.get(outcome.index),
        }));
    }

    let fishExpectedValue = 0;
    let materialProbability = 0;
    let materialExpectedValue = 0;
    selectedDistribution.forEach(({ outcome, probability }) => {
      if (outcome.kind === "material") {
        materialProbability += probability;
        materialExpectedValue += probability * outcome.price;
        return;
      }

      profile[outcome.rarity] =
        toFiniteNumber(profile[outcome.rarity]) + probability * 100;
      fishExpectedValue += probability * outcome.price;
    });

    return {
      profile,
      fishExpectedValue,
      materialDropRate: materialProbability * 100,
      materialExpectedValue,
    };
  }

  return { calculateBestCatchDistribution };
});
