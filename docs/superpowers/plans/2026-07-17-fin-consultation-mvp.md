# Fin-Consultation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web app from a one-shot analyzer into a periodic financial-checkup product: modular analysis core, local snapshot history, a "Динамика" screen, and a rule-based advisor that references past checkups.

**Architecture:** Extract the logic currently inlined in `prototype/app.html` into pure, testable ES modules (`parser`, `analyzer`, `advisor`) plus a `store` (localStorage) and a `ui` (DOM render) layer. Pure modules never touch DOM/localStorage/network, so they run under `node --test` and can later be moved to a backend unchanged. History is an array of dated snapshots in localStorage; "Динамика" and advisor memory are computed from that array.

**Tech Stack:** Vanilla JavaScript (ES modules, no framework, no bundler), served by the existing `.claude/serve.js` static server. Tests: Node built-in `node:test` + `node:assert` (no third-party deps).

## Global Constraints

- No build step, no framework, no bundler — plain `<script type="module">` in the browser. (verbatim: matches existing `prototype/` approach)
- No third-party runtime or test dependencies — tests use only `node:test` and `node:assert`.
- Pure modules (`parser.js`, `analyzer.js`, `advisor.js`) MUST NOT reference `document`, `window`, `localStorage`, or the network. Only `store.js` uses `localStorage`; only `ui.js` uses the DOM.
- One currency: RUB (₽). Amounts are numbers; expenses negative, income positive.
- Advisor is rule-based (deterministic). No LLM, no backend, no network calls.
- Advisor MUST NOT give personalized investment advice — investment/savings answers are general education only, with a disclaimer.
- Reuse existing design tokens: fonts Fraunces/Inter/JetBrains Mono; accents `--amber #C98A3E`, `--trail #4C7A64`, `--rust #A65142`; light+dark theme via `data-theme`.
- All data stays local (localStorage). No data leaves the browser.

---

### Task 1: Module/test scaffolding

**Files:**
- Create: `prototype/package.json`
- Create: `prototype/js/.gitkeep`
- Create: `prototype/tests/smoke.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: an ES-module-scoped `prototype/` subtree where `node --test` runs `*.test.js` files as ESM. Later tasks put pure modules in `prototype/js/` and tests in `prototype/tests/`.

- [ ] **Step 1: Write the failing test**

`prototype/tests/smoke.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`/parse error because `prototype/` is not yet ESM-scoped (no `package.json` with `"type":"module"`), so `import` at top level throws.

- [ ] **Step 3: Create the scope + placeholder**

`prototype/package.json`:
```json
{
  "name": "fin-consultation-prototype",
  "private": true,
  "type": "module"
}
```

`prototype/js/.gitkeep`: (empty file)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/package.json prototype/js/.gitkeep prototype/tests/smoke.test.js
git commit -m "chore: esm scaffolding + node test runner for prototype"
```

---

### Task 2: CSV parser module

**Files:**
- Create: `prototype/js/parser.js`
- Create: `prototype/tests/parser.test.js`
- Source to port from: `prototype/app.html` (inline `splitLine`, `parseCSV`, `parseAmt`, `parseDate`, `rowsToTx`).

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCSV(text: string): string[][] | null` — rows of trimmed cells; delimiter auto-detected (`;` vs `,`); `null` if empty.
  - `parseAmt(s: string): number` — `"−2 682,00"`→`-2682`, `"289.99"`→`289.99`, `NaN` if unparseable.
  - `parseDate(s: string): number | null` — `"09.07.2026"`→ epoch ms; supports `.`/`/`/`-`; 2-digit year → 20xx; `null` if none.
  - `rowsToTx(rows: string[][]): {ts:number, amount:number, desc:string}[]` — auto-detects date/amount/description columns, skips header, drops rows with `NaN`/zero amount.

- [ ] **Step 1: Write the failing test**

`prototype/tests/parser.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, parseAmt, parseDate, rowsToTx } from "../js/parser.js";

test("parseAmt handles RU spaces and comma decimal", () => {
  assert.equal(parseAmt("-2 682,00"), -2682);
  assert.equal(parseAmt("289.99"), 289.99);
  assert.ok(Number.isNaN(parseAmt("abc")));
});

test("parseDate parses dd.mm.yyyy to epoch", () => {
  assert.equal(parseDate("09.07.2026"), new Date(2026, 6, 9).getTime());
  assert.equal(parseDate("нет даты"), null);
});

test("parseCSV auto-detects semicolon delimiter", () => {
  const rows = parseCSV("Дата;Сумма;Описание\n09.07.2026;-289,00;PYATEROCHKA");
  assert.deepEqual(rows[1], ["09.07.2026", "-289,00", "PYATEROCHKA"]);
});

test("rowsToTx skips header and maps columns", () => {
  const rows = parseCSV(
    "Дата;Сумма;Описание\n09.07.2026;-289,00;PYATEROCHKA\n08.07.2026;+80000,00;Зарплата"
  );
  const tx = rowsToTx(rows);
  assert.equal(tx.length, 2);
  assert.equal(tx[0].amount, -289);
  assert.equal(tx[1].amount, 80000);
  assert.equal(tx[0].desc, "PYATEROCHKA");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/parser.test.js`
Expected: FAIL — `Cannot find module '../js/parser.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/parser.js` — port the inline functions from `prototype/app.html`, add `export`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/parser.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/parser.js prototype/tests/parser.test.js
git commit -m "feat: extract CSV parser into pure module with tests"
```

---

### Task 3: Categorization

**Files:**
- Create: `prototype/js/categories.js`
- Create: `prototype/tests/categories.test.js`
- Source to port from: `prototype/app.html` (inline `CATS`, `RULES`, `autoCat`).

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CATS: Record<string,{name,icon,color,ess:boolean}>` — category metadata; `ess` marks essential categories.
  - `autoCat(desc: string): string` — returns a category id from `CATS` (falls back to `"other"`).
  - `isInternal(desc: string): boolean` — true for transfers to own accounts/savings/brokerage (excluded from spending).

- [ ] **Step 1: Write the failing test**

`prototype/tests/categories.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/categories.test.js`
Expected: FAIL — `Cannot find module '../js/categories.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/categories.js` — port `CATS` and the `RULES` array from `app.html`, plus:
```js
export const CATS = {
  food: { name: "Продукты", icon: "🛒", color: "#C98A3E", ess: true },
  cafe: { name: "Кафе и рестораны", icon: "☕", color: "#A65142", ess: false },
  taxi: { name: "Такси", icon: "🚕", color: "#4C7A64", ess: false },
  transport: { name: "Транспорт", icon: "🚇", color: "#3E8DA6", ess: true },
  fuel: { name: "Топливо", icon: "⛽", color: "#7C6BA6", ess: true },
  home: { name: "Дом и ЖКХ", icon: "🏠", color: "#5EA98A", ess: true },
  fun: { name: "Развлечения", icon: "🎬", color: "#C95E8A", ess: false },
  health: { name: "Здоровье", icon: "💊", color: "#5E8AA9", ess: true },
  shopping: { name: "Покупки", icon: "🛍️", color: "#B98A3E", ess: false },
  alcohol: { name: "Алкоголь и табак", icon: "🍷", color: "#8A5EA9", ess: false },
  connect: { name: "Связь и подписки", icon: "📱", color: "#3EA69A", ess: true },
  other: { name: "Прочее", icon: "•", color: "#8A93A0", ess: false }
};

// Port the exact RULES array from prototype/app.html (regex per category).
const RULES = [
  ["food", /пятероч|пятёроч|pyaterochka|магнит|magnit|перекр|perekrest|ашан|auchan|лента|дикси|dixy|вкусвилл|vkusvill|продукт|мираторг|miratorg|пекарн|bukhanka/i],
  ["cafe", /кафе|кофе|coffee|ресторан|restoran|veranda|burger|kfc|вкусно|rostic|шоколад|столов|яндекс.?еда|yandex.?eda|\beda\b|достав|dostavka|самокат|pizza|додо/i],
  ["taxi", /такси|taxi|uber|fasten|ситимобил|яндекс.?такси/i],
  ["transport", /метро|metro|mos.?transport|strelka|тройка|troika|автобус|электричк/i],
  ["fuel", /азс|azs|нефт|лукойл|lukoil|газпром|gazprom|роснефт|топлив|petrol|shell/i],
  ["home", /жкх|коммунал|мосэнерго|энергосбыт|аренда|rent|мебель|leroy|ikea|икеа|хозтовар|твой дом/i],
  ["fun", /кино|kino|театр|концерт|cinema|mori|подписк|\bplus\b|игр|netflix|steam|okko|кинопоиск|развлеч/i],
  ["health", /аптек|apteka|gorzdrav|клиник|стомат|pharm|здоров|lab4u|инвитро|медси/i],
  ["shopping", /ozon|wildberries|\bwb\b|dns|днс|мвидео|lamoda|детский мир|lcwaikiki|gold apple|letu|одежд|sportmaster/i],
  ["alcohol", /krasnoe|красное.?бел|winelab|вино|пиво|beer|табак|tabak|бристоль|bristol/i],
  ["connect", /beeline|билайн|mts|мтс|megafon|мегафон|tele2|ростелеком|rostelecom|связь|интернет|t-?bundle|сервисы яндекса/i]
];

export function autoCat(desc) {
  const d = desc || "";
  for (const [id, re] of RULES) if (re.test(d)) return id;
  return "other";
}

export function isInternal(desc) {
  return /перевод на вклад|на накопит|перевод себе|пополнение брокер|между своими/i.test(desc || "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/categories.test.js`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/categories.js prototype/tests/categories.test.js
git commit -m "feat: categorization module with tests"
```

---

### Task 4: Analyzer core (aggregates, score, risks, recommendations)

**Files:**
- Create: `prototype/js/analyzer.js`
- Create: `prototype/tests/analyzer.test.js`
- Source to port from: `prototype/app.html` (inline `analyze`, `TRIM`, score factors, `flags`/`recs` data).

**Interfaces:**
- Consumes: `autoCat`, `isInternal`, `CATS` from `categories.js`.
- Produces:
  - `analyze(tx: {ts,amount,desc}[]): Analysis`
  - `Analysis = { nMonths, income, expense, incMo, expMo, net, savingsRate, discShare, cushionMonths, buffer, cats: {id,name,icon,color,sum,mo}[], potential, trimRecs: {id,name,mo,rate,save}[], score, risks: {level,icon,title,detail}[], recs: {id,title,detail,save}[] }`
  - `score` is an integer 4..97; `risks[].level ∈ {"bad","warn","good"}`.

- [ ] **Step 1: Write the failing test**

`prototype/tests/analyzer.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../js/analyzer.js";

function tx(daysAgo, amount, desc) {
  return { ts: Date.now() - daysAgo * 86400000, amount, desc };
}

test("analyze computes income/expense and excludes internal transfers", () => {
  const a = analyze([
    tx(1, 80000, "Зарплата"),
    tx(2, -20000, "Аренда ЖКХ"),
    tx(3, -55000, "Перевод на вклад") // internal → excluded from expense
  ]);
  assert.equal(a.income, 80000);
  assert.equal(a.expense, 20000);
  assert.ok(a.buffer >= 55000);
});

test("savingsRate positive when income exceeds expense", () => {
  const a = analyze([tx(1, 100000, "Зарплата"), tx(2, -60000, "Продукты Пятёрочка")]);
  assert.ok(a.savingsRate > 0.3 && a.savingsRate < 0.45);
});

test("score is within bounds and risks/recs are non-empty arrays", () => {
  const a = analyze([tx(1, 90000, "Зарплата"), tx(2, -30000, "Кафе"), tx(3, -20000, "Такси")]);
  assert.ok(a.score >= 4 && a.score <= 97);
  assert.ok(Array.isArray(a.risks) && a.risks.length > 0);
  assert.ok(Array.isArray(a.recs) && a.recs.length > 0);
  for (const r of a.recs) assert.ok(typeof r.id === "string" && r.id.length > 0);
});

test("no-income statement flags income-not-found and does not invent savingsRate", () => {
  const a = analyze([tx(1, -5000, "Пятёрочка"), tx(2, -3000, "Кафе")]);
  assert.equal(a.income, 0);
  assert.equal(a.savingsRate, 0); // guarded, not NaN/Infinity
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/analyzer.test.js`
Expected: FAIL — `Cannot find module '../js/analyzer.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/analyzer.js` — port `analyze()` from `app.html`, importing from `categories.js`, and give every recommendation a stable `id` (needed for `recDone` progress tracking in Task 8). Key requirements the tests lock in:
```js
import { CATS, autoCat, isInternal } from "./categories.js";

const TRIM = { cafe: .30, taxi: .35, fun: .40, shopping: .25, alcohol: .30, food: .12 };

export function analyze(tx) {
  tx = (tx || []).filter((t) => t && t.desc !== undefined);
  let income = 0, expense = 0, buffer = 0;
  const byCat = {}, months = {};
  for (const t of tx) {
    const mk = new Date(t.ts).getFullYear() + "-" + (new Date(t.ts).getMonth() + 1);
    if (t.amount > 0) { income += t.amount; continue; }
    const a = -t.amount;
    if (isInternal(t.desc)) { buffer += a; continue; }
    expense += a;
    const c = autoCat(t.desc);
    byCat[c] = (byCat[c] || 0) + a;
    months[mk] = (months[mk] || 0) + a;
  }
  const nMonths = Math.max(1, Object.keys(months).length);
  const incMo = income / nMonths, expMo = expense / nMonths;
  const net = incMo - expMo;
  const savingsRate = incMo > 0 ? net / incMo : 0; // guarded: 0 when no income
  let disc = 0;
  for (const c in byCat) if (!(CATS[c] && CATS[c].ess)) disc += byCat[c];
  const discShare = expense > 0 ? disc / expense : 0;
  const cushionMonths = expMo > 0 ? buffer / expMo : 0;
  const cats = Object.keys(byCat)
    .map((c) => ({ id: c, ...(CATS[c] || CATS.other), sum: byCat[c], mo: byCat[c] / nMonths }))
    .sort((a, b) => b.sum - a.sum);
  let potential = 0; const trimRecs = [];
  for (const x of cats) {
    const r = TRIM[x.id]; if (!r) continue;
    const sv = x.mo * r; if (sv < 150) continue;
    potential += sv; trimRecs.push({ id: x.id, name: x.name, mo: x.mo, rate: r, save: sv });
  }
  trimRecs.sort((a, b) => b.save - a.save);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const fSav = clamp((savingsRate + 0.05) / 0.30);
  const fCush = clamp(cushionMonths / 6);
  const fDisc = clamp(1 - (discShare - 0.15) / 0.35);
  const fBal = clamp((net / (incMo || 1)) * 2 + 0.4);
  let score = Math.round((fSav * .34 + fCush * .28 + fDisc * .22 + fBal * .16) * 100);
  score = Math.max(4, Math.min(97, score));
  const base = { nMonths, income, expense, incMo, expMo, net, savingsRate, discShare, cushionMonths, buffer, cats, potential, trimRecs, score, noIncome: income === 0 };
  return { ...base, risks: buildRisks(base), recs: buildRecs(base) };
}
```
Port `buildRisks(a)` (returns `{level,icon,title,detail}[]` — from the existing `flags()`) and `buildRecs(a)` (returns `{id,title,detail,save}[]` — from the existing `recs()`, assigning a stable `id` per recommendation, e.g. `"cushion"`, `"trim-"+catId`, `"savings-rate"`, `"recurring"`, `"potential"`). Keep the rouble formatting inside `ui.js`, not here — `buildRecs` returns raw `save` numbers and text.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/analyzer.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/analyzer.js prototype/tests/analyzer.test.js
git commit -m "feat: analyzer core (aggregates, score, risks, recs) with tests"
```

---

### Task 5: Advisor with history comparison

**Files:**
- Create: `prototype/js/advisor.js`
- Create: `prototype/tests/advisor.test.js`
- Source to port from: `prototype/app.html` (inline `initChat`/`answer` intents).

**Interfaces:**
- Consumes: `Analysis` (Task 4) and a `history: Snapshot[]` array (Task 6 shape).
- Produces:
  - `SUGGESTED: string[]` — canned starter questions.
  - `answer(question: string, analysis: Analysis, history: Snapshot[]): string` — returns HTML-safe answer text (may contain `<b>`), computed from data. When `history` has a previous snapshot, spending/score answers include a comparison sentence. Investment questions return general education + disclaimer.

- [ ] **Step 1: Write the failing test**

`prototype/tests/advisor.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { answer } from "../js/advisor.js";

const A = {
  score: 57, savingsRate: 0.2, discShare: 0.4, cushionMonths: 1.5,
  expMo: 40000, net: 15000, potential: 8000,
  expense: 120000, incMo: 55000,
  trimRecs: [{ name: "Такси", save: 2300 }, { name: "Кафе и рестораны", save: 2000 }],
  cats: [{ name: "Такси", sum: 20000 }, { name: "Кафе и рестораны", sum: 18000 }]
};

test("savings question lists trimmable categories with numbers", () => {
  const r = answer("на чём сэкономить?", A, []);
  assert.match(r, /Такси/);
  assert.match(r, /\d/);
});

test("cushion question explains the 3-6 month target", () => {
  const r = answer("хватит ли подушки?", A, []);
  assert.match(r, /3.?6|месяц/i);
});

test("investment question stays educational with a disclaimer", () => {
  const r = answer("во что инвестировать?", A, []);
  assert.match(r, /подушк|образоват|не .*рекоменд|общ/i);
});

test("score answer references previous snapshot when history present", () => {
  const history = [{ analysis: { score: 52 } }];
  const r = answer("какое у меня финансовое состояние?", A, history);
  assert.match(r, /52/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/advisor.test.js`
Expected: FAIL — `Cannot find module '../js/advisor.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/advisor.js` — port the intent matching + answer builders from `app.html`, add a `prev = history.length ? history[history.length-1].analysis : null` comparison branch in the score/spending answers, and add the disclaimer to the investment branch:
```js
const rub = (n) => Math.round(Math.abs(n)).toLocaleString("ru-RU") + " ₽";
const pct = (n) => Math.round(n * 100) + "%";

export const SUGGESTED = [
  "Какое у меня финансовое состояние?",
  "На чём мне сэкономить?",
  "Сколько я могу откладывать?",
  "Хватит ли мне подушки?",
  "Куда уходят мои деньги?",
  "Когда я накоплю 300 000 ₽?"
];

export function answer(text, a, history) {
  const d = (text || "").toLowerCase();
  const prev = history && history.length ? history[history.length - 1].analysis : null;
  if (/сэконом|сократ|урез|тратить меньше/.test(d)) return saveAnswer(a);
  if (/отклад|копл|копить|сберег|сколько.*могу/.test(d)) return putAsideAnswer(a);
  if (/подушк|резерв|запас|безопасн/.test(d)) return cushionAnswer(a);
  if (/куда.*деньг|на что трач|структур|категор/.test(d)) return whereAnswer(a);
  if (/накопл|накопить|300|цел|через сколько/.test(d)) return goalAnswer(a);
  if (/инвест|вклад|акци|облигац|бирж/.test(d)) return investAnswer(a);
  if (/долг|кредит|заём|ипотек/.test(d)) return debtAnswer();
  if (/состоян|здоров|оценк|итог|как.*дела/.test(d)) return stateAnswer(a, prev);
  return "Я отвечаю по твоему разбору. Спроси, например: на чём сэкономить, сколько откладывать, хватит ли подушки, когда накопишь на цель.";
}
// stateAnswer(a, prev): if prev, append "Твой score изменился с <b>prev.score</b> до <b>a.score</b>." etc.
// investAnswer(a): general education, MUST contain "образоват"/"общие принципы" and
//   "не даём персональных рекомендаций конкретных бумаг" + gate on cushion.
```
Implement each `*Answer` helper porting the existing wording; ensure `stateAnswer` uses `prev` when present, and `investAnswer` contains the disclaimer strings the test matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/advisor.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/advisor.js prototype/tests/advisor.test.js
git commit -m "feat: rule-based advisor with history comparison + tests"
```

---

### Task 6: Snapshot store (localStorage) + profile

**Files:**
- Create: `prototype/js/store.js`
- Create: `prototype/tests/store.test.js`

**Interfaces:**
- Consumes: nothing (but reads/writes `globalThis.localStorage`).
- Produces:
  - `Snapshot = { id:string, date:number, source:"csv"|"demo", analysis:Analysis, recDone:Record<string,boolean> }`
  - `saveSnapshot(analysis, source): Snapshot` — creates + persists, returns it.
  - `listSnapshots(): Snapshot[]` — sorted ascending by `date`.
  - `getSnapshot(id): Snapshot | null`
  - `deleteSnapshot(id): void`
  - `setRecDone(id, recId, done): void`
  - `getProfile(): {name:string, theme:string}` / `setProfile(patch): void`
  - `available(): boolean` — false when localStorage throws (private mode/quota); callers fall back to in-memory.

- [ ] **Step 1: Write the failing test**

`prototype/tests/store.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/store.test.js`
Expected: FAIL — `Cannot find module '../js/store.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/store.js`:
```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/store.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/store.js prototype/tests/store.test.js
git commit -m "feat: localStorage snapshot store + profile with tests"
```

---

### Task 7: Dynamics computation

**Files:**
- Create: `prototype/js/dynamics.js`
- Create: `prototype/tests/dynamics.test.js`

**Interfaces:**
- Consumes: `Snapshot[]` from `store.js`.
- Produces:
  - `series(history): { dates:number[], score:number[], expMo:number[], savingsRate:number[] }`
  - `latestDelta(history): { score:number, expMo:number, savingsRate:number } | null` — signed change between the last two snapshots; `null` if fewer than 2.

- [ ] **Step 1: Write the failing test**

`prototype/tests/dynamics.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { series, latestDelta } from "../js/dynamics.js";

const hist = [
  { date: 1, analysis: { score: 52, expMo: 40000, savingsRate: 0.1 } },
  { date: 2, analysis: { score: 57, expMo: 37000, savingsRate: 0.2 } }
];

test("series extracts parallel arrays", () => {
  const s = series(hist);
  assert.deepEqual(s.score, [52, 57]);
  assert.deepEqual(s.expMo, [40000, 37000]);
});

test("latestDelta is signed change between last two", () => {
  assert.equal(latestDelta(hist).score, 5);
  assert.equal(latestDelta(hist).expMo, -3000);
});

test("latestDelta null when fewer than two snapshots", () => {
  assert.equal(latestDelta([hist[0]]), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/dynamics.test.js`
Expected: FAIL — `Cannot find module '../js/dynamics.js'`.

- [ ] **Step 3: Write minimal implementation**

`prototype/js/dynamics.js`:
```js
export function series(history) {
  return {
    dates: history.map((s) => s.date),
    score: history.map((s) => s.analysis.score),
    expMo: history.map((s) => s.analysis.expMo),
    savingsRate: history.map((s) => s.analysis.savingsRate)
  };
}
export function latestDelta(history) {
  if (!history || history.length < 2) return null;
  const a = history[history.length - 2].analysis, b = history[history.length - 1].analysis;
  return { score: b.score - a.score, expMo: b.expMo - a.expMo, savingsRate: b.savingsRate - a.savingsRate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test prototype/tests/dynamics.test.js`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/dynamics.js prototype/tests/dynamics.test.js
git commit -m "feat: dynamics series + latest delta with tests"
```

---

### Task 8: Wire UI to modules — entry + разбор screen (refactor app.html)

**Files:**
- Create: `prototype/js/demo.js` (port `demoTx()` from `app.html`; `export function demoTx()`).
- Create: `prototype/js/ui.js`
- Modify: `prototype/app.html` — replace the inline `<script>…</script>` (the whole IIFE) with `<script type="module" src="js/ui.js"></script>`; keep the existing `<style>` and the `#entry`/`#result`/top-bar markup.

**Interfaces:**
- Consumes: `parseCSV`, `rowsToTx` (parser), `analyze` (analyzer), `demoTx` (demo), `answer`, `SUGGESTED` (advisor), `store`, `series`, `latestDelta` (dynamics), `CATS` (categories).
- Produces: browser behavior only (no exports consumed by other tasks).

- [ ] **Step 1: Extract the render into `ui.js`**

Move the inline rendering functions from `app.html` into `prototype/js/ui.js` (an ES module). Keep the DOM-formatting helpers (`rub`, `pct`, `esc`, gauge geometry) here. Replace the old inline `analyze`/`autoCat`/`parseCSV`/`demoTx` calls with imports:
```js
import { parseCSV, rowsToTx } from "./parser.js";
import { analyze } from "./analyzer.js";
import { demoTx } from "./demo.js";
import { answer, SUGGESTED } from "./advisor.js";
import * as store from "./store.js";
// render(analysis), initChat(analysis, history), entry wiring — ported from app.html
function run(tx, source) {
  if (!tx || !tx.length) { alert("Не удалось прочитать операции из файла."); return; }
  const analysis = analyze(tx);
  const snap = store.available() ? store.saveSnapshot(analysis, source) : { analysis, recDone: {} };
  render(analysis, store.listSnapshots());
}
```
`initChat` must call `answer(text, analysis, history)` (history from `store.listSnapshots()`), and render the `SUGGESTED` chips.

- [ ] **Step 2: Point app.html at the module**

In `prototype/app.html`, delete the entire inline `<script>(function(){…})();</script>` block and replace with:
```html
<script type="module" src="js/ui.js"></script>
```

- [ ] **Step 3: Manually verify the разбор flow in the browser**

Start the server and open the app:
- Run: use the preview tool to start server `site` and open `http://localhost:4599/prototype/app.html`.
- Click **«Посмотреть на демо-данных»**.
- Expected: entry hides; разбор renders with the health-score gauge, metrics (норма сбережений / подушка / необязательные траты / доход / расход / остаток), «Куда уходят деньги» bars, «Риски и наблюдения», «Рекомендации», and the advisor chat. No errors in `read_console_messages`.

- [ ] **Step 4: Verify advisor answers from data**

- In the chat, click **«На чём мне сэкономить?»**.
- Expected: a bot reply naming top trimmable categories with ₽ amounts (computed, not canned).
- Type a free-text question «хватит ли подушки?» and send.
- Expected: a reply about the 3–6 month target with ₽ figures. No console errors.

- [ ] **Step 5: Commit**

```bash
git add prototype/js/demo.js prototype/js/ui.js prototype/app.html
git commit -m "refactor: app.html uses modular analyzer/advisor/store"
```

---

### Task 9: Save snapshots + "Динамика" screen

**Files:**
- Modify: `prototype/app.html` — add a nav control to switch разбор ↔ «Динамика» (e.g. two buttons under the top bar or a segmented control), and an empty `<section id="dynamics" class="section hidden"></section>`.
- Modify: `prototype/js/ui.js` — add `renderDynamics()`; show it via the nav; render a small inline-SVG line/bar chart of `series()` plus the `latestDelta()` summary; when `< 2` snapshots, show the "нужен ещё один разбор" empty state.

**Interfaces:**
- Consumes: `store.listSnapshots`, `series`, `latestDelta`.
- Produces: browser behavior only.

- [ ] **Step 1: Add the Динамика renderer**

In `ui.js`:
```js
import { series, latestDelta } from "./dynamics.js";
function renderDynamics() {
  const history = store.listSnapshots();
  const box = document.querySelector("#dynamics");
  if (history.length < 2) {
    box.innerHTML = '<div class="note">Сделай ещё хотя бы один разбор в другой период — тогда покажу динамику.</div>';
    return;
  }
  const s = series(history), d = latestDelta(history);
  // render: score line (inline SVG), expMo bars, savingsRate; delta summary using d
  box.innerHTML = /* built from s and d */ "";
}
```
Render a minimal inline-SVG chart (polyline for `s.score` over `s.dates`) plus a delta summary line ("Score: 52 → 57 (+5)", "Расход/мес: −3 000 ₽", "Сбережения: +10 п.п."). Reuse existing `.metric`/`.bar` styles.

- [ ] **Step 2: Wire the nav**

In `ui.js`, add click handlers for the разбор/Динамика nav buttons that toggle `.hidden` on `#result` and `#dynamics` and call `renderDynamics()` when opening Динамика.

- [ ] **Step 3: Manually verify with two snapshots**

- Open `http://localhost:4599/prototype/app.html`, run **демо** once (creates snapshot #1), click **«↺ Загрузить другую выписку»**, run **демо** again (snapshot #2).
- Open **«Динамика»**.
- Expected: a score line/chart across two dated points and a delta summary. No console errors.

- [ ] **Step 4: Verify single-snapshot empty state**

- Open Настройки/Профиль (Task 10) or clear storage via console `localStorage.clear()`, reload, run демо once, open Динамика.
- Expected: the "нужен ещё один разбор" note, no chart, no errors.

- [ ] **Step 5: Commit**

```bash
git add prototype/app.html prototype/js/ui.js
git commit -m "feat: snapshot history + dynamics screen"
```

---

### Task 10: Profile/settings + recommendation progress

**Files:**
- Modify: `prototype/app.html` — add `<section id="profile" class="section hidden">` and a settings/profile entry (⚙ in top bar).
- Modify: `prototype/js/ui.js` — `renderProfile()` (name, theme toggle, snapshot list with open/delete/export-JSON); make each recommendation on the разбор screen a checkbox that calls `store.setRecDone` and reflects `recDone`.

**Interfaces:**
- Consumes: `store.getProfile/setProfile/listSnapshots/deleteSnapshot/getSnapshot/setRecDone`.
- Produces: browser behavior only.

- [ ] **Step 1: Recommendation checkboxes**

In `render()`, render each `rec` with a checkbox bound to the current snapshot's `recDone[rec.id]`; on toggle call `store.setRecDone(currentSnapshotId, rec.id, checked)`. Persist `currentSnapshotId` when a snapshot is created/opened.

- [ ] **Step 2: Profile screen**

`renderProfile()` shows: editable name (`store.setProfile({name})`), theme buttons (light/dark, writing `fin-proto-theme` as today), and the snapshot list — each row: date + score, buttons **Открыть** (loads that snapshot into разбор), **Удалить** (`store.deleteSnapshot`), and one **Экспорт (JSON)** that downloads all snapshots as a Blob.

- [ ] **Step 3: Manually verify**

- Open the app, run демо, open **Профиль**: see the snapshot listed with its date and score.
- Toggle a recommendation checkbox on the разбор screen, reload, reopen the same snapshot — the checkbox state persists.
- Click **Экспорт (JSON)** — a `.json` file downloads. Click **Удалить** — snapshot disappears from the list.
- Expected: no console errors.

- [ ] **Step 4: Commit**

```bash
git add prototype/app.html prototype/js/ui.js
git commit -m "feat: profile/settings, snapshot management, rec progress"
```

---

### Task 11: Edge-case handling in UI

**Files:**
- Modify: `prototype/js/ui.js`

**Interfaces:**
- Consumes: `analyze` result flags (`noIncome`, `nMonths`), `store.available()`.
- Produces: browser behavior only.

- [ ] **Step 1: Bad CSV + no-income + thin-data + no-storage messaging**

In `ui.js`:
- If `parseCSV` returns `null` or `rowsToTx` yields `[]` → show an inline error under the drop zone: "Не удалось прочитать выписку. Нужны колонки: дата · сумма · описание. Попробуй демо." (not `alert`).
- After `analyze`, if `analysis.noIncome` → render the «остаётся/мес» and «норма сбережений» metrics as "—" with a note "Доход в выписке не найден".
- If `analysis.nMonths < 1.0` worth of data (single short period) → show a banner "Разбор ориентировочный: мало данных."
- On load, if `!store.available()` → show a one-time note "История не сохранится: браузер блокирует локальное хранилище."

- [ ] **Step 2: Manually verify each edge case**

- Upload a nonsense `.txt` (e.g. "hello") → inline error appears, no crash.
- Build a tiny CSV with only negative rows (no income) → разбор shows "—" for savings metrics + the note.
- Expected: no console errors in any case; the app never white-screens.

- [ ] **Step 3: Commit**

```bash
git add prototype/js/ui.js
git commit -m "feat: graceful handling of bad CSV, no-income, thin data, no storage"
```

---

### Task 12: Full regression pass + README note

**Files:**
- Modify: `prototype/README.md` (create if missing) — short "how to run + how to test" note.

**Interfaces:**
- Consumes: everything.
- Produces: docs only.

- [ ] **Step 1: Run the whole test suite**

Run: `node --test prototype/tests/`
Expected: PASS — all suites green (parser, categories, analyzer, advisor, store, dynamics, smoke).

- [ ] **Step 2: Manual end-to-end in browser (both themes, mobile)**

- Entry → демо → разбор (gauge, metrics, bars, risks, recs, chat) → Динамика (after 2nd разбор) → Профиль → export/delete.
- Toggle light/dark; resize to mobile — no overflow, chat usable.
- Expected: no console errors at any step.

- [ ] **Step 3: Write the README note**

`prototype/README.md`:
```markdown
# Баланс — веб-прототип (фин-консультация)

- `index.html` — лендинг, `app.html` — приложение (разбор + советник).
- Логика в `js/` (модули ES): `parser`, `categories`, `analyzer`, `advisor`,
  `store`, `dynamics`, `demo`, `ui`. Чистые модули не трогают DOM/localStorage.
- Запуск: статический сервер, открыть `app.html`.
- Тесты ядра: `node --test prototype/tests/`
```

- [ ] **Step 4: Commit**

```bash
git add prototype/README.md
git commit -m "docs: prototype run/test notes"
```

---

## Self-Review

**1. Spec coverage:**
- §3 screens (вход/разбор/динамика/советник/профиль) → Tasks 8, 9, 10.
- §5 storage (snapshots, profile, export/delete) → Tasks 6, 10.
- §6 analyzer core (categorize+internal, aggregates, score, risks, recs) → Tasks 3, 4.
- §7 advisor (intents, history comparison, investment disclaimer) → Task 5.
- §8 module boundaries (analyzer/advisor/store/ui pure vs DOM) → Tasks 2–8 (pure modules + ui.js split).
- §9 edge cases (bad CSV, thin data, no income, single snapshot, no storage) → Tasks 9 (single-snapshot), 11 (rest).
- §10 testing (node unit tests for core + parser; manual browser) → Tasks 2–7 unit tests, 8–12 manual.
- §11 monetization → intentionally NOT in this plan (simulated Free/Premium is a later task; MVP is the analysis+advisor+history experience). Noted as out-of-scope for this plan.
- Dynamics computation → Task 7. Demo data → Task 8 (demo.js).

**2. Placeholder scan:** No "TBD/TODO". Port-from-source instructions (Tasks 2–5, 8) name the exact existing file and functions to move; test code and new/tricky logic are shown in full. Rouble formatting deliberately lives in `ui.js`, not the pure modules.

**3. Type consistency:** `Analysis` fields (`score`, `expMo`, `savingsRate`, `discShare`, `cushionMonths`, `trimRecs[].save`, `recs[].id`, `noIncome`) are defined in Task 4 and consumed identically in Tasks 5 (advisor), 7 (dynamics), 8–11 (ui). `Snapshot` shape (`id/date/source/analysis/recDone`) defined in Task 6 and used consistently in 7/9/10. `answer(text, analysis, history)` signature matches between Task 5 and its Task 8 call site.
