import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, parseAmt, parseDate, rowsToTx } from "../js/parser.js";

test("parseAmt handles RU spaces and comma decimal", () => {
  assert.equal(parseAmt("-2 682,00"), -2682);
  assert.equal(parseAmt("289.99"), 289.99);
  assert.ok(Number.isNaN(parseAmt("abc")));
});

test("parseDate parses dd.mm.yyyy to epoch", () => {
  assert.equal(parseDate("09.07.2026"), new Date(2026, 6, 9).getTime());
  assert.equal(parseDate("нет даты"), null);
});

test("parseCSV auto-detects semicolon delimiter", () => {
  const rows = parseCSV("Дата;Сумма;Описание\n09.07.2026;-289,00;PYATEROCHKA");
  assert.deepEqual(rows[1], ["09.07.2026", "-289,00", "PYATEROCHKA"]);
});

test("rowsToTx skips header and maps columns", () => {
  const rows = parseCSV(
    "Дата;Сумма;Описание\n09.07.2026;-289,00;PYATEROCHKA\n08.07.2026;+80000,00;Зарплата"
  );
  const tx = rowsToTx(rows);
  assert.equal(tx.length, 2);
  assert.equal(tx[0].amount, -289);
  assert.equal(tx[1].amount, 80000);
  assert.equal(tx[0].desc, "PYATEROCHKA");
});
