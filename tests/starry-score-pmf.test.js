"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const distribution = require("../starry-score-pmf.js");
const {
  buildArtifact,
  renderArtifact,
  scoreDigitsMicro,
} = require("../scripts/generate-starry-score-pmf.js");

const OUTPUT_PATH = path.resolve(__dirname, "../starry-score-pmf.js");

function summarize(domain, candidateCount = 1) {
  const poolProbabilities = {
    none: 0,
    low: 0,
    middle: 0,
    high: 0,
    ultimate: 0,
  };
  let previousCumulative = 0;
  let meanRawScore = 0;

  for (const [scoreMicro, count] of domain.entries) {
    const cumulative = previousCumulative + count;
    const probability =
      Math.pow(cumulative / domain.population, candidateCount) -
      Math.pow(previousCumulative / domain.population, candidateCount);
    previousCumulative = cumulative;
    meanRawScore += (scoreMicro / distribution.scale) * probability;

    const displayScore = Math.floor(
      (scoreMicro + distribution.scale / 2) / distribution.scale,
    );
    const pool =
      displayScore <= 0
        ? "none"
        : displayScore <= 2
          ? "low"
          : displayScore <= 5
            ? "middle"
            : displayScore <= 10
              ? "high"
              : "ultimate";
    poolProbabilities[pool] += probability;
  }

  return { meanRawScore, poolProbabilities };
}

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("产物使用整数微分值且每个数字域权重完整", () => {
  assert.equal(distribution.scale, 1_000_000);
  assert.equal(distribution.domains.normal.population, 1_000_000);
  assert.equal(distribution.domains.hengjiyuan.population, 117_649);

  for (const domain of Object.values(distribution.domains)) {
    let previousScore = -1;
    let population = 0;
    for (const [scoreMicro, count] of domain.entries) {
      assert.ok(Number.isSafeInteger(scoreMicro));
      assert.ok(Number.isSafeInteger(count) && count > 0);
      assert.ok(scoreMicro > previousScore);
      previousScore = scoreMicro;
      population += count;
    }
    assert.equal(population, domain.population);
  }
});

test("两套完整 PMF 与当前 Python 评分器的精确基准一致", () => {
  const expectedHashes = {
    normal: "368e23226e416e193e602f417e6da4e78009ec137e4233b11ca9eb924e8bd6fe",
    hengjiyuan:
      "7248ed198569b332566d596831a294f0812f4247412cc0d9a2c586249627dbe6",
  };

  for (const [name, domain] of Object.entries(distribution.domains)) {
    const canonical = domain.entries
      .map(([scoreMicro, count]) => `${scoreMicro}:${count}\n`)
      .join("");
    const hash = crypto.createHash("sha256").update(canonical).digest("hex");
    assert.equal(hash, expectedHashes[name]);
  }
});

test("JavaScript 评分移植覆盖源码中的典型组合规则", () => {
  const score = (text) => scoreDigitsMicro([...text].map(Number));

  assert.equal(score("011110"), 16_838_223);
  assert.equal(score("001011"), 10_129_343);
  assert.equal(score("001122"), 10_134_222);
  assert.equal(score("000011"), 12_050_242);
  assert.equal(score("000112"), 10_930_256);
  assert.equal(score("001112"), 10_930_256);
  assert.equal(score("000111"), 12_363_112);
  assert.equal(score("000001"), 10_763_953);
});

test("普通域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.normal);

  assertClose(summary.meanRawScore, 0.79745076809);
  assertClose(summary.poolProbabilities.none, 0.489104);
  assertClose(summary.poolProbabilities.low, 0.414198);
  assertClose(summary.poolProbabilities.middle, 0.082708);
  assertClose(summary.poolProbabilities.high, 0.013416);
  assertClose(summary.poolProbabilities.ultimate, 0.000574);
});

test("恒纪元域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.hengjiyuan);

  assertClose(summary.meanRawScore, 1.4333522257137756);
  assertClose(summary.poolProbabilities.none, 0.30218701391427044);
  assertClose(summary.poolProbabilities.low, 0.49367185441440214);
  assertClose(summary.poolProbabilities.middle, 0.1609363445503149);
  assertClose(summary.poolProbabilities.high, 0.04055283087829051);
  assertClose(summary.poolProbabilities.ultimate, 0.0026519562427219953);
});

test("普通域双候选择优使用 PMF 的精确 CDF", () => {
  const summary = summarize(distribution.domains.normal, 2);

  assertClose(summary.meanRawScore, 1.362973106640668);
  assertClose(summary.poolProbabilities.none, 0.239222722816);
  assertClose(summary.poolProbabilities.low, 0.5767317803880001);
  assertClose(summary.poolProbabilities.middle, 0.15626121689600003);
  assertClose(summary.poolProbabilities.high, 0.026636609375999987);
  assertClose(summary.poolProbabilities.ultimate, 0.0011476705239998886);
});

test("生成器可重复生成当前检入产物", { timeout: 20_000 }, () => {
  const regenerated = renderArtifact(buildArtifact());
  assert.equal(regenerated, fs.readFileSync(OUTPUT_PATH, "utf8"));
});

test("产物同时支持浏览器全局变量", () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(OUTPUT_PATH, "utf8"), sandbox);

  assert.equal(
    sandbox.FISH_STARRY_SCORE_PMF.domains.normal.population,
    1_000_000,
  );
});
