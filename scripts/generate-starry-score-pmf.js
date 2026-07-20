#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCORE_SCALE = 1_000_000;
const DIGIT_COUNT = 6;
const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const SOURCE_RELATIVE_PATH = "game-source/current/core/starry_system.py";
const SOURCE_PATH = path.join(REPOSITORY_ROOT, SOURCE_RELATIVE_PATH);
const OUTPUT_PATH = path.join(REPOSITORY_ROOT, "starry-score-pmf.js");

// Changing the Python rules must force an explicit review of this port.
const EXPECTED_SOURCE_SHA256 =
  "0d0c39fd2e642653136a623f77141f37ba6bb2c4b7b1705da44cf4ec72dd5592";

const FEATURE_SCORE_MICRO = Object.freeze({
  "3_same_run": 1_432_856,
  "4_same_run": 2_552_842,
  "5_same_run": 3_721_246,
  "6_same_run": 5_000_000,
  "3_step_high": 1_227_224,
  "4_step_high": 2_402_305,
  "5_step_high": 3_638_272,
  "6_step_high": 5_000_000,
  "3_slide": 757_901,
  "4_slide": 1_517_984,
  "5_slide": 2_368_759,
  "6_slide": 3_337_242,
  "3_pure_snake": 1_180_417,
  "4_pure_snake": 1_874_649,
  "5_pure_snake": 2_698_536,
  "6_pure_snake": 3_653_647,
  "3_snake": 1_180_417,
  "4_snake": 1_567_993,
  "5_snake": 2_133_004,
  "6_snake": 2_838_033,
  "3_palindrome": 505_804,
  "4_palindrome": 1_570_086,
  "5_palindrome": 1_705_313,
  "6_palindrome": 3_004_365,
  "6_all_small_0_4": 1_806_180,
  "6_all_big_5_9": 1_806_180,
  ABAB: 1_598_599,
  ABCABC: 3_142_668,
  star_airplane: 1_899_285,
  two_pair: 1_359_121,
  three_pair: 3_091_515,
  full_house: 2_454_693,
});

const DOMAIN_DEFINITIONS = Object.freeze({
  normal: Object.freeze({
    alphabet: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    complement: 9,
  }),
  hengjiyuan: Object.freeze({
    alphabet: Object.freeze([2, 3, 4, 5, 6, 7, 8]),
    complement: null,
  }),
});

function sign(value) {
  return Number(value > 0) - Number(value < 0);
}

function windowSame(digits, start, length) {
  for (let offset = 1; offset < length; offset += 1) {
    if (digits[start + offset] !== digits[start]) {
      return false;
    }
  }
  return true;
}

function windowStep(digits, start, length) {
  const difference = digits[start + 1] - digits[start];
  if (difference !== 1 && difference !== -1) {
    return false;
  }
  for (let offset = 2; offset < length; offset += 1) {
    if (digits[start + offset] - digits[start + offset - 1] !== difference) {
      return false;
    }
  }
  return true;
}

function windowSlide(digits, start, length) {
  let nondecreasing = true;
  let nonincreasing = true;
  for (let offset = 1; offset < length; offset += 1) {
    const difference = digits[start + offset] - digits[start + offset - 1];
    nondecreasing &&= difference === 0 || difference === 1;
    nonincreasing &&= difference === 0 || difference === -1;
  }
  return nondecreasing || nonincreasing;
}

function windowSnake(digits, start, length, pure) {
  let previousDirection = 0;
  let moved = false;
  let turned = false;
  for (let offset = 1; offset < length; offset += 1) {
    const difference = digits[start + offset] - digits[start + offset - 1];
    if (pure) {
      if (difference !== 1 && difference !== -1) {
        return false;
      }
    } else if (difference < -1 || difference > 1) {
      return false;
    }
    const direction = sign(difference);
    if (direction !== 0) {
      moved = true;
      if (previousDirection !== 0 && direction !== previousDirection) {
        turned = true;
      }
      previousDirection = direction;
    }
  }
  return moved && turned;
}

function windowPalindrome(digits, start, length) {
  for (let offset = 0; offset < Math.floor(length / 2); offset += 1) {
    if (digits[start + offset] !== digits[start + length - 1 - offset]) {
      return false;
    }
  }
  return true;
}

function buildWindowMatches(digits, predicate) {
  const matches = new Map();
  for (let length = 3; length <= DIGIT_COUNT; length += 1) {
    for (let start = 0; start <= DIGIT_COUNT - length; start += 1) {
      matches.set(`${start}:${length}`, predicate(digits, start, length));
    }
  }
  return matches;
}

function containedInLarger(matches, start, length) {
  for (let biggerLength = length + 1; biggerLength <= DIGIT_COUNT; biggerLength += 1) {
    for (
      let biggerStart = 0;
      biggerStart <= DIGIT_COUNT - biggerLength;
      biggerStart += 1
    ) {
      const contains =
        biggerStart <= start &&
        start + length <= biggerStart + biggerLength;
      if (contains && matches.get(`${biggerStart}:${biggerLength}`)) {
        return true;
      }
    }
  }
  return false;
}

function starAirplane(digits) {
  for (let index = 1; index < DIGIT_COUNT - 1; index += 1) {
    if (
      digits[index] !== digits[index - 1] &&
      digits[index] !== digits[index + 1]
    ) {
      return false;
    }
  }
  return true;
}

function exactPairRunCount(digits) {
  let count = 0;
  let index = 0;
  while (index < digits.length) {
    let end = index + 1;
    while (end < digits.length && digits[end] === digits[index]) {
      end += 1;
    }
    count += Number(end - index === 2);
    index = end;
  }
  return count;
}

function windowFullHouse(digits, start) {
  const runLengths = [];
  let index = start;
  const endOfWindow = start + 5;
  while (index < endOfWindow) {
    let end = index + 1;
    while (end < endOfWindow && digits[end] === digits[index]) {
      end += 1;
    }
    runLengths.push(end - index);
    index = end;
  }
  return (
    runLengths.length === 2 &&
    ((runLengths[0] === 3 && runLengths[1] === 2) ||
      (runLengths[0] === 2 && runLengths[1] === 3))
  );
}

function scoreDigitsMicro(digits) {
  if (!Array.isArray(digits) || digits.length !== DIGIT_COUNT) {
    throw new TypeError(`digits must contain exactly ${DIGIT_COUNT} numbers`);
  }

  let score = 0;
  if (digits.every((digit) => digit >= 0 && digit <= 4)) {
    score += FEATURE_SCORE_MICRO["6_all_small_0_4"];
  }
  if (digits.every((digit) => digit >= 5 && digit <= 9)) {
    score += FEATURE_SCORE_MICRO["6_all_big_5_9"];
  }
  if (starAirplane(digits)) {
    score += FEATURE_SCORE_MICRO.star_airplane;
  }

  const sameMatches = buildWindowMatches(digits, windowSame);
  const stepMatches = buildWindowMatches(digits, windowStep);
  const slideMatches = buildWindowMatches(digits, windowSlide);
  const pureSnakeMatches = buildWindowMatches(
    digits,
    (values, start, length) => windowSnake(values, start, length, true),
  );
  const snakeMatches = buildWindowMatches(
    digits,
    (values, start, length) => windowSnake(values, start, length, false),
  );
  const palindromeMatches = buildWindowMatches(digits, windowPalindrome);

  for (let length = 3; length <= DIGIT_COUNT; length += 1) {
    for (let start = 0; start <= DIGIT_COUNT - length; start += 1) {
      const key = `${start}:${length}`;
      if (sameMatches.get(key) && !containedInLarger(sameMatches, start, length)) {
        score += FEATURE_SCORE_MICRO[`${length}_same_run`];
      }
      if (slideMatches.get(key) && !containedInLarger(slideMatches, start, length)) {
        score += stepMatches.get(key)
          ? FEATURE_SCORE_MICRO[`${length}_step_high`]
          : FEATURE_SCORE_MICRO[`${length}_slide`];
      }
      if (snakeMatches.get(key) && !containedInLarger(snakeMatches, start, length)) {
        score += pureSnakeMatches.get(key)
          ? FEATURE_SCORE_MICRO[`${length}_pure_snake`]
          : FEATURE_SCORE_MICRO[`${length}_snake`];
      }
      if (
        palindromeMatches.get(key) &&
        !containedInLarger(palindromeMatches, start, length)
      ) {
        score += FEATURE_SCORE_MICRO[`${length}_palindrome`];
      }
    }
  }

  for (let start = 0; start <= DIGIT_COUNT - 4; start += 1) {
    if (
      digits[start] === digits[start + 2] &&
      digits[start + 1] === digits[start + 3] &&
      digits[start] !== digits[start + 1]
    ) {
      score += FEATURE_SCORE_MICRO.ABAB;
    }
  }

  const [a, b, c] = digits;
  if (
    a === digits[3] &&
    b === digits[4] &&
    c === digits[5] &&
    new Set([a, b, c]).size === 3
  ) {
    score += FEATURE_SCORE_MICRO.ABCABC;
  }

  const pairCount = exactPairRunCount(digits);
  if (pairCount >= 3) {
    score += FEATURE_SCORE_MICRO.three_pair;
  } else if (pairCount >= 2) {
    score += FEATURE_SCORE_MICRO.two_pair;
  }

  if (windowFullHouse(digits, 0) || windowFullHouse(digits, 1)) {
    score += FEATURE_SCORE_MICRO.full_house;
  }

  return score;
}

function encodeDigits(digits) {
  return digits.join("");
}

function canonicalizePrefix(digits, complement) {
  if (complement === null) {
    return digits;
  }
  const reflected = digits.map((digit) => complement - digit);
  return encodeDigits(reflected) < encodeDigits(digits) ? reflected : digits;
}

function generateDomainPmf(definition) {
  let states = new Map([["", { digits: [], count: 1 }]]);

  // Prefix states are merged under score-preserving digit complement symmetry.
  // At the final digit, states are reduced directly into the score PMF, so no
  // six-digit identifier list is ever materialized.
  for (let position = 0; position < DIGIT_COUNT - 1; position += 1) {
    const nextStates = new Map();
    for (const state of states.values()) {
      for (const digit of definition.alphabet) {
        const digits = canonicalizePrefix(
          [...state.digits, digit],
          definition.complement,
        );
        const key = encodeDigits(digits);
        const existing = nextStates.get(key);
        if (existing) {
          existing.count += state.count;
        } else {
          nextStates.set(key, { digits, count: state.count });
        }
      }
    }
    states = nextStates;
  }

  const countsByScore = new Map();
  for (const state of states.values()) {
    for (const digit of definition.alphabet) {
      const scoreMicro = scoreDigitsMicro([...state.digits, digit]);
      countsByScore.set(
        scoreMicro,
        (countsByScore.get(scoreMicro) || 0) + state.count,
      );
    }
  }

  const entries = [...countsByScore.entries()].sort(
    ([leftScore], [rightScore]) => leftScore - rightScore,
  );
  const population = entries.reduce((total, [, count]) => total + count, 0);
  return { population, entries };
}

function sourceSha256() {
  return crypto.createHash("sha256").update(fs.readFileSync(SOURCE_PATH)).digest("hex");
}

function assertSourceRulesUnchanged() {
  const actual = sourceSha256();
  if (actual !== EXPECTED_SOURCE_SHA256) {
    throw new Error(
      [
        `${SOURCE_RELATIVE_PATH} changed since the JavaScript scoring port was reviewed.`,
        `Expected SHA-256: ${EXPECTED_SOURCE_SHA256}`,
        `Actual SHA-256:   ${actual}`,
        "Review the scoring port before updating EXPECTED_SOURCE_SHA256.",
      ].join("\n"),
    );
  }
  return actual;
}

function buildArtifact() {
  const verifiedSourceSha256 = assertSourceRulesUnchanged();
  return {
    scale: SCORE_SCALE,
    domains: {
      normal: generateDomainPmf(DOMAIN_DEFINITIONS.normal),
      hengjiyuan: generateDomainPmf(DOMAIN_DEFINITIONS.hengjiyuan),
    },
    metadata: {
      formatVersion: 1,
      digitCount: DIGIT_COUNT,
      source: SOURCE_RELATIVE_PATH,
      sourceSha256: verifiedSourceSha256,
      generationMethod: "prefix-state-dp-with-score-aggregation",
      alphabets: {
        normal: "0123456789",
        hengjiyuan: "2345678",
      },
      scoreEncoding: "raw-score-times-1000000",
    },
  };
}

function renderArtifact(artifact) {
  const json = JSON.stringify(artifact, null, 2);
  return `(function (globalScope, factory) {\n  "use strict";\n\n  const data = factory();\n  if (typeof module !== "undefined" && module.exports) {\n    module.exports = data;\n  }\n  if (globalScope) {\n    globalScope.FISH_STARRY_SCORE_PMF = data;\n  }\n})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n  "use strict";\n\n  return ${json};\n});\n`;
}

function main(arguments_) {
  const artifactText = renderArtifact(buildArtifact());
  if (arguments_.includes("--check")) {
    const current = fs.existsSync(OUTPUT_PATH)
      ? fs.readFileSync(OUTPUT_PATH, "utf8")
      : "";
    if (current !== artifactText) {
      process.stderr.write(
        `${path.relative(REPOSITORY_ROOT, OUTPUT_PATH)} is out of date; run ${path.relative(REPOSITORY_ROOT, __filename)}\n`,
      );
      process.exitCode = 1;
    }
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, artifactText);
  process.stdout.write(
    `Wrote ${path.relative(REPOSITORY_ROOT, OUTPUT_PATH)} (${Buffer.byteLength(artifactText)} bytes)\n`,
  );
}

module.exports = {
  DOMAIN_DEFINITIONS,
  EXPECTED_SOURCE_SHA256,
  FEATURE_SCORE_MICRO,
  SCORE_SCALE,
  buildArtifact,
  generateDomainPmf,
  renderArtifact,
  scoreDigitsMicro,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
