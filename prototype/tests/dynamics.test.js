import { test } from "node:test";
import assert from "node:assert/strict";
import { series, latestDelta } from "../js/dynamics.js";

const hist = [
  { date: 1, analysis: { score: 52, expMo: 40000, savingsRate: 0.1 } },
  { date: 2, analysis: { score: 57, expMo: 37000, savingsRate: 0.2 } }
];

test("series extracts parallel arrays", () => {
  const s = series(hist);
  assert.deepEqual(s.score, [52, 57]);
  assert.deepEqual(s.expMo, [40000, 37000]);
});

test("latestDelta is signed change between last two", () => {
  assert.equal(latestDelta(hist).score, 5);
  assert.equal(latestDelta(hist).expMo, -3000);
});

test("latestDelta null when fewer than two snapshots", () => {
  assert.equal(latestDelta([hist[0]]), null);
});
