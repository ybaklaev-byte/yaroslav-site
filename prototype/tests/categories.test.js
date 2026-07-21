import { test } from "node:test";
import assert from "node:assert/strict";
import { autoCat, isInternal, CATS } from "../js/categories.js";

test("autoCat classifies known merchants", () => {
  assert.equal(autoCat("PYATEROCHKA 27591"), "food");
  assert.equal(autoCat("YANDEX EDA"), "cafe");
  assert.equal(autoCat("LUKOIL AZS"), "fuel");
  assert.equal(autoCat("что-то неизвестное"), "other");
});

test("every category id used by autoCat exists in CATS", () => {
  for (const id of ["food", "cafe", "fuel", "other"]) assert.ok(CATS[id]);
});

test("isInternal flags own-account transfers", () => {
  assert.equal(isInternal("Перевод на вклад"), true);
  assert.equal(isInternal("PYATEROCHKA"), false);
});
