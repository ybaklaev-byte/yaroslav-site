import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, newToken, validEmail, validPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_ROOT = path.resolve(__dirname, '..', 'prototype');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const pair of header.split('; ')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return cookies;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const PARSE_ERROR = Symbol('parse error');

// Прекомпьют для выравнивания тайминга логина: если email не найден,
// всё равно выполняем scrypt той же стоимости (анти-перечисление пользователей).
const DUMMY = hashPassword('dummy-timing-equalizer');

function normEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function validSnapshot(body) {
  return !!(body && typeof body.id === 'string' && body.id.length > 0 &&
    typeof body.date === 'number' && Number.isFinite(body.date) &&
    body.analysis && typeof body.analysis === 'object');
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return PARSE_ERROR;
  }
}

function serveStatic(req, res, pathname) {
  let urlPath = decodeURIComponent(pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const resolved = path.resolve(path.join(STATIC_ROOT, urlPath));
  if (resolved !== STATIC_ROOT && !resolved.startsWith(STATIC_ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    const type = MIME[path.extname(resolved)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

export function createServer(dbPath, opts = {}) {
  const db = openDb(dbPath);
  const secure = opts.secure ?? process.env.BALANCE_SECURE === '1';
  const rl = { max: 10, windowMs: 15 * 60 * 1000, ...(opts.rateLimit || {}) };
  // Rate-limit попыток register/login: ip -> {count, resetAt}. В памяти —
  // при рестарте сбрасывается, для одного VPS этого достаточно.
  const attempts = new Map();

  function clientIp(req) {
    // За Caddy/nginx remoteAddress — это прокси; берём первый X-Forwarded-For.
    if (secure && req.headers['x-forwarded-for']) {
      return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function rateLimited(req) {
    const now = Date.now();
    const ip = clientIp(req);
    let rec = attempts.get(ip);
    if (!rec || now >= rec.resetAt) {
      rec = { count: 0, resetAt: now + rl.windowMs };
      attempts.set(ip, rec);
    }
    rec.count += 1;
    if (attempts.size > 10000) attempts.clear(); // страховка от разрастания
    return rec.count > rl.max;
  }

  function requireAuth(req) {
    const cookies = parseCookies(req);
    const token = cookies.sid;
    if (!token) return null;
    const session = db.findSession(token);
    if (!session) return null;
    return session.user_id;
  }

  function setSidCookie(res, token) {
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`);
  }

  function clearSidCookie(res) {
    res.setHeader('Set-Cookie', `sid=; Max-Age=0; Path=/${secure ? '; Secure' : ''}`);
  }

  async function handleApi(req, res, method, pathname) {
    if (method === 'POST' && pathname === '/api/register') {
      if (rateLimited(req)) return json(res, 429, { error: 'too many attempts' });
      const body = await readJson(req);
      if (body === PARSE_ERROR) return json(res, 400, { error: 'bad json' });
      const email = normEmail((body ?? {}).email);
      const password = (body ?? {}).password;
      if (!validEmail(email) || !validPassword(password)) return json(res, 400, { error: 'invalid' });
      const { hash, salt } = hashPassword(password);
      const user = db.createUser(email, hash, salt);
      if (!user) return json(res, 409, { error: 'taken' });
      const token = newToken();
      db.createSession(token, user.id);
      setSidCookie(res, token);
      return json(res, 200, { user });
    }

    if (method === 'POST' && pathname === '/api/login') {
      if (rateLimited(req)) return json(res, 429, { error: 'too many attempts' });
      const body = await readJson(req);
      if (body === PARSE_ERROR) return json(res, 400, { error: 'bad json' });
      const email = normEmail((body ?? {}).email);
      const password = (body ?? {}).password;
      const row = db.findUserByEmail(email);
      // Тайминг выравнен: scrypt выполняется и при несуществующем email.
      const ok = row
        ? verifyPassword(password ?? '', row.pass_hash, row.salt)
        : (verifyPassword(password ?? '', DUMMY.hash, DUMMY.salt), false);
      if (!ok) return json(res, 401, { error: 'invalid credentials' });
      const token = newToken();
      db.createSession(token, row.id);
      setSidCookie(res, token);
      return json(res, 200, { user: { id: row.id, email: row.email, name: row.name } });
    }

    if (method === 'POST' && pathname === '/api/logout') {
      const cookies = parseCookies(req);
      if (cookies.sid) db.deleteSession(cookies.sid);
      clearSidCookie(res);
      return json(res, 200, { ok: true });
    }

    // everything below requires a session
    const userId = requireAuth(req);
    if (!userId) return json(res, 401, { error: 'unauthorized' });

    if (method === 'GET' && pathname === '/api/me') {
      const user = db.findUserById(userId);
      return json(res, 200, { user });
    }

    if (method === 'GET' && pathname === '/api/snapshots') {
      return json(res, 200, db.listSnapshots(userId));
    }

    if (method === 'POST' && pathname === '/api/snapshots') {
      const body = await readJson(req);
      if (body === PARSE_ERROR) return json(res, 400, { error: 'bad json' });
      if (!validSnapshot(body)) return json(res, 400, { error: 'invalid snapshot' });
      db.upsertSnapshot(userId, body);
      return json(res, 201, { ok: true });
    }

    const recMatch = pathname.match(/^\/api\/snapshots\/([^/]+)\/rec$/);
    if (method === 'PATCH' && recMatch) {
      const id = decodeURIComponent(recMatch[1]);
      const body = await readJson(req);
      if (body === PARSE_ERROR) return json(res, 400, { error: 'bad json' });
      const { recId, done } = body ?? {};
      db.setRecDone(userId, id, recId, done);
      return json(res, 200, { ok: true });
    }

    const snapMatch = pathname.match(/^\/api\/snapshots\/([^/]+)$/);
    if (method === 'DELETE' && snapMatch) {
      const id = decodeURIComponent(snapMatch[1]);
      db.deleteSnapshot(userId, id);
      return json(res, 200, { ok: true });
    }

    if (method === 'PATCH' && pathname === '/api/profile') {
      const body = await readJson(req);
      if (body === PARSE_ERROR) return json(res, 400, { error: 'bad json' });
      const { name } = body ?? {};
      if (typeof name !== 'string') return json(res, 400, { error: 'invalid' });
      db.updateUserName(userId, name);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'not found' });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      const method = req.method;
      if (pathname.startsWith('/api/')) {
        await handleApi(req, res, method, pathname);
        return;
      }
      if (method === 'GET' || method === 'HEAD') {
        serveStatic(req, res, pathname);
        return;
      }
      res.writeHead(404);
      res.end('not found');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'server' });
      else res.end();
    }
  });

  server.on('close', () => db.close());

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = createServer(path.join(__dirname, 'data.db'));
  const port = process.env.PORT || 4600;
  server.listen(port, () => console.log(`listening on ${port}`));
  // Корректное завершение (systemd шлёт SIGTERM): закрыть сервер и БД.
  const shutdown = (sig) => {
    console.log(`${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
