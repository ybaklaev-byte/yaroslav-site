import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// minimal localStorage mock (node has no DOM) — same shape as store.test.js
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const api = await import("../js/api.js");
const store = await import("../js/store.js");

function mockFetch(handler) {
  globalThis.fetch = async (url, opts) => handler(url, opts);
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

test("apiLogin: 200 resolves with {user}", async () => {
  mockFetch(async (url) => {
    assert.equal(url, "/api/login");
    return jsonResponse(200, { user: { id: 1, email: "a@b.com", name: null } });
  });
  const res = await api.apiLogin("a@b.com", "secret1");
  assert.equal(res.user.email, "a@b.com");
});

test("apiLogin: 401 throws Error with code=401", async () => {
  mockFetch(async () => jsonResponse(401, { error: "invalid credentials" }));
  await assert.rejects(
    () => api.apiLogin("a@b.com", "wrong"),
    (err) => {
      assert.equal(err.code, 401);
      return true;
    }
  );
});

test("apiMe: network failure resolves null and isApiAvailable() becomes false", async () => {
  mockFetch(async () => { throw new Error("network down"); });
  const res = await api.apiMe();
  assert.equal(res, null);
  assert.equal(api.isApiAvailable(), false);
});

test("apiMe: successful call resets isApiAvailable() to true", async () => {
  mockFetch(async () => { throw new Error("network down"); });
  await api.apiMe();
  assert.equal(api.isApiAvailable(), false);

  mockFetch(async () => jsonResponse(200, { user: { id: 1, email: "a@b.com", name: null } }));
  const res = await api.apiMe();
  assert.ok(res.user);
  assert.equal(api.isApiAvailable(), true);
});

test("store.setMode('api') + pushSnapshot calls fetch on /api/snapshots and caches locally", async () => {
  let called = null;
  mockFetch(async (url, opts) => {
    called = { url, opts };
    return jsonResponse(201, { ok: true });
  });
  store.setMode("api");
  const snap = { id: "s1", date: 1000, source: "demo", analysis: { score: 1 }, recDone: {} };
  const result = await store.pushSnapshot(snap);

  assert.equal(called.url, "/api/snapshots");
  assert.equal(called.opts.method, "POST");
  const sent = JSON.parse(called.opts.body);
  assert.equal(sent.id, "s1");

  const cached = store.getSnapshot("s1");
  assert.ok(cached);
  assert.equal(cached.analysis.score, 1);
  assert.notEqual(result && result.offline, true);

  store.setMode("local");
});

test("mergeLocalToServer: 2 local snapshots -> 2 fetch calls, returns 2", async () => {
  store.setMode("local");
  store.saveSnapshot({ score: 1 }, "demo");
  store.saveSnapshot({ score: 2 }, "demo");

  let calls = 0;
  mockFetch(async () => { calls += 1; return jsonResponse(201, { ok: true }); });

  store.setMode("api");
  const n = await store.mergeLocalToServer();
  assert.equal(calls, 2);
  assert.equal(n, 2);

  // local snapshots must remain (now acting as cache)
  assert.equal(store.listSnapshots().length, 2);

  store.setMode("local");
});

test("offline: pushSnapshot in api mode does not throw when fetch rejects, saves locally, returns {offline:true}", async () => {
  mockFetch(async () => { throw new Error("offline"); });
  store.setMode("api");
  const snap = { id: "s-off", date: 2000, source: "demo", analysis: { score: 9 }, recDone: {} };
  const result = await store.pushSnapshot(snap);

  assert.equal(result.offline, true);
  const cached = store.getSnapshot("s-off");
  assert.ok(cached);
  assert.equal(cached.analysis.score, 9);

  store.setMode("local");
});
