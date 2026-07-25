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
    normal: "15a506f0b572947121e8d13ba3c145237b014e673560101487cc93e1a03d2fd8",
    hengjiyuan:
      "0640b746696d32297ec02014e4f1217694690d74aec8868c2f8988e6329595a1",
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
  assert.equal(score("001011"), 8_770_222);
  assert.equal(score("001122"), 10_134_222);
  assert.equal(score("000011"), 15_215_836);
  assert.equal(score("000112"), 13_031_568);
  assert.equal(score("001112"), 13_031_568);
  assert.equal(score("000111"), 14_970_228);
  assert.equal(score("000001"), 15_128_029);
  assert.equal(score("000000"), 16_853_252);
  assert.equal(score("777777"), 16_853_252);
  assert.equal(score("002150"), 802_444);
  assert.equal(score("135791"), 1_806_180);
  assert.equal(score("121314"), 6_656_968);
});

test("普通域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.normal);

  assertClose(summary.meanRawScore, 0.9008114119900005);
  assertClose(summary.poolProbabilities.none, 0.466084);
  assertClose(summary.poolProbabilities.low, 0.41425799999999996);
  assertClose(summary.poolProbabilities.middle, 0.10216800000000004);
  assertClose(summary.poolProbabilities.high, 0.01580400000000004);
  assertClose(summary.poolProbabilities.ultimate, 0.0016859999999999653);
});

test("恒纪元域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.hengjiyuan);

  assertClose(summary.meanRawScore, 1.5972588788854978);
  assertClose(summary.poolProbabilities.none, 0.27648343802327263);
  assertClose(summary.poolProbabilities.low, 0.4876539537097638);
  assertClose(summary.poolProbabilities.middle, 0.18524594344193324);
  assertClose(summary.poolProbabilities.high, 0.04421627043153786);
  assertClose(summary.poolProbabilities.ultimate, 0.006400394393492492);
});

test("普通域双候选择优使用 PMF 的精确 CDF", () => {
  const summary = summarize(distribution.domains.normal, 2);

  assertClose(summary.meanRawScore, 1.5373187414247214);
  assertClose(summary.poolProbabilities.none, 0.217234295056);
  assertClose(summary.poolProbabilities.low, 0.5577677419079999);
  assertClose(summary.poolProbabilities.middle, 0.19032386313600003);
  assertClose(summary.poolProbabilities.high, 0.03130494249600013);
  assertClose(summary.poolProbabilities.ultimate, 0.0033691574039999006);
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
