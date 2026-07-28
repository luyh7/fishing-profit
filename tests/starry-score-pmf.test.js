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
    normal: "772ec67eccfe128aff32dff7b103766480f4e97a73aa7ab4cf63c0e855f1c452",
    hengjiyuan:
      "d130ba462830253fcc9b878579b29c5c831605953e0285c027ff9990116f57f0",
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
  assert.equal(score("001011"), 11_066_931);
  assert.equal(score("001122"), 12_430_931);
  assert.equal(score("000011"), 13_620_328);
  assert.equal(score("000112"), 11_436_060);
  assert.equal(score("001112"), 11_436_060);
  assert.equal(score("000111"), 15_671_429);
  assert.equal(score("000001"), 15_128_029);
  assert.equal(score("000000"), 19_149_961);
  assert.equal(score("777777"), 19_149_961);
  assert.equal(score("002150"), 802_444);
  assert.equal(score("135791"), 1_806_180);
  assert.equal(score("121314"), 6_656_968);
  assert.equal(score("423156"), 2_443_697);
  assert.equal(score("252525"), 9_753_092);
  assert.equal(score("112112"), 13_197_680);
  assert.equal(score("135789"), 4_603_975);
});

test("普通域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.normal);

  assertClose(summary.meanRawScore, 0.9972034318899996);
  assertClose(summary.poolProbabilities.none, 0.438976);
  assertClose(summary.poolProbabilities.low, 0.423476);
  assertClose(summary.poolProbabilities.middle, 0.116672);
  assertClose(summary.poolProbabilities.high, 0.019394000000000022);
  assertClose(summary.poolProbabilities.ultimate, 0.0014819999999999833);
});

test("恒纪元域单候选的均值和奖池概率匹配精确基准", () => {
  const summary = summarize(distribution.domains.hengjiyuan);

  assertClose(summary.meanRawScore, 1.830068480250578);
  assertClose(summary.poolProbabilities.none, 0.22480429072920297);
  assertClose(summary.poolProbabilities.low, 0.4936548546948975);
  assertClose(summary.poolProbabilities.middle, 0.22228833224251798);
  assertClose(summary.poolProbabilities.high, 0.053209122049486246);
  assertClose(summary.poolProbabilities.ultimate, 0.006043400283895273);
});

test("普通域双候选择优使用 PMF 的精确 CDF", () => {
  const summary = summarize(distribution.domains.normal, 2);

  assertClose(summary.meanRawScore, 1.684043948229076);
  assertClose(summary.poolProbabilities.none, 0.192699928576);
  assertClose(summary.poolProbabilities.low, 0.5511235237280001);
  assertClose(summary.poolProbabilities.middle, 0.21486035507199996);
  assertClose(summary.poolProbabilities.high, 0.03835438894800003);
  assertClose(summary.poolProbabilities.ultimate, 0.0029618036759999633);
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
