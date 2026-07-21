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
  const snap = { id: "s" + Date.now(), date: Date.now(), source, analysis, recDone: {} };
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
