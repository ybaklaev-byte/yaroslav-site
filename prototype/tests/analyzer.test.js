import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../js/analyzer.js";

function tx(daysAgo, amount, desc) {
  return { ts: Date.now() - daysAgo * 86400000, amount, desc };
}

test("analyze computes income/expense and excludes internal transfers", () => {
  const a = analyze([
    tx(1, 80000, "Зарплата"),
    tx(2, -20000, "Аренда ЖКХ"),
    tx(3, -55000, "Перевод на вклад") // internal → excluded from expense
  ]);
  assert.equal(a.income, 80000);
  assert.equal(a.expense, 20000);
  assert.ok(a.buffer >= 55000);
});

test("savingsRate positive when income exceeds expense", () => {
  const a = analyze([tx(1, 100000, "Зарплата"), tx(2, -60000, "Продукты Пятёрочка")]);
  assert.ok(a.savingsRate > 0.3 && a.savingsRate < 0.45);
});

test("score is within bounds and risks/recs are non-empty arrays", () => {
  const a = analyze([tx(1, 90000, "Зарплата"), tx(2, -30000, "Кафе"), tx(3, -20000, "Такси")]);
  assert.ok(a.score >= 4 && a.score <= 97);
  assert.ok(Array.isArray(a.risks) && a.risks.length > 0);
  assert.ok(Array.isArray(a.recs) && a.recs.length > 0);
  for (const r of a.recs) assert.ok(typeof r.id === "string" && r.id.length > 0);
});

test("no-income statement flags income-not-found and does not invent savingsRate", () => {
  const a = analyze([tx(1, -5000, "Пятёрочка"), tx(2, -3000, "Кафе")]);
  assert.equal(a.income, 0);
  assert.equal(a.savingsRate, 0); // guarded, not NaN/Infinity
});
