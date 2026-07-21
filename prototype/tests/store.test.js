import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// minimal localStorage mock (node has no DOM)
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
});

const store = await import("../js/store.js");

test("saveSnapshot then listSnapshots returns it", () => {
  const s = store.saveSnapshot({ score: 57 }, "demo");
  const list = store.listSnapshots();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, s.id);
  assert.equal(list[0].analysis.score, 57);
});

test("snapshots are sorted by date ascending", () => {
  const a = store.saveSnapshot({ score: 1 }, "demo");
  a.date = 1000; store.deleteSnapshot(a.id);
  store.saveSnapshot({ score: 2 }, "demo");
  store.saveSnapshot({ score: 3 }, "demo");
  const list = store.listSnapshots();
  assert.ok(list[0].date <= list[1].date);
});

test("setRecDone toggles a recommendation flag", () => {
  const s = store.saveSnapshot({ score: 57 }, "demo");
  store.setRecDone(s.id, "cushion", true);
  assert.equal(store.getSnapshot(s.id).recDone.cushion, true);
});

test("available() false when localStorage throws", () => {
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.equal(store.available(), false);
});
