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

  const LOW_TO_HIGH_RARITIES = ["N", "R", "SR", "SSR", "UR", "UTR"];
  const pityMixCache = new Map();

  function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, toFiniteNumber(value)));
  }

  function roundProbability(value) {
    return Number(toFiniteNumber(value).toFixed(10));
  }

  function mergeProbabilitiesAtMaxRarity(probabilities, maxRarityIndex) {
    const result = probabilities.map((value) => Math.max(0, toFiniteNumber(value)));
    while (result.length <= maxRarityIndex) {
      result.push(0);
    }

    result[maxRarityIndex] += result
      .slice(maxRarityIndex + 1)
      .reduce((total, value) => total + value, 0);
    for (let index = maxRarityIndex + 1; index < result.length; index += 1) {
      result[index] = 0;
    }
    return result;
  }

  function applyMeteorToProbabilities(probabilities, bonusPercent) {
    const result = probabilities.map((value) => Math.max(0, toFiniteNumber(value)));
    const bonus = Math.max(0, toFiniteNumber(bonusPercent)) / 100;
    if (bonus <= 0) {
      return result;
    }

    let topIndex = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index] > 0) {
        topIndex = index;
        break;
      }
    }
    if (topIndex <= 0) {
      return result;
    }

    const lowerIndex = topIndex - 1;
    const shift = Math.min(bonus, result[lowerIndex]);
    if (shift <= 0) {
      return result;
    }
    result[topIndex] += shift;
    result[lowerIndex] -= shift;
    return result;
  }

  function getClampedRarityDistribution(distributions, delta) {
    if (!Array.isArray(distributions) || distributions.length === 0) {
      return [];
    }
    const index = Math.max(
      0,
      Math.min(
        distributions.length - 1,
        Math.floor(toFiniteNumber(delta)),
      ),
    );
    return distributions[index];
  }

  function getMappedRarityEntries(options = {}) {
    let probabilities = Array.isArray(options.probabilities)
      ? options.probabilities.map((value) => Math.max(0, toFiniteNumber(value)))
      : [];
    while (probabilities.length < 6) {
      probabilities.push(0);
    }

    const maxRarity = LOW_TO_HIGH_RARITIES.includes(options.maxRarity)
      ? options.maxRarity
      : "UR";
    const tableMaxRarity = options.isStarry ? "UR" : maxRarity;
    const tableMaxRarityIndex = LOW_TO_HIGH_RARITIES.indexOf(tableMaxRarity);
    probabilities = mergeProbabilitiesAtMaxRarity(
      probabilities,
      tableMaxRarityIndex,
    );
    probabilities = applyMeteorToProbabilities(
      probabilities,
      options.meteorBonusPercent,
    );

    const probabilityByRarity = new Map();

    probabilities.forEach((probability, rawIndex) => {
      if (probability <= 0) {
        return;
      }

      const rarityIndex = Math.min(rawIndex, tableMaxRarityIndex);
      const rarity = LOW_TO_HIGH_RARITIES[rarityIndex];
      probabilityByRarity.set(
        rarity,
        (probabilityByRarity.get(rarity) || 0) + probability * 100,
      );
    });

    return Array.from(probabilityByRarity.entries()).map(
      ([rarity, probability]) => ({
        selectionRarity: rarity,
        rarity,
        probability: roundProbability(probability),
      }),
    );
  }

  function getMappedRarityProfile(options = {}) {
    const rarityOrder = Array.isArray(options.rarityOrder)
      ? options.rarityOrder
      : [...LOW_TO_HIGH_RARITIES].reverse();
    const profile = rarityOrder.reduce((result, rarity) => {
      result[rarity] = 0;
      return result;
    }, {});

    getMappedRarityEntries(options).forEach(({ rarity, probability }) => {
      profile[rarity] = toFiniteNumber(profile[rarity]) + probability;
    });

    rarityOrder.forEach((rarity) => {
      profile[rarity] = roundProbability(profile[rarity]);
    });
    return profile;
  }

  function calculateFishSalePrice(basePrice, rarityMultiplier, bonusPercent = 0) {
    return Math.floor(
      Math.max(0, toFiniteNumber(basePrice)) *
        Math.max(0, toFiniteNumber(rarityMultiplier)) *
        (1 + toFiniteNumber(bonusPercent) / 100),
    );
  }

  function calculateSpecialUtrDropRate(options = {}) {
    const rodLevel = toFiniteNumber(options.rodLevel);
    const mapDifficulty = toFiniteNumber(options.mapDifficulty);
    const sceneLevel = mapDifficulty + 1;
    const levelLead = Math.max(0, rodLevel - sceneLevel);
    const baseProbability = Math.max(
      0,
      toFiniteNumber(options.baseProbabilityPercent),
    );
    const leadStepProbability = Math.max(
      0,
      toFiniteNumber(options.leadStepProbabilityPercent),
    );
    const weatherMultiplier =
      1 + Math.max(0, toFiniteNumber(options.weatherBoostPercent)) / 100;
    return Math.min(
      100,
      (baseProbability + levelLead * leadStepProbability) * weatherMultiplier,
    );
  }

  function getFishPrice(fish, rarity, rarityMultipliers) {
    const configuredPrice = fish?.rarityPrices?.[rarity];
    if (Number.isFinite(Number(configuredPrice))) {
      return Math.max(0, Number(configuredPrice));
    }

    return (
      Math.max(0, toFiniteNumber(fish?.nPrice)) *
      Math.max(0, toFiniteNumber(rarityMultipliers?.[rarity]))
    );
  }

  function getOriginalHalfPrice(fish, rarity, rarityMultipliers) {
    const basePrice = Number.isFinite(Number(fish?.originalNPrice))
      ? Number(fish.originalNPrice)
      : toFiniteNumber(fish?.nPrice);
    const multiplier = Math.max(0, toFiniteNumber(rarityMultipliers?.[rarity]));
    return Math.floor(Math.floor(basePrice * multiplier) / 2);
  }

  function buildCatchOutcomes(options) {
    const profile = options?.profile || {};
    const rarityOrder = Array.isArray(options?.rarityOrder)
      ? options.rarityOrder
      : [];
    const rarityMultipliers = options?.rarityMultipliers || {};
    const fishes = Array.isArray(options?.fishes) ? options.fishes : [];
    const outcomes = [];
    const materialRate = clamp(options?.materialDropRate, 0, 100) / 100;
    const frameRate = clamp(options?.displayFrameDropRate, 0, 100) / 100;
    const specialUtrRate = clamp(options?.specialUtrDropRate, 0, 100) / 100;
    let remainingProbability = 1;

    if (materialRate > 0) {
      outcomes.push({
        key: "material",
        kind: "material",
        rarity: "N",
        price: Math.max(0, toFiniteNumber(options?.materialValue)),
        originalHalfPrice: 0,
        probability: remainingProbability * materialRate,
      });
      remainingProbability *= 1 - materialRate;
    }

    if (frameRate > 0) {
      outcomes.push({
        key: "display-frame",
        kind: "display-frame",
        rarity: "UTR",
        price: Math.max(0, toFiniteNumber(options?.displayFrameValue)),
        originalHalfPrice: 0,
        probability: remainingProbability * frameRate,
      });
      remainingProbability *= 1 - frameRate;
    }

    if (specialUtrRate > 0 && fishes.length > 0) {
      const probabilityPerFish =
        (remainingProbability * specialUtrRate) / fishes.length;
      fishes.forEach((fish, fishIndex) => {
        outcomes.push({
          key: `special-utr:${fishIndex}`,
          kind: "special-utr",
          rarity: "UTR",
          fishIndex,
          price: getFishPrice(fish, "UTR", rarityMultipliers),
          originalHalfPrice: getOriginalHalfPrice(
            fish,
            "UTR",
            rarityMultipliers,
          ),
          probability: probabilityPerFish,
        });
      });
      remainingProbability *= 1 - specialUtrRate;
    }

    const configuredRarityEntries = Array.isArray(options?.rarityEntries)
      ? options.rarityEntries
          .filter(
            (entry) =>
              LOW_TO_HIGH_RARITIES.includes(entry?.rarity) &&
              LOW_TO_HIGH_RARITIES.includes(entry?.selectionRarity) &&
              toFiniteNumber(entry?.probability) > 0,
          )
          .map((entry) => ({
            rarity: entry.rarity,
            selectionRarity: entry.selectionRarity,
            probability: Math.max(0, toFiniteNumber(entry.probability)),
          }))
      : [];
    const rarityEntries = configuredRarityEntries.length
      ? configuredRarityEntries
      : rarityOrder
          .filter((rarity) => toFiniteNumber(profile[rarity]) > 0)
          .map((rarity) => ({
            rarity,
            selectionRarity: rarity,
            probability: Math.max(0, toFiniteNumber(profile[rarity])),
          }));
    const profileTotal = rarityEntries.reduce(
      (total, entry) => total + entry.probability,
      0,
    );
    if (fishes.length > 0 && profileTotal > 0) {
      rarityEntries.forEach((entry, entryIndex) => {
        const rarityProbability = entry.probability / profileTotal;
        const probabilityPerFish =
          (remainingProbability * rarityProbability) / fishes.length;

        fishes.forEach((fish, fishIndex) => {
          outcomes.push({
            key: `fish:${entry.selectionRarity}:${entry.rarity}:${entryIndex}:${fishIndex}`,
            kind: "fish",
            rarity: entry.rarity,
            selectionRarity: entry.selectionRarity,
            fishIndex,
            collected: Boolean(fish?.collectedByRarity?.[entry.rarity]),
            price: getFishPrice(fish, entry.rarity, rarityMultipliers),
            originalHalfPrice: getOriginalHalfPrice(
              fish,
              entry.rarity,
              rarityMultipliers,
            ),
            probability: probabilityPerFish,
          });
        });
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

  function getOutcomePriority(outcome) {
    if (outcome.kind === "display-frame") {
      return [3, 999];
    }
    if (outcome.kind === "special-utr") {
      return [2, 999];
    }
    const rarityIndex = LOW_TO_HIGH_RARITIES.indexOf(outcome.rarity);
    return [1, Math.max(0, rarityIndex)];
  }

  function selectBetterOutcome(left, right, options) {
    if (left.kind !== right.kind) {
      const leftIsMaterial = left.kind === "material";
      const rightIsMaterial = right.kind === "material";
      if (leftIsMaterial !== rightIsMaterial) {
        if (options.preferMaterial) {
          return leftIsMaterial ? left : right;
        }
        return leftIsMaterial ? right : left;
      }
    }

    const leftPriority = getOutcomePriority(left);
    const rightPriority = getOutcomePriority(right);
    if (
      rightPriority[0] > leftPriority[0] ||
      (rightPriority[0] === leftPriority[0] &&
        rightPriority[1] > leftPriority[1])
    ) {
      return right;
    }

    if (
      options.hasCollectionData &&
      leftPriority[0] === 1 &&
      rightPriority[0] === 1 &&
      left.rarity === right.rarity &&
      left.kind === "fish" &&
      right.kind === "fish" &&
      left.collected &&
      !right.collected
    ) {
      return right;
    }
    return left;
  }

  function applyLuckySelection(outcomes, options) {
    const rollCount = Math.max(
      1,
      Math.floor(toFiniteNumber(options?.rollCount) || 1),
    );
    let selectedDistribution = outcomes.map((outcome) => ({
      outcome,
      probability: outcome.probability,
    }));

    for (let roll = 1; roll < rollCount; roll += 1) {
      const nextProbabilityByOutcome = new Map();
      selectedDistribution.forEach((selected) => {
        outcomes.forEach((contender) => {
          const winner = selectBetterOutcome(selected.outcome, contender, options);
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

    return selectedDistribution;
  }

  function buildSelectedCatchDistribution(options = {}) {
    const selectionOptions = {
      rollCount: options.rollCount,
      preferMaterial: Boolean(options.preferMaterial),
      hasCollectionData: Boolean(options.hasCollectionData),
    };
    const configuredBranches = Array.isArray(options.rollBranches)
      ? options.rollBranches.filter(
          (branch) => toFiniteNumber(branch?.probability) > 0,
        )
      : [];
    if (!configuredBranches.length) {
      return applyLuckySelection(buildCatchOutcomes(options), selectionOptions);
    }

    const { rollBranches: _rollBranches, ...sharedOptions } = options;
    const selectedBranches = configuredBranches
      .map((branch) => ({
        probability: Math.max(0, toFiniteNumber(branch.probability)),
        distribution: applyLuckySelection(
          buildCatchOutcomes({ ...sharedOptions, ...branch }),
          selectionOptions,
        ),
      }))
      .filter((branch) => branch.distribution.length > 0);
    const totalBranchProbability = selectedBranches.reduce(
      (total, branch) => total + branch.probability,
      0,
    );
    if (totalBranchProbability <= 0) {
      return [];
    }

    const probabilityByKey = new Map();
    const outcomeByKey = new Map();
    selectedBranches.forEach((branch) => {
      const branchWeight = branch.probability / totalBranchProbability;
      branch.distribution.forEach(({ outcome, probability }) => {
        outcomeByKey.set(outcome.key, outcome);
        probabilityByKey.set(
          outcome.key,
          (probabilityByKey.get(outcome.key) || 0) + probability * branchWeight,
        );
      });
    });
    return Array.from(probabilityByKey.entries()).map(([key, probability]) => ({
      outcome: outcomeByKey.get(key),
      probability,
    }));
  }

  function getQuantityDistribution(options) {
    const baseQuantity = Math.max(
      1,
      Math.floor(toFiniteNumber(options?.baseQuantity) || 1),
    );
    const extraChance = clamp(options?.extraQuantityChance, 0, 1);
    if (extraChance <= 0) {
      return [{ quantity: baseQuantity, probability: 1 }];
    }
    if (extraChance >= 1) {
      return [{ quantity: baseQuantity + 1, probability: 1 }];
    }
    return [
      { quantity: baseQuantity, probability: 1 - extraChance },
      { quantity: baseQuantity + 1, probability: extraChance },
    ];
  }

  function calculateExpectedFishQuantity(options = {}) {
    return getQuantityDistribution(options).reduce(
      (total, entry) => total + entry.quantity * entry.probability,
      0,
    );
  }

  function calculateSinglePityState(threshold, resetProbability, incrementBranches) {
    const stateSize = Math.max(1, threshold);
    const visits = new Float64Array(stateSize);
    visits[0] = 1;
    for (let state = 0; state < stateSize - 1; state += 1) {
      const visitProbability = visits[state];
      if (visitProbability <= 0) continue;
      incrementBranches.forEach((branch) => {
        if (branch.probability <= 0) return;
        const nextState = Math.min(
          stateSize - 1,
          state + Math.max(1, branch.increment),
        );
        visits[nextState] += visitProbability * branch.probability;
      });
    }

    const cycleLength = visits.reduce((total, value) => total + value, 0);
    const distribution = visits.map((value) =>
      cycleLength > 0 ? value / cycleLength : 0,
    );
    const hardMass = distribution[stateSize - 1] || 0;
    const randomResetMass = Math.max(0, resetProbability) *
      distribution.slice(0, -1).reduce((total, value) => total + value, 0);
    return { distribution, hardMass, randomResetMass };
  }

  function calculateCappedPityMix(randomHitProbability, threshold) {
    const randomProbability = clamp(randomHitProbability, 0, 1);
    const pityThreshold = Math.max(0, Math.floor(toFiniteNumber(threshold)));
    if (pityThreshold <= 0) {
      return {
        hitProbability: randomProbability,
        randomEventMass: 1,
      };
    }

    const pityState = calculateSinglePityState(
      pityThreshold,
      randomProbability,
      [{ increment: 1, probability: 1 - randomProbability }],
    );
    const randomEventMass = 1 - pityState.hardMass;
    return {
      hitProbability:
        randomProbability * randomEventMass + pityState.hardMass,
      randomEventMass,
    };
  }

  function calculateCoupledPityMix(
    frameThreshold,
    specialThreshold,
    groupProbability,
    quantityDistribution,
  ) {
    const states = [];
    for (let specialCount = 0; specialCount < specialThreshold; specialCount += 1) {
      states.push({ frameCount: 0, specialCount });
    }
    for (let frameCount = 1; frameCount < frameThreshold; frameCount += 1) {
      states.push({ frameCount, specialCount: 0 });
    }

    const getEmbeddedStateIndex = (frameCount, specialCount) => {
      if (frameCount <= 0) {
        return Math.min(specialThreshold - 1, specialCount);
      }
      return (
        specialThreshold + Math.min(frameThreshold - 1, frameCount) - 1
      );
    };
    const transitionRows = [];
    const segmentLengths = new Float64Array(states.length);
    const hardFrameProbabilities = new Float64Array(states.length);
    const hardSpecialProbabilities = new Float64Array(states.length);
    const maxQuantity = quantityDistribution.reduce(
      (maximum, entry) => Math.max(maximum, entry.quantity),
      1,
    );

    states.forEach((startState, stateIndex) => {
      const remainingUntilHard = Math.min(
        frameThreshold - 1 - startState.frameCount,
        specialThreshold - 1 - startState.specialCount,
      );
      const reachProbability = new Float64Array(
        Math.max(1, remainingUntilHard + maxQuantity + 1),
      );
      const nextStateProbability = new Map();
      const addEmbeddedState = (frameCount, specialCount, probability) => {
        if (probability <= 0) return;
        const nextIndex = getEmbeddedStateIndex(frameCount, specialCount);
        nextStateProbability.set(
          nextIndex,
          (nextStateProbability.get(nextIndex) || 0) + probability,
        );
      };
      reachProbability[0] = 1;

      for (
        let incrementTotal = 0;
        incrementTotal < reachProbability.length;
        incrementTotal += 1
      ) {
        const reach = reachProbability[incrementTotal];
        if (reach <= 0) continue;
        const frameCount = Math.min(
          frameThreshold - 1,
          startState.frameCount + incrementTotal,
        );
        const specialCount = Math.min(
          specialThreshold - 1,
          startState.specialCount + incrementTotal,
        );
        segmentLengths[stateIndex] += reach;

        if (frameCount >= frameThreshold - 1) {
          hardFrameProbabilities[stateIndex] += reach;
          addEmbeddedState(0, specialCount + 1, reach);
          continue;
        }
        if (specialCount >= specialThreshold - 1) {
          hardSpecialProbabilities[stateIndex] += reach;
          quantityDistribution.forEach((entry) => {
            addEmbeddedState(
              frameCount + entry.quantity,
              0,
              reach * entry.probability,
            );
          });
          continue;
        }

        addEmbeddedState(
          0,
          specialCount + 1,
          reach * groupProbability.frame,
        );
        quantityDistribution.forEach((entry) => {
          addEmbeddedState(
            frameCount + entry.quantity,
            0,
            reach * groupProbability.special * entry.probability,
          );
        });

        const materialNext = incrementTotal + 1;
        if (materialNext < reachProbability.length) {
          reachProbability[materialNext] +=
            reach * groupProbability.material;
        }
        quantityDistribution.forEach((entry) => {
          const fishNext = incrementTotal + entry.quantity;
          if (fishNext < reachProbability.length) {
            reachProbability[fishNext] +=
              reach * groupProbability.fish * entry.probability;
          }
        });
      }

      transitionRows[stateIndex] = Array.from(nextStateProbability.entries());
    });

    let stationary = new Float64Array(states.length);
    let nextStationary = new Float64Array(states.length);
    stationary.fill(1 / states.length);
    for (let iteration = 0; iteration < 10000; iteration += 1) {
      nextStationary.fill(0);
      transitionRows.forEach((row, stateIndex) => {
        const stateProbability = stationary[stateIndex];
        if (stateProbability <= 0) return;
        row.forEach(([nextIndex, probability]) => {
          nextStationary[nextIndex] += stateProbability * probability;
        });
      });

      let difference = 0;
      for (let index = 0; index < stationary.length; index += 1) {
        difference += Math.abs(nextStationary[index] - stationary[index]);
      }
      const previous = stationary;
      stationary = nextStationary;
      nextStationary = previous;
      if (difference < 1e-14) break;
    }

    let averageSegmentLength = 0;
    let hardFramePerSegment = 0;
    let hardSpecialPerSegment = 0;
    for (let index = 0; index < stationary.length; index += 1) {
      averageSegmentLength += stationary[index] * segmentLengths[index];
      hardFramePerSegment +=
        stationary[index] * hardFrameProbabilities[index];
      hardSpecialPerSegment +=
        stationary[index] * hardSpecialProbabilities[index];
    }
    const hardFrameMass = hardFramePerSegment / averageSegmentLength;
    const hardSpecialMass = hardSpecialPerSegment / averageSegmentLength;
    return {
      randomMass: 1 - hardFrameMass - hardSpecialMass,
      hardFrameMass,
      hardSpecialMass,
    };
  }

  function calculateStationaryPityMix(selectedDistribution, options) {
    const frameThreshold = Math.max(
      0,
      Math.floor(toFiniteNumber(options?.displayFramePityCount)),
    );
    const specialThreshold = Math.max(
      0,
      Math.floor(toFiniteNumber(options?.specialUtrPityCount)),
    );
    const frameActive = frameThreshold > 0;
    const specialActive =
      specialThreshold > 0 &&
      selectedDistribution.some(({ outcome }) => outcome.kind === "special-utr");
    if (!frameActive && !specialActive) {
      return { randomMass: 1, hardFrameMass: 0, hardSpecialMass: 0 };
    }

    const groupProbability = selectedDistribution.reduce(
      (groups, item) => {
        const kind = item.outcome.kind;
        if (kind === "display-frame") groups.frame += item.probability;
        else if (kind === "special-utr") groups.special += item.probability;
        else if (kind === "material") groups.material += item.probability;
        else groups.fish += item.probability;
        return groups;
      },
      { frame: 0, special: 0, material: 0, fish: 0 },
    );
    const quantityDistribution = getQuantityDistribution(options);
    const frameIncrementBranches = [
      { increment: 1, probability: groupProbability.material },
      ...quantityDistribution.map((entry) => ({
        increment: entry.quantity,
        probability:
          entry.probability * (groupProbability.special + groupProbability.fish),
      })),
    ];
    const specialIncrementBranches = [
      {
        increment: 1,
        probability: groupProbability.frame + groupProbability.material,
      },
      ...quantityDistribution.map((entry) => ({
        increment: entry.quantity,
        probability: entry.probability * groupProbability.fish,
      })),
    ];
    const cacheKey = JSON.stringify({
      frameThreshold,
      specialThreshold,
      groupProbability: Object.values(groupProbability).map((value) =>
        value.toFixed(12),
      ),
      quantityDistribution,
    });
    if (pityMixCache.has(cacheKey)) {
      return pityMixCache.get(cacheKey);
    }

    if (frameActive && !specialActive) {
      const frameState = calculateSinglePityState(
        frameThreshold,
        groupProbability.frame,
        frameIncrementBranches,
      );
      const result = {
        randomMass: 1 - frameState.hardMass,
        hardFrameMass: frameState.hardMass,
        hardSpecialMass: 0,
      };
      pityMixCache.set(cacheKey, result);
      return result;
    }
    if (specialActive && !frameActive) {
      const specialState = calculateSinglePityState(
        specialThreshold,
        groupProbability.special,
        specialIncrementBranches,
      );
      const result = {
        randomMass: 1 - specialState.hardMass,
        hardFrameMass: 0,
        hardSpecialMass: specialState.hardMass,
      };
      pityMixCache.set(cacheKey, result);
      return result;
    }

    const result = calculateCoupledPityMix(
      frameThreshold,
      specialThreshold,
      groupProbability,
      quantityDistribution,
    );
    pityMixCache.set(cacheKey, result);
    return result;
  }

  function applyPitySelection(selectedDistribution, options) {
    const pityMix = calculateStationaryPityMix(selectedDistribution, options);
    const probabilityByKey = new Map();
    const outcomeByKey = new Map();
    const addOutcome = (outcome, probability) => {
      if (!outcome || probability <= 0) return;
      outcomeByKey.set(outcome.key, outcome);
      probabilityByKey.set(
        outcome.key,
        (probabilityByKey.get(outcome.key) || 0) + probability,
      );
    };

    selectedDistribution.forEach(({ outcome, probability }) => {
      addOutcome(outcome, probability * pityMix.randomMass);
    });

    if (pityMix.hardFrameMass > 0) {
      const randomFrame = selectedDistribution.find(
        ({ outcome }) => outcome.kind === "display-frame",
      )?.outcome;
      addOutcome(
        randomFrame || {
          key: "display-frame",
          kind: "display-frame",
          rarity: "UTR",
          price: Math.max(0, toFiniteNumber(options?.displayFrameValue)),
          originalHalfPrice: 0,
        },
        pityMix.hardFrameMass,
      );
    }

    if (pityMix.hardSpecialMass > 0) {
      const specialOutcomes = selectedDistribution
        .map(({ outcome }) => outcome)
        .filter((outcome) => outcome.kind === "special-utr");
      const probabilityPerFish = specialOutcomes.length
        ? pityMix.hardSpecialMass / specialOutcomes.length
        : 0;
      specialOutcomes.forEach((outcome) => addOutcome(outcome, probabilityPerFish));
    }

    return Array.from(probabilityByKey.entries()).map(([key, probability]) => ({
      outcome: outcomeByKey.get(key),
      probability,
    }));
  }

  function emptyCatchResult(rarityOrder) {
    return {
      profile: rarityOrder.reduce((result, rarity) => {
        result[rarity] = 0;
        return result;
      }, {}),
      fishExpectedValue: 0,
      originalHalfPriceExpectedValue: 0,
      fishProbability: 0,
      materialDropRate: 0,
      materialExpectedValue: 0,
      displayFrameDropRate: 0,
      displayFrameExpectedValue: 0,
      specialUtrDropRate: 0,
    };
  }

  function calculateBestCatchDistribution(options) {
    const rarityOrder = Array.isArray(options?.rarityOrder)
      ? options.rarityOrder
      : [];
    const selectedDistribution = buildSelectedCatchDistribution(options);
    if (!selectedDistribution.length) {
      return emptyCatchResult(rarityOrder);
    }
    const finalDistribution = applyPitySelection(selectedDistribution, options);
    const result = emptyCatchResult(rarityOrder);

    finalDistribution.forEach(({ outcome, probability }) => {
      if (outcome.kind === "material") {
        result.materialDropRate += probability * 100;
        result.materialExpectedValue += probability * outcome.price;
        return;
      }
      if (outcome.kind === "display-frame") {
        result.displayFrameDropRate += probability * 100;
        result.displayFrameExpectedValue += probability * outcome.price;
        return;
      }

      result.profile[outcome.rarity] =
        toFiniteNumber(result.profile[outcome.rarity]) + probability * 100;
      result.fishExpectedValue += probability * outcome.price;
      result.originalHalfPriceExpectedValue +=
        probability * outcome.originalHalfPrice;
      result.fishProbability += probability;
      if (outcome.kind === "special-utr") {
        result.specialUtrDropRate += probability * 100;
      }
    });
    return result;
  }

  function calculateCatBaitConsumptionFactor(options = {}) {
    const fishProbability = clamp(options.fishProbability, 0, 1);
    const eatChance = clamp(options.eatChance, 0, 1);
    const quantityDistribution = getQuantityDistribution(options);
    const allEatenProbability = quantityDistribution.reduce(
      (total, entry) =>
        total + entry.probability * Math.pow(eatChance, entry.quantity),
      0,
    );
    return 1 - fishProbability * allEatenProbability;
  }

  function calculateCatWeatherExpectedValue(options = {}) {
    const fishExpectedValue = Math.max(
      0,
      toFiniteNumber(options.fishExpectedValue),
    );
    const originalHalfPriceExpectedValue = Math.max(
      0,
      toFiniteNumber(options.originalHalfPriceExpectedValue),
    );
    const sameRarityGiftExpectedValue = Math.max(
      0,
      toFiniteNumber(options.sameRarityGiftExpectedValue),
    );
    const fishProbability = clamp(options.fishProbability, 0, 1);
    const baitPrice = Math.max(0, toFiniteNumber(options.baitPrice));
    const eatChance = clamp(options.eatChance, 0, 1);
    const catFrameValue = Math.max(0, toFiniteNumber(options.catFrameValue));
    const secondFrameMissFactor = options.lucky ? 0.85 : 1;
    const randomCatFrameProbability = options.lucky
      ? 0.15 + 0.85 * 0.15
      : 0.15;
    const catFramePityCount =
      options.catFramePityCount === undefined
        ? 15
        : options.catFramePityCount;
    const catFramePityMix = calculateCappedPityMix(
      randomCatFrameProbability,
      catFramePityCount,
    );
    const randomGiftFactor =
      secondFrameMissFactor * catFramePityMix.randomEventMass;
    const giftExpectedValue =
      originalHalfPriceExpectedValue * (0.3 * randomGiftFactor) +
      catFrameValue * fishProbability * catFramePityMix.hitProbability +
      baitPrice * 3 * fishProbability * (0.15 * randomGiftFactor) +
      sameRarityGiftExpectedValue * (0.1 * randomGiftFactor);

    return (
      fishExpectedValue * (1 - eatChance) + giftExpectedValue * eatChance
    );
  }

  function getCatBuildingRuleContext(options = {}) {
    const levels =
      options.levels && typeof options.levels === "object"
        ? options.levels
        : {};
    const buildingIds = Array.from(
      new Set(
        (Array.isArray(options.buildingIds)
          ? options.buildingIds
          : Object.keys(levels)
        )
          .map((id) => String(id || ""))
          .filter(Boolean),
      ),
    );
    const statueId = String(options.statueId || "legendaryCatStatue");
    const configuredMaxLevel = Number(options.maxLevel);
    const maxLevel = Number.isFinite(configuredMaxLevel)
      ? Math.max(0, Math.floor(configuredMaxLevel))
      : 3;
    const getLevel = (buildingId) =>
      Math.max(
        0,
        Math.min(maxLevel, Math.floor(toFiniteNumber(levels[buildingId]))),
      );

    return { buildingIds, getLevel, levels, maxLevel, statueId };
  }

  function canUpgradeCatBuildingLevel(options = {}) {
    const context = getCatBuildingRuleContext(options);
    const buildingId = String(options.buildingId || "");
    if (!buildingId || !context.buildingIds.includes(buildingId)) {
      return false;
    }

    const nextLevel = context.getLevel(buildingId) + 1;
    if (nextLevel > context.maxLevel) {
      return false;
    }
    if (buildingId === context.statueId) {
      const otherIds = context.buildingIds.filter(
        (id) => id !== context.statueId,
      );
      return (
        otherIds.length > 0 &&
        otherIds.every((id) => context.getLevel(id) >= nextLevel)
      );
    }

    return nextLevel <= 1 || context.getLevel(context.statueId) >= nextLevel - 1;
  }

  function getCatBuildingLevelAfterStep(options = {}) {
    const context = getCatBuildingRuleContext(options);
    const buildingId = String(options.buildingId || "");
    const currentLevel = context.getLevel(buildingId);
    if (Number(options.step) !== 1 || !canUpgradeCatBuildingLevel(options)) {
      return currentLevel;
    }
    return currentLevel + 1;
  }

  function normalizeCatBuildingLevels(options = {}) {
    const context = getCatBuildingRuleContext(options);
    const normalized = context.buildingIds.reduce((result, buildingId) => {
      result[buildingId] = context.getLevel(buildingId);
      return result;
    }, {});
    if (!context.buildingIds.includes(context.statueId)) {
      return normalized;
    }

    const otherIds = context.buildingIds.filter(
      (id) => id !== context.statueId,
    );
    if (otherIds.length === 0) {
      return normalized;
    }

    const statueLevel = Math.min(
      normalized[context.statueId],
      ...otherIds.map((id) => normalized[id]),
    );
    normalized[context.statueId] = statueLevel;
    const ordinaryMaxLevel = Math.min(context.maxLevel, statueLevel + 1);
    otherIds.forEach((id) => {
      normalized[id] = Math.min(normalized[id], ordinaryMaxLevel);
    });
    return normalized;
  }

  function isMapAccessibleByRod(mapDifficulty, rodLevel) {
    return toFiniteNumber(mapDifficulty) <= toFiniteNumber(rodLevel);
  }

  function isSpecialUtrEnabled(options = {}) {
    if (options.weatherInactive) {
      return false;
    }
    if (options.isStarry) {
      return (
        Boolean(options.hasAchievement) &&
        options.weatherType === "chaotic_era"
      );
    }
    return options.weatherType === "lost_wind";
  }

  return {
    canUpgradeCatBuildingLevel,
    calculateBestCatchDistribution,
    calculateCatBaitConsumptionFactor,
    calculateCatWeatherExpectedValue,
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
  };
});
