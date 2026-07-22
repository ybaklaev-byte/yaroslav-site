import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

let server;
let base;

before(async () => {
  // Большой лимит: функциональные тесты делают много register/login с одного IP;
  // сам rate-limit проверяется отдельно в deploy.test.js.
  server = createServer(':memory:', { rateLimit: { max: 1000 } });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  return raw.split(';')[0]; // "sid=..."
}

async function api(path, { method = 'GET', body, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, cookie: cookieFrom(res) };
}

function uniqueEmail() {
  return `user${Math.random().toString(36).slice(2)}@example.com`;
}

test('register -> 200 + set-cookie sid; duplicate register -> 409', async () => {
  const email = uniqueEmail();
  const r1 = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });
  assert.equal(r1.res.status, 200);
  assert.ok(r1.cookie && r1.cookie.startsWith('sid='));
  assert.equal(r1.json.user.email, email);

  const r2 = await api('/api/register', { method: 'POST', body: { email, password: 'secret2' } });
  assert.equal(r2.res.status, 409);
});

test('register with bad email / short password -> 400', async () => {
  const r1 = await api('/api/register', { method: 'POST', body: { email: 'not-an-email', password: 'secret1' } });
  assert.equal(r1.res.status, 400);

  const r2 = await api('/api/register', { method: 'POST', body: { email: uniqueEmail(), password: 'abc' } });
  assert.equal(r2.res.status, 400);
});

test('login correct -> 200 {user}; wrong password -> 401', async () => {
  const email = uniqueEmail();
  await api('/api/register', { method: 'POST', body: { email, password: 'correctpw' } });

  const ok = await api('/api/login', { method: 'POST', body: { email, password: 'correctpw' } });
  assert.equal(ok.res.status, 200);
  assert.equal(ok.json.user.email, email);
  assert.ok(ok.cookie);

  const bad = await api('/api/login', { method: 'POST', body: { email, password: 'wrongpw' } });
  assert.equal(bad.res.status, 401);
});

test('GET /api/me with cookie -> 200 {user}; without cookie -> 401', async () => {
  const email = uniqueEmail();
  const reg = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });

  const withCookie = await api('/api/me', { cookie: reg.cookie });
  assert.equal(withCookie.res.status, 200);
  assert.equal(withCookie.json.user.email, email);

  const withoutCookie = await api('/api/me');
  assert.equal(withoutCookie.res.status, 401);
});

test('GET /api/snapshots without session -> 401', async () => {
  const r = await api('/api/snapshots');
  assert.equal(r.res.status, 401);
});

test('POST snapshot -> 201; GET -> array with it; DELETE -> 200 and list empty', async () => {
  const email = uniqueEmail();
  const reg = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });
  const cookie = reg.cookie;

  const snap = { id: 'snap-1', date: Date.now(), source: 'demo', analysis: { total: 42 }, recDone: {} };
  const post = await api('/api/snapshots', { method: 'POST', body: snap, cookie });
  assert.equal(post.res.status, 201);

  const list = await api('/api/snapshots', { cookie });
  assert.equal(list.res.status, 200);
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].id, 'snap-1');
  assert.deepEqual(list.json[0].analysis, { total: 42 });

  const del = await api('/api/snapshots/snap-1', { method: 'DELETE', cookie });
  assert.equal(del.res.status, 200);

  const list2 = await api('/api/snapshots', { cookie });
  assert.equal(list2.json.length, 0);
});

test('isolation: user A snapshot invisible to user B', async () => {
  const emailA = uniqueEmail();
  const emailB = uniqueEmail();
  const regA = await api('/api/register', { method: 'POST', body: { email: emailA, password: 'secret1' } });
  const regB = await api('/api/register', { method: 'POST', body: { email: emailB, password: 'secret1' } });

  const snap = { id: 'snap-a', date: Date.now(), source: 'demo', analysis: {}, recDone: {} };
  await api('/api/snapshots', { method: 'POST', body: snap, cookie: regA.cookie });

  const listB = await api('/api/snapshots', { cookie: regB.cookie });
  assert.equal(listB.json.length, 0);
});

test('PATCH /api/snapshots/:id/rec -> 200, flag visible in GET', async () => {
  const email = uniqueEmail();
  const reg = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });
  const cookie = reg.cookie;

  const snap = { id: 'snap-rec', date: Date.now(), source: 'demo', analysis: {}, recDone: {} };
  await api('/api/snapshots', { method: 'POST', body: snap, cookie });

  const patch = await api('/api/snapshots/snap-rec/rec', {
    method: 'PATCH',
    body: { recId: 'cushion', done: true },
    cookie,
  });
  assert.equal(patch.res.status, 200);

  const list = await api('/api/snapshots', { cookie });
  assert.equal(list.json[0].recDone.cushion, true);
});

test('PATCH /api/profile -> 200, GET /api/me reflects name', async () => {
  const email = uniqueEmail();
  const reg = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });
  const cookie = reg.cookie;

  const patch = await api('/api/profile', { method: 'PATCH', body: { name: 'Тест' }, cookie });
  assert.equal(patch.res.status, 200);

  const me = await api('/api/me', { cookie });
  assert.equal(me.json.user.name, 'Тест');
});

test('logout -> 200; after logout /api/me -> 401', async () => {
  const email = uniqueEmail();
  const reg = await api('/api/register', { method: 'POST', body: { email, password: 'secret1' } });
  const cookie = reg.cookie;

  const logout = await api('/api/logout', { method: 'POST', cookie });
  assert.equal(logout.res.status, 200);

  const me = await api('/api/me', { cookie });
  assert.equal(me.res.status, 401);
});

test('GET / -> 200 and Content-Type text/html (static serving)', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-type').includes('text/html'));
});
