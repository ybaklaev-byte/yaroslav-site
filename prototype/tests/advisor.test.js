import { test } from "node:test";
import assert from "node:assert/strict";
import { answer } from "../js/advisor.js";

const A = {
  score: 57, savingsRate: 0.2, discShare: 0.4, cushionMonths: 1.5,
  expMo: 40000, net: 15000, potential: 8000,
  expense: 120000, incMo: 55000,
  trimRecs: [{ name: "Такси", save: 2300 }, { name: "Кафе и рестораны", save: 2000 }],
  cats: [{ name: "Такси", sum: 20000 }, { name: "Кафе и рестораны", sum: 18000 }]
};

test("savings question lists trimmable categories with numbers", () => {
  const r = answer("на чём сэкономить?", A, []);
  assert.match(r, /Такси/);
  assert.match(r, /\d/);
});

test("cushion question explains the 3-6 month target", () => {
  const r = answer("хватит ли подушки?", A, []);
  assert.match(r, /3.?6|месяц/i);
});

test("investment question stays educational with a disclaimer", () => {
  const r = answer("во что инвестировать?", A, []);
  assert.match(r, /подушк|образоват|не .*рекоменд|общ/i);
});

test("score answer references previous snapshot when history present", () => {
  const history = [{ analysis: { score: 52 } }];
  const r = answer("какое у меня финансовое состояние?", A, history);
  assert.match(r, /52/);
});
