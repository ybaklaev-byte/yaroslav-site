import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

// Каждый тест поднимает свой сервер со своими опциями (и своей in-memory БД).
async function boot(opts) {
  const server = createServer(':memory:', opts);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const stop = () => new Promise((resolve) => server.close(resolve));
  async function api(path, { method = 'GET', body, cookie } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { res, json, setCookie: res.headers.get('set-cookie') };
  }
  return { api, stop };
}

test('email is normalized: register " A@B.RU " then login with "a@b.ru"', async () => {
  const { api, stop } = await boot();
  try {
    const reg = await api('/api/register', { method: 'POST', body: { email: '  A@B.RU ', password: 'secret1' } });
    assert.equal(reg.res.status, 200);
    assert.equal(reg.json.user.email, 'a@b.ru');
    const login = await api('/api/login', { method: 'POST', body: { email: 'a@b.ru', password: 'secret1' } });
    assert.equal(login.res.status, 200);
    // и дубликат в другом регистре не создаётся
    const dup = await api('/api/register', { method: 'POST', body: { email: 'a@B.ru', password: 'secret2' } });
    assert.equal(dup.res.status, 409);
  } finally {
    await stop();
  }
});

test('POST /api/snapshots validates body: {} -> 400, valid -> 201', async () => {
  const { api, stop } = await boot();
  try {
    const reg = await api('/api/register', { method: 'POST', body: { email: 'v@x.ru', password: 'secret1' } });
    const cookie = reg.setCookie.split(';')[0];
    const bad = await api('/api/snapshots', { method: 'POST', body: {}, cookie });
    assert.equal(bad.res.status, 400);
    const bad2 = await api('/api/snapshots', { method: 'POST', body: { id: 's1', date: 'oops', analysis: {} }, cookie });
    assert.equal(bad2.res.status, 400);
    const ok = await api('/api/snapshots', {
      method: 'POST',
      body: { id: 's1', date: 123, source: 'demo', analysis: { score: 50 }, recDone: {} },
      cookie,
    });
    assert.equal(ok.res.status, 201);
  } finally {
    await stop();
  }
});

test('rate limit: attempts over max return 429', async () => {
  const { api, stop } = await boot({ rateLimit: { max: 3, windowMs: 60000 } });
  try {
    for (let i = 0; i < 3; i++) {
      const r = await api('/api/login', { method: 'POST', body: { email: 'no@no.ru', password: 'wrong123' } });
      assert.equal(r.res.status, 401);
    }
    const fourth = await api('/api/login', { method: 'POST', body: { email: 'no@no.ru', password: 'wrong123' } });
    assert.equal(fourth.res.status, 429);
  } finally {
    await stop();
  }
});

test('secure option adds Secure flag to cookies', async () => {
  const { api, stop } = await boot({ secure: true });
  try {
    const reg = await api('/api/register', { method: 'POST', body: { email: 's@x.ru', password: 'secret1' } });
    assert.equal(reg.res.status, 200);
    assert.match(reg.setCookie, /; Secure/);
  } finally {
    await stop();
  }
});

test('login with unknown email still returns 401 (dummy-scrypt path works)', async () => {
  const { api, stop } = await boot();
  try {
    const r = await api('/api/login', { method: 'POST', body: { email: 'ghost@nowhere.ru', password: 'whatever1' } });
    assert.equal(r.res.status, 401);
  } finally {
    await stop();
  }
});
