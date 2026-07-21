// Thin client for the /api/* backend. Only dependency: global fetch.
// Pure — no DOM, no localStorage. Network failures never throw: callers
// get null/false back and isApiAvailable() flips to false.

let available = true;

export function isApiAvailable() {
  return available;
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    available = false;
    const err = new Error("network error");
    err.code = 0;
    err.networkError = true;
    throw err;
  }
  available = true;
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `http ${res.status}`);
    err.code = res.status;
    throw err;
  }
  return data;
}

export async function apiRegister(email, password) {
  return request("POST", "/api/register", { email, password });
}

export async function apiLogin(email, password) {
  return request("POST", "/api/login", { email, password });
}

export async function apiLogout() {
  try {
    return await request("POST", "/api/logout");
  } catch (e) {
    if (e.networkError) return null;
    throw e;
  }
}

export async function apiMe() {
  try {
    return await request("GET", "/api/me");
  } catch (e) {
    if (e.networkError) return null;
    if (e.code === 401) return null;
    return null;
  }
}

export async function apiListSnapshots() {
  return request("GET", "/api/snapshots");
}

export async function apiSaveSnapshot(snap) {
  return request("POST", "/api/snapshots", snap);
}

export async function apiDeleteSnapshot(id) {
  return request("DELETE", `/api/snapshots/${encodeURIComponent(id)}`);
}

export async function apiSetRecDone(id, recId, done) {
  return request("PATCH", `/api/snapshots/${encodeURIComponent(id)}/rec`, { recId, done });
}

export async function apiSetName(name) {
  return request("PATCH", "/api/profile", { name });
}
