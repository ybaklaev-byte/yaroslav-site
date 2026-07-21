function splitLine(l, d) {
  const o = []; let c = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') q = !q;
    else if (ch === d && !q) { o.push(c); c = ""; }
    else c += ch;
  }
  o.push(c);
  return o.map((s) => s.trim().replace(/^"|"$/g, ""));
}

export function parseCSV(t) {
  const ls = t.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!ls.length) return null;
  const d = ls[0].split(";").length > ls[0].split(",").length ? ";" : ",";
  return ls.map((l) => splitLine(l, d));
}

export function parseAmt(s) {
  if (s == null) return NaN;
  s = ("" + s).replace(/ /g, "").replace(/[^\d,.\-]/g, "").replace(/\s/g, "").replace(/,/g, ".");
  const p = s.split(".");
  if (p.length > 2) s = p.slice(0, -1).join("") + "." + p[p.length - 1];
  return parseFloat(s);
}

export function parseDate(s) {
  const m = (s || "").match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? "20" + m[3] : m[3];
  return new Date(+y, +m[2] - 1, +m[1]).getTime();
}

export function rowsToTx(rows) {
  const start = rows[0].some((c) => /дата|сумма|опис|date|amount/i.test(c)) ? 1 : 0;
  const n = rows[0].length, sample = rows.slice(start, start + 6);
  let dc = 0, ac = 1;
  for (let c = 0; c < n; c++) {
    const vals = sample.map((r) => r[c] || "");
    if (vals.some((v) => /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(v))) dc = c;
    else if (vals.some((v) => /^-?[\d\s]+[.,]\d{2}$/.test(v))) ac = c;
  }
  let best = -1, bl = 0;
  for (let k = 0; k < n; k++) {
    if (k === dc || k === ac) continue;
    const avg = sample.reduce((s, r) => s + ((r[k] || "").length), 0);
    if (avg > bl) { bl = avg; best = k; }
  }
  const descC = best >= 0 ? best : 2, out = [];
  for (let i = start; i < rows.length; i++) {
    const amt = parseAmt(rows[i][ac]);
    if (Number.isNaN(amt) || amt === 0) continue;
    out.push({ ts: parseDate(rows[i][dc]) || Date.now(), amount: amt, desc: rows[i][descC] || "" });
  }
  return out;
}
