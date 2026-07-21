// DOM/render layer (Task 8). The only module allowed to touch document/window/localStorage.
// Ported from app.html's inline IIFE; logic now lives in the pure modules below.

import { parseCSV, rowsToTx } from "./parser.js";
import { analyze } from "./analyzer.js";
import { demoTx } from "./demo.js";
import { answer, SUGGESTED } from "./advisor.js";
import { series, latestDelta } from "./dynamics.js";
import * as store from "./store.js";

const $ = (s, r) => (r || document).querySelector(s);
const R = document.documentElement;

/* theme */
const TK = "fin-proto-theme";
(function () {
  let s = null;
  try { s = localStorage.getItem(TK); } catch (e) {}
  if (!s) s = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  R.setAttribute("data-theme", s);
})();
$("#themeBtn").onclick = function () {
  const c = R.getAttribute("data-theme") === "light" ? "light" : "dark", n = c === "light" ? "dark" : "light";
  R.setAttribute("data-theme", n);
  try { localStorage.setItem(TK, n); } catch (e) {}
};

/* ---------- formatting ---------- */
function rub(n) { return Math.round(Math.abs(n)).toLocaleString("ru-RU") + " ₽"; }
function pct(n) { return Math.round(n * 100) + "%"; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }

/* ---------- gauge geometry ---------- */
function polar(cx, cy, r, deg) { const a = deg * Math.PI / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
function describeArc(cx, cy, r, a0, a1) {
  const s = polar(cx, cy, r, a0), e = polar(cx, cy, r, a1);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return "M " + s.x.toFixed(2) + " " + s.y.toFixed(2) + " A " + r + " " + r + " 0 " + large + " 1 " + e.x.toFixed(2) + " " + e.y.toFixed(2);
}

function metric(l, v, cls, h) {
  return '<div class="metric"><div class="metric__l">' + l + '</div><div class="metric__v ' + (cls || "") + '">' + v + '</div><div class="metric__h">' + h + '</div></div>';
}

function flagsHtml(a) {
  return a.risks.map((f) =>
    '<div class="flag flag--' + f.level + '"><div class="flag__ic">' + f.icon + '</div><div><div class="flag__t">' + f.title + '</div><div class="flag__d">' + f.detail + '</div></div></div>'
  ).join("");
}

function recsHtml(a) {
  return a.recs.map((r, i) =>
    '<div class="rec"><div class="rec__n">' + (i + 1) + '</div><div><div class="rec__t">' + r.title + '</div><div class="rec__d">' + r.detail + '</div>'
    + (r.save > 0 ? '<div class="rec__save">−' + rub(r.save) + '/мес</div>' : "")
    + '</div></div>'
  ).join("");
}

/* ---------- dynamics ---------- */
function scoreChart(s) {
  const w = 600, h = 160, pad = 22;
  const scores = s.score;
  const n = scores.length;
  const min = Math.min.apply(null, scores), max = Math.max.apply(null, scores);
  const range = max - min;
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const pts = scores.map((v, i) => {
    const x = pad + i * stepX;
    const y = range === 0 ? h / 2 : pad + (h - pad * 2) * (1 - (v - min) / range);
    return { x, y };
  });
  const polyline = pts.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  const dots = pts.map((p) => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="var(--amber)"/>').join("");
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="dyn-svg">'
    + '<polyline points="' + polyline + '" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + dots
    + '<text x="' + pad + '" y="14" class="dyn-lbl">макс ' + max + '</text>'
    + '<text x="' + pad + '" y="' + (h - 8) + '" class="dyn-lbl">мин ' + min + '</text>'
    + '</svg>';
}

function renderDynamics() {
  const history = store.listSnapshots();
  const box = $("#dynamics");
  if (history.length < 2) {
    box.innerHTML = '<div class="eyebrow">Динамика</div>'
      + '<h1 class="h-title">Как меняется финансовое здоровье</h1>'
      + '<div class="note">Сделай ещё хотя бы один разбор в другой период — тогда покажу динамику.</div>';
    return;
  }
  const s = series(history), d = latestDelta(history);
  const prevScore = s.score[s.score.length - 2], lastScore = s.score[s.score.length - 1];
  const scoreDeltaTxt = (d.score >= 0 ? "+" : "−") + Math.abs(d.score);
  const expDeltaTxt = (d.expMo >= 0 ? "+" : "−") + rub(d.expMo);
  const srDeltaTxt = (d.savingsRate >= 0 ? "+" : "−") + Math.round(Math.abs(d.savingsRate) * 100) + " п.п.";

  let h = "";
  h += '<div class="eyebrow">Твоя динамика · ' + s.dates.length + ' разбор' + (s.dates.length === 2 ? "а" : "ов") + '</div>';
  h += '<h1 class="h-title">Как меняется финансовое здоровье</h1>';
  h += '<div class="blk-h">Score по разборам</div>';
  h += '<div class="dyn-chart">' + scoreChart(s) + '</div>';
  h += '<div class="dyn-dates">' + s.dates.map((dt) => "<span>" + fmtDate(dt) + "</span>").join("") + '</div>';
  h += '<div class="blk-h">С прошлого разбора</div>';
  h += '<div class="mgrid">'
    + metric("Score", lastScore + " (" + scoreDeltaTxt + ")", d.score >= 0 ? "good" : "bad", "было " + prevScore)
    + metric("Расход / мес", expDeltaTxt, d.expMo <= 0 ? "good" : "bad", "изменение")
    + metric("Норма сбережений", srDeltaTxt, d.savingsRate >= 0 ? "good" : "bad", "изменение")
    + '</div>';
  box.innerHTML = h;
}

function render(a, history) {
  const verdict = a.score >= 75 ? "Крепкое" : a.score >= 55 ? "Устойчивое" : a.score >= 38 ? "Уязвимое" : "В зоне риска";
  const vsub = a.score >= 75 ? "Хороший запас и контроль над тратами." : a.score >= 55 ? "В целом порядок, есть что усилить." : a.score >= 38 ? "Есть заметные слабые места — см. рекомендации." : "Деньги под контролем слабо — начни с рекомендаций ниже.";
  const col = a.score >= 75 ? "var(--trail)" : a.score >= 55 ? "var(--amber)" : "var(--rust)";
  const deg = a.score / 100 * 180, r = 70, cx = 90, cy = 90;
  const arc = describeArc(cx, cy, r, 180, 180 + deg);
  const bg = describeArc(cx, cy, r, 180, 360);

  let h = "";
  h += '<div class="eyebrow">Твой разбор · ' + a.nMonths + ' мес · ' + rub(a.expense) + ' трат</div>';
  h += '<h1 class="h-title">Финансовое здоровье</h1>';

  // score gauge
  h += '<div class="score-card">'
    + '<div class="gauge"><svg viewBox="0 0 180 100">'
    + '<path d="' + bg + '" fill="none" stroke="rgba(30,34,38,.14)" stroke-width="13" stroke-linecap="round"/>'
    + '<path d="' + arc + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round"/>'
    + '</svg><div class="gauge__v" style="color:' + col + '">' + a.score + '<span class="gauge__max">/100</span></div></div>'
    + '<div class="score-verdict">' + verdict + ' положение</div>'
    + '<div class="score-sub">' + vsub + '</div></div>';

  // metrics
  const srCls = a.savingsRate >= 0.2 ? "good" : a.savingsRate >= 0 ? "warn" : "bad";
  const cuCls = a.cushionMonths >= 3 ? "good" : a.cushionMonths >= 1 ? "warn" : "bad";
  const dsCls = a.discShare <= 0.2 ? "good" : a.discShare <= 0.35 ? "warn" : "bad";
  h += '<div class="mgrid">'
    + metric("Норма сбережений", pct(a.savingsRate), srCls, "откладываешь от дохода")
    + metric("Подушка", (a.cushionMonths < 0.1 ? "—" : a.cushionMonths.toFixed(1)) + " мес", cuCls, "хватит прожить")
    + metric("Необязательные траты", pct(a.discShare), dsCls, "кафе, такси, шопинг…")
    + '</div>';
  h += '<div class="mgrid" style="margin-top:12px">'
    + metric("Доход / мес", rub(a.incMo), "", "в среднем")
    + metric("Расход / мес", rub(a.expMo), "", "в среднем")
    + metric("Остаётся / мес", (a.net >= 0 ? "+" : "−") + rub(a.net), a.net >= 0 ? "good" : "bad", "доход минус расход")
    + '</div>';

  // where money goes
  h += '<div class="blk-h">Куда уходят деньги</div>';
  const mx = a.cats.length ? a.cats[0].sum : 1;
  a.cats.slice(0, 7).forEach((x) => {
    const w = x.sum / mx * 100;
    h += '<div class="bar"><div class="bar__top"><span>' + x.icon + ' ' + x.name + '</span><span class="bar__v">' + rub(x.sum) + ' · ' + pct(x.sum / a.expense) + '</span></div>'
      + '<div class="bar__track"><div class="bar__fill" style="width:' + w.toFixed(1) + '%;background:' + x.color + '"></div></div></div>';
  });

  // risks / observations
  h += '<div class="blk-h">Риски и наблюдения</div>';
  h += flagsHtml(a);

  // recommendations
  h += '<div class="blk-h">Рекомендации</div>';
  h += recsHtml(a);

  // advisor
  h += '<div class="blk-h">💬 Финансовый советник</div>';
  h += '<div class="chat"><div class="chat__log" id="chatLog"></div>'
    + '<div class="chips" id="chatChips"></div>'
    + '<div class="chat__in"><input id="chatInput" placeholder="Спроси про свои финансы…" autocomplete="off"><button class="chat__send" id="chatSend">➤</button></div>'
    + '<div class="chat__note">Прототип: советник отвечает на основе твоего разбора, без внешних сервисов. В продукте здесь — полноценный AI на базе реальной модели.</div></div>';

  h += '<button class="cta-again" id="again">↺ Загрузить другую выписку</button>';

  $("#result").innerHTML = h;
  $("#result").classList.remove("hidden");
  $("#dynamics").classList.add("hidden");
  $("#entry").classList.add("hidden");
  $("#resultNav").classList.remove("hidden");
  $("#navResult").classList.add("active");
  $("#navDynamics").classList.remove("active");
  window.scrollTo(0, 0);
  initChat(a, history);
  $("#again").onclick = function () {
    $("#result").classList.add("hidden");
    $("#dynamics").classList.add("hidden");
    $("#resultNav").classList.add("hidden");
    $("#entry").classList.remove("hidden");
    window.scrollTo(0, 0);
  };
}

/* ---------- advisor chat ---------- */
function initChat(a, history) {
  const log = $("#chatLog"), chips = $("#chatChips"), input = $("#chatInput"), send = $("#chatSend");
  function add(text, who) {
    const m = document.createElement("div");
    m.className = "msg " + who;
    m.innerHTML = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }
  add("Привет! Я посмотрел твой разбор. Спроси что угодно про свои финансы — отвечу по цифрам. Вот с чего можно начать:", "bot");
  SUGGESTED.forEach((q) => {
    const c = document.createElement("button");
    c.className = "chip";
    c.textContent = q;
    c.onclick = function () { ask(q); };
    chips.appendChild(c);
  });
  function ask(text) {
    add(esc(text), "me");
    setTimeout(() => { add(answer(text, a, history), "bot"); }, 250);
  }
  send.onclick = function () {
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    ask(v);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send.onclick(); });
}

/* ---------- entry wiring ---------- */
function run(tx, source) {
  if (!tx || !tx.length) { alert("Не удалось прочитать операции из файла."); return; }
  const analysis = analyze(tx);
  if (store.available()) store.saveSnapshot(analysis, source);
  render(analysis, store.listSnapshots());
}

$("#navResult").onclick = function () {
  $("#navResult").classList.add("active");
  $("#navDynamics").classList.remove("active");
  $("#result").classList.remove("hidden");
  $("#dynamics").classList.add("hidden");
  window.scrollTo(0, 0);
};
$("#navDynamics").onclick = function () {
  $("#navDynamics").classList.add("active");
  $("#navResult").classList.remove("active");
  renderDynamics();
  $("#result").classList.add("hidden");
  $("#dynamics").classList.remove("hidden");
  window.scrollTo(0, 0);
};

$("#useDemo").onclick = function () { run(demoTx(), "demo"); };
$("#pickFile").onclick = function () { $("#csvFile").click(); };
$("#csvFile").onchange = function () {
  const f = this.files && this.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = function () {
    const rows = parseCSV(rd.result);
    if (!rows) { alert("Не похоже на CSV."); return; }
    run(rowsToTx(rows), f.name || "csv");
  };
  rd.readAsText(f, "utf-8");
};
const drop = $("#drop");
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = function () {
    const rows = parseCSV(rd.result);
    if (rows) run(rowsToTx(rows), f.name || "csv");
  };
  rd.readAsText(f, "utf-8");
});
drop.addEventListener("click", () => $("#csvFile").click());
