import {
  apiListSnapshots,
  apiSaveSnapshot,
  apiDeleteSnapshot,
  apiSetRecDone,
  apiSetName
} from "./api.js";

const SNAP_KEY = "fin-snapshots-v1";
const PROF_KEY = "fin-profile-v1";

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}

export function available() {
  try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; }
  catch (e) { return false; }
}
export function listSnapshots() {
  return read(SNAP_KEY, []).slice().sort((a, b) => a.date - b.date);
}
export function saveSnapshot(analysis, source) {
  const all = read(SNAP_KEY, []);
  const snap = { id: "s" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), date: Date.now(), period: "", source, analysis, recDone: {} };
  all.push(snap); write(SNAP_KEY, all); return snap;
}
export function getSnapshot(id) { return read(SNAP_KEY, []).find((s) => s.id === id) || null; }
export function deleteSnapshot(id) { write(SNAP_KEY, read(SNAP_KEY, []).filter((s) => s.id !== id)); }
export function setRecDone(id, recId, done) {
  const all = read(SNAP_KEY, []); const s = all.find((x) => x.id === id);
  if (!s) return; s.recDone = s.recDone || {}; s.recDone[recId] = done; write(SNAP_KEY, all);
}
export function getProfile() { return read(PROF_KEY, { name: "", theme: "dark" }); }
export function setProfile(patch) { write(PROF_KEY, { ...getProfile(), ...patch }); }

// ---- dual-mode layer (local | api) --------------------------------------
// Everything above is the synchronous, localStorage-only interface used by
// guest mode / offline cache. Everything below adds an async layer that,
// when in "api" mode, talks to the server and keeps the localStorage cache
// in sync. Network failures here never throw: they fall back to local
// behaviour and report {offline:true} so the UI can show a banner.

let mode = "local";

export function setMode(m) {
  mode = m === "api" ? "api" : "local";
}
export function getMode() {
  return mode;
}

function upsertLocal(snap) {
  const all = read(SNAP_KEY, []);
  const idx = all.findIndex((s) => s.id === snap.id);
  if (idx === -1) all.push(snap);
  else all[idx] = snap;
  write(SNAP_KEY, all);
}

function isNetworkError(e) {
  return !!(e && e.networkError);
}

export async function syncFromServer() {
  if (mode !== "api") return 0;
  let list;
  try {
    list = await apiListSnapshots();
  } catch (e) {
    return 0;
  }
  write(SNAP_KEY, list);
  return list.length;
}

export async function pushSnapshot(snap) {
  if (mode === "api") {
    try {
      await apiSaveSnapshot(snap);
      upsertLocal(snap);
      return { ...snap, offline: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      upsertLocal(snap);
      return { ...snap, offline: true };
    }
  }
  upsertLocal(snap);
  return { ...snap, offline: false };
}

export async function pushRecDone(id, recId, done) {
  if (mode === "api") {
    try {
      await apiSetRecDone(id, recId, done);
      setRecDone(id, recId, done);
      return { offline: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      setRecDone(id, recId, done);
      return { offline: true };
    }
  }
  setRecDone(id, recId, done);
  return { offline: false };
}

export async function removeSnapshot(id) {
  if (mode === "api") {
    try {
      await apiDeleteSnapshot(id);
      deleteSnapshot(id);
      return { offline: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      deleteSnapshot(id);
      return { offline: true };
    }
  }
  deleteSnapshot(id);
  return { offline: false };
}

export async function pushName(name) {
  if (mode === "api") {
    try {
      await apiSetName(name);
      setProfile({ name });
      return { offline: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      setProfile({ name });
      return { offline: true };
    }
  }
  setProfile({ name });
  return { offline: false };
}

export async function mergeLocalToServer() {
  if (mode !== "api") return 0;
  const all = read(SNAP_KEY, []);
  let count = 0;
  for (const snap of all) {
    try {
      await apiSaveSnapshot(snap);
      count += 1;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // network down: stop trying further uploads this round
      break;
    }
  }
  return count;
}
