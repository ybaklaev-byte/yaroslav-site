// DOM/render layer (Task 8). The only module allowed to touch document/window/localStorage.
// Ported from app.html's inline IIFE; logic now lives in the pure modules below.

import { parseCSV, rowsToTx } from "./parser.js";
import { analyze } from "./analyzer.js";
import { demoTx } from "./demo.js";
import { answer, SUGGESTED } from "./advisor.js";
import { series, latestDelta } from "./dynamics.js";
import * as store from "./store.js";
import { apiRegister, apiLogin, apiLogout, apiMe } from "./api.js";

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const R = document.documentElement;

/* current snapshot open in разбор, and screen shown before profile/auth (for back-navigation) */
let currentSnapshotId = null;
let previousScreen = "entry";
/* {id,email,name} of the signed-in user, or null in guest mode */
let currentUser = null;

/* theme */
function setTheme(t) {
  R.setAttribute("data-theme", t);
  store.setProfile({ theme: t });
}
(function () {
  R.setAttribute("data-theme", store.getProfile().theme);
})();
$("#themeBtn").onclick = function () {
  const c = R.getAttribute("data-theme") === "light" ? "light" : "dark";
  setTheme(c === "light" ? "dark" : "light");
};

/* ---------- account header (login button / signed-in label) ---------- */
const acctLabel = document.createElement("span");
acctLabel.id = "acctLabel";
acctLabel.className = "hidden";
acctLabel.style.cssText = "font-size:12px;color:var(--muted);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
const loginBtn = document.createElement("button");
loginBtn.type = "button";
loginBtn.id = "loginBtn";
loginBtn.className = "snap-btn";
loginBtn.textContent = "Войти";
$("#settingsBtn").insertAdjacentElement("beforebegin", loginBtn);
loginBtn.insertAdjacentElement("beforebegin", acctLabel);
loginBtn.onclick = function () {
  previousScreen = visibleScreenName();
  renderAuth();
  showScreen("auth");
};

function updateHeaderAccount() {
  if (store.getMode() === "api" && currentUser) {
    loginBtn.classList.add("hidden");
    acctLabel.classList.remove("hidden");
    acctLabel.textContent = currentUser.name || currentUser.email;
    acctLabel.title = currentUser.email;
  } else {
    loginBtn.classList.remove("hidden");
    acctLabel.classList.add("hidden");
    acctLabel.textContent = "";
    acctLabel.title = "";
  }
}

/* ---------- auth screen (dynamically inserted; see app.html for other sections) ---------- */
const authSection = document.createElement("section");
authSection.className = "section hidden";
authSection.id = "auth";
$("#profile").insertAdjacentElement("afterend", authSection);

function mapAuthError(e) {
  if (e && e.code === 401) return "Неверный email или пароль";
  if (e && e.code === 409) return "Такой email уже зарегистрирован";
  if (e && e.code === 400) return "Проверь email и пароль (мин. 6 символов)";
  return "Не удалось подключиться. Попробуй ещё раз.";
}

function renderAuth() {
  let h = "";
  h += '<div class="eyebrow">Аккаунт</div>';
  h += '<h1 class="h-title">Войти или создать аккаунт</h1>';
  h += '<div class="prof-field"><input type="email" id="authEmail" class="prof-input" placeholder="Email" autocomplete="email"></div>';
  h += '<div class="prof-field" style="margin-top:10px"><input type="password" id="authPassword" class="prof-input" placeholder="Пароль" autocomplete="current-password"></div>';
  h += '<div class="btn-line">'
    + '<button class="btn btn--pri" id="authLoginBtn">Войти</button>'
    + '<button class="btn" id="authRegisterBtn">Создать аккаунт</button>'
    + '</div>';
  h += '<div class="note" id="authError" style="color:var(--rust);min-height:14px"></div>';
  h += '<button class="cta-again" id="authBackBtn">← Назад без аккаунта</button>';
  authSection.innerHTML = h;

  $("#authLoginBtn").onclick = function () { submitAuth("login"); };
  $("#authRegisterBtn").onclick = function () { submitAuth("register"); };
  $("#authBackBtn").onclick = function () { showScreen(previousScreen); };
}

async function submitAuth(kind) {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const errEl = $("#authError");
  errEl.textContent = "";
  let res;
  try {
    res = kind === "login" ? await apiLogin(email, password) : await apiRegister(email, password);
  } catch (e) {
    errEl.textContent = mapAuthError(e);
    return;
  }
  currentUser = res.user;
  store.setMode("api");
  const localCount = store.listSnapshots().length;
  let mergedCount = null;
  let declinedMerge = false;
  try {
    if (localCount > 0) {
      if (confirm("Перенести " + localCount + " локальных разборов в аккаунт?")) {
        mergedCount = await store.mergeLocalToServer();
      } else {
        declinedMerge = true;
      }
    }
    // При отказе от переноса локальные разборы не затираем серверным списком
    await store.syncFromServer(declinedMerge ? { preserveLocal: true } : undefined);
  } catch (e) {
    // best-effort: login already succeeded, keep going on local cache
  }
  updateHeaderAccount();
  goToScreen(previousScreen);
  if (mergedCount !== null) showToast("Перенесено " + mergedCount);
}

/* ---------- toast (transient, e.g. merge success / session expired) ---------- */
let toastTimer = null;
function showToast(text) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ---------- offline note: prepended to whichever screen is currently visible ---------- */
function activeScreenEl() {
  return ["result", "dynamics", "profile", "auth", "entry"].map((id) => $("#" + id)).find((el) => el && !el.classList.contains("hidden")) || $("#result");
}
function showOfflineNote() {
  const el = activeScreenEl();
  if (!el) return;
  let note = el.querySelector(".offline-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "note offline-note";
    note.style.color = "var(--amber)";
    el.insertAdjacentElement("afterbegin", note);
  }
  note.textContent = "Офлайн: изменения сохранены локально, синхронизируются позже";
}

/* ---------- session expiry: any 401 from an api-mode call while logged in ---------- */
function sessionExpired() {
  if (store.getMode() !== "api") return;
  store.setMode("local");
  currentUser = null;
  updateHeaderAccount();
  showToast("Сессия истекла — работаешь локально");
}

/* ---------- which screen is currently shown / go to a screen with fresh content ---------- */
function visibleScreenName() {
  if (!$("#dynamics").classList.contains("hidden")) return "dynamics";
  if (!$("#result").classList.contains("hidden")) return "result";
  if (!$("#profile").classList.contains("hidden")) return "profile";
  return "entry";
}
function goToScreen(name) {
  if (name === "dynamics") { renderDynamics(); showScreen("dynamics"); return; }
  if (name === "profile") { renderProfile(); showScreen("profile"); return; }
  if (name === "result" && currentSnapshotId && store.getSnapshot(currentSnapshotId)) {
    render(store.getSnapshot(currentSnapshotId).analysis, store.listSnapshots());
    return;
  }
  showScreen("entry");
}

/* ---------- inline parse-error message (Task 11) ---------- */
const parseErrorEl = document.createElement("div");
parseErrorEl.id = "parseError";
parseErrorEl.className = "note hidden";
parseErrorEl.style.color = "var(--rust)";
$("#drop").insertAdjacentElement("afterend", parseErrorEl);
function showParseError(show) {
  parseErrorEl.textContent = show
    ? "Не удалось прочитать выписку. Нужны колонки: дата · сумма · описание. Попробуй демо."
    : "";
  parseErrorEl.classList.toggle("hidden", !show);
}

/* ---------- no-storage notice (Task 11), shown once on load ---------- */
if (!store.available()) {
  const noStoreEl = document.createElement("div");
  noStoreEl.className = "note";
  noStoreEl.textContent = "История не сохранится: браузер блокирует локальное хранилище.";
  $("#entry").appendChild(noStoreEl);
}

/* ---------- thin-data heuristic (Task 11): true when the statement's
   date span covers under ~a month, so per-month figures are unreliable ---------- */
function computeThinData(tx) {
  if (!tx || tx.length < 2) return true;
  const times = tx.map((t) => t.ts).filter((t) => typeof t === "number" && !isNaN(t));
  if (times.length < 2) return false;
  const span = Math.max.apply(null, times) - Math.min.apply(null, times);
  return span < 27 * 24 * 60 * 60 * 1000;
}

/* ---------- screen switching ---------- */
function showScreen(name) {
  $("#entry").classList.toggle("hidden", name !== "entry");
  $("#result").classList.toggle("hidden", name !== "result");
  $("#dynamics").classList.toggle("hidden", name !== "dynamics");
  $("#profile").classList.toggle("hidden", name !== "profile");
  $("#auth").classList.toggle("hidden", name !== "auth");
  $("#resultNav").classList.toggle("hidden", name !== "result" && name !== "dynamics");
  if (name === "result") { $("#navResult").classList.add("active"); $("#navDynamics").classList.remove("active"); }
  if (name === "dynamics") { $("#navDynamics").classList.add("active"); $("#navResult").classList.remove("active"); }
  window.scrollTo(0, 0);
}

/* ---------- formatting ---------- */
function rub(n) { return Math.round(Math.abs(n)).toLocaleString("ru-RU") + " ₽"; }
function pct(n) { return Math.round(n * 100) + "%"; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
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
  const snap = currentSnapshotId ? store.getSnapshot(currentSnapshotId) : null;
  const recDone = (snap && snap.recDone) || {};
  return a.recs.map((r, i) => {
    const done = !!recDone[r.id];
    const cbAttrs = 'type="checkbox" class="rec__cb" data-recid="' + esc(r.id) + '"' + (done ? " checked" : "") + (currentSnapshotId ? "" : " disabled");
    return '<div class="rec' + (done ? " rec--done" : "") + '"><input ' + cbAttrs + '><div class="rec__n">' + (i + 1) + '</div><div><div class="rec__t">' + r.title + '</div><div class="rec__d">' + r.detail + '</div>'
      + (r.save > 0 ? '<div class="rec__save">−' + rub(r.save) + '/мес</div>' : "")
      + '</div></div>';
  }).join("");
}

function wireRecCheckboxes() {
  $$("#result .rec__cb").forEach((cb) => {
    cb.onchange = async function () {
      if (!currentSnapshotId) return;
      const recId = this.dataset.recid, done = this.checked;
      this.closest(".rec").classList.toggle("rec--done", done);
      try {
        const res = await store.pushRecDone(currentSnapshotId, recId, done);
        if (res && res.offline) showOfflineNote();
      } catch (e) {
        store.setRecDone(currentSnapshotId, recId, done);
        sessionExpired();
      }
    };
  });
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
  const printDate = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  h += '<div id="print-header"><div class="ph-title">💰 Баланс · Финансовый разбор</div><div class="ph-meta">' + printDate + ' · разбор за ' + a.nMonths + ' мес</div></div>';
  h += '<div class="eyebrow">Твой разбор · ' + a.nMonths + ' мес · ' + rub(a.expense) + ' трат</div>';
  h += '<div class="result-head"><h1 class="h-title" style="margin-bottom:0">Финансовое здоровье</h1>'
    + '<button class="pdf-btn" id="pdfBtn" title="Сохранить разбор в PDF">⤓ Скачать PDF</button></div>';
  if (a.thinData) {
    h += '<div class="note" style="text-align:left;color:var(--rust);margin:-6px 0 16px">Разбор ориентировочный: мало данных.</div>';
  }

  // score gauge
  h += '<div class="score-card">'
    + '<div class="gauge"><svg viewBox="0 0 180 100">'
    + '<path d="' + bg + '" fill="none" stroke="rgba(30,34,38,.14)" stroke-width="13" stroke-linecap="round"/>'
    + '<path d="' + arc + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round"/>'
    + '</svg><div class="gauge__v" style="color:' + col + '">' + a.score + '<span class="gauge__max">/100</span></div></div>'
    + '<div class="score-verdict">' + verdict + ' положение</div>'
    + '<div class="score-sub">' + vsub + '</div></div>';

  // metrics
  const srCls = a.noIncome ? "" : a.savingsRate >= 0.2 ? "good" : a.savingsRate >= 0 ? "warn" : "bad";
  const cuCls = a.cushionMonths >= 3 ? "good" : a.cushionMonths >= 1 ? "warn" : "bad";
  const dsCls = a.discShare <= 0.2 ? "good" : a.discShare <= 0.35 ? "warn" : "bad";
  h += '<div class="mgrid">'
    + metric("Норма сбережений", a.noIncome ? "—" : pct(a.savingsRate), srCls, "откладываешь от дохода")
    + metric("Подушка", (a.cushionMonths < 0.1 ? "—" : a.cushionMonths.toFixed(1)) + " мес", cuCls, "хватит прожить")
    + metric("Необязательные траты", pct(a.discShare), dsCls, "кафе, такси, шопинг…")
    + '</div>';
  h += '<div class="mgrid" style="margin-top:12px">'
    + metric("Доход / мес", rub(a.incMo), "", "в среднем")
    + metric("Расход / мес", rub(a.expMo), "", "в среднем")
    + metric("Остаётся / мес", a.noIncome ? "—" : (a.net >= 0 ? "+" : "−") + rub(a.net), a.noIncome ? "" : a.net >= 0 ? "good" : "bad", "доход минус расход")
    + '</div>';
  if (a.noIncome) {
    h += '<div class="note">Доход в выписке не найден — часть показателей недоступна.</div>';
  }

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

  // advisor (скрывается при печати в PDF)
  h += '<div id="advisorBlock"><div class="blk-h">💬 Финансовый советник</div>';
  h += '<div class="chat"><div class="chat__log" id="chatLog"></div>'
    + '<div class="chips" id="chatChips"></div>'
    + '<div class="chat__in"><input id="chatInput" placeholder="Спроси про свои финансы…" autocomplete="off"><button class="chat__send" id="chatSend">➤</button></div>'
    + '<div class="chat__note">Прототип: советник отвечает на основе твоего разбора, без внешних сервисов. В продукте здесь — полноценный AI на базе реальной модели.</div></div></div>';

  h += '<button class="cta-again" id="again">↺ Загрузить другую выписку</button>';

  $("#result").innerHTML = h;
  showScreen("result");
  wireRecCheckboxes();
  initChat(a, history);
  $("#again").onclick = function () {
    showScreen("entry");
  };
  $("#pdfBtn").onclick = function () {
    window.print();
  };
}

/* ---------- profile / settings ---------- */
function openSnapshot(id) {
  const snap = store.getSnapshot(id);
  if (!snap) return;
  currentSnapshotId = id;
  render(snap.analysis, store.listSnapshots());
}

function exportSnapshots() {
  const data = store.listSnapshots();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "balance-snapshots.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderProfile() {
  const profile = store.getProfile();
  const theme = R.getAttribute("data-theme") === "light" ? "light" : "dark";
  const snaps = store.listSnapshots().slice().reverse();

  let h = "";
  h += '<div class="eyebrow">Профиль</div>';
  h += '<h1 class="h-title">Настройки</h1>';

  if (store.getMode() === "api" && currentUser) {
    h += '<div class="blk-h">Аккаунт</div>';
    h += '<div class="note" style="text-align:left;margin-bottom:10px">Аккаунт: ' + esc(currentUser.email) + '</div>';
    h += '<button class="btn" id="logoutBtn" style="width:100%">Выйти</button>';
  }

  h += '<div class="blk-h">Имя</div>';
  h += '<div class="prof-field"><input type="text" id="profName" class="prof-input" placeholder="Как к тебе обращаться" value="' + escAttr(profile.name || "") + '"></div>';

  h += '<div class="blk-h">Тема</div>';
  h += '<div class="btn-line">'
    + '<button class="btn' + (theme === "light" ? " btn--pri" : "") + '" id="themeLight">Светлая</button>'
    + '<button class="btn' + (theme === "dark" ? " btn--pri" : "") + '" id="themeDark">Тёмная</button>'
    + '</div>';

  h += '<div class="blk-h">Мои разборы</div>';
  if (!snaps.length) {
    h += '<div class="note">Пока нет сохранённых разборов.</div>';
  } else {
    h += '<div class="snap-list">' + snaps.map((s) =>
      '<div class="snap-row"><div><div class="snap-row__d">' + fmtDate(s.date) + '</div><div class="snap-row__s">Score ' + s.analysis.score + '</div></div>'
      + '<div class="snap-row__btns"><button class="snap-btn" data-open="' + esc(s.id) + '">Открыть</button><button class="snap-btn snap-btn--danger" data-del="' + esc(s.id) + '">Удалить</button></div></div>'
    ).join("") + '</div>';
    h += '<button class="btn" id="profExport" style="margin-top:14px;width:100%">Экспорт (JSON)</button>';
  }

  h += '<button class="cta-again" id="profBack">← Назад</button>';

  $("#profile").innerHTML = h;

  $("#profName").oninput = async function () {
    const name = this.value;
    try {
      const res = await store.pushName(name);
      if (res && res.offline) showOfflineNote();
    } catch (e) {
      store.setProfile({ name });
      sessionExpired();
    }
    updateHeaderAccount();
  };
  $("#themeLight").onclick = function () { setTheme("light"); renderProfile(); };
  $("#themeDark").onclick = function () { setTheme("dark"); renderProfile(); };
  $$("#profile [data-open]").forEach((btn) => { btn.onclick = function () { openSnapshot(this.dataset.open); }; });
  $$("#profile [data-del]").forEach((btn) => {
    btn.onclick = async function () {
      const id = this.dataset.del;
      try {
        const res = await store.removeSnapshot(id);
        renderProfile();
        if (res && res.offline) showOfflineNote();
      } catch (e) {
        store.deleteSnapshot(id);
        renderProfile();
        sessionExpired();
      }
    };
  });
  const exportBtn = $("#profExport");
  if (exportBtn) exportBtn.onclick = exportSnapshots;
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = async function () {
      await apiLogout();
      store.setMode("local");
      currentUser = null;
      updateHeaderAccount();
      renderProfile();
    };
  }
  $("#profBack").onclick = function () {
    if (previousScreen === "dynamics") renderDynamics();
    showScreen(previousScreen);
  };
}

/* ---------- advisor chat ---------- */
function priorHistory() {
  const all = store.listSnapshots();
  const i = all.findIndex((s) => s.id === currentSnapshotId);
  return i > 0 ? all.slice(0, i) : [];
}

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
    setTimeout(() => { add(answer(text, a, priorHistory()), "bot"); }, 250);
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
async function run(tx, source) {
  if (!tx || !tx.length) { showParseError(true); return; }
  showParseError(false);
  const analysis = analyze(tx);
  analysis.thinData = computeThinData(tx);
  let offline = false;
  if (store.available()) {
    const snap = store.saveSnapshot(analysis, source);
    currentSnapshotId = snap.id;
    if (store.getMode() === "api") {
      try {
        const res = await store.pushSnapshot(snap);
        offline = !!(res && res.offline);
      } catch (e) {
        sessionExpired();
      }
    }
  } else {
    currentSnapshotId = null;
  }
  render(analysis, store.listSnapshots());
  if (offline) showOfflineNote();
}

$("#navResult").onclick = function () {
  showScreen("result");
};
$("#navDynamics").onclick = function () {
  renderDynamics();
  showScreen("dynamics");
};
$("#settingsBtn").onclick = function () {
  previousScreen = visibleScreenName();
  renderProfile();
  showScreen("profile");
};

$("#useDemo").onclick = function () { run(demoTx(), "demo"); };
$("#pickFile").onclick = function () { $("#csvFile").click(); };
$("#csvFile").onchange = function () {
  const f = this.files && this.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = function () {
    const rows = parseCSV(rd.result);
    if (!rows) { showParseError(true); return; }
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
    if (!rows) { showParseError(true); return; }
    run(rowsToTx(rows), f.name || "csv");
  };
  rd.readAsText(f, "utf-8");
});
drop.addEventListener("click", () => $("#csvFile").click());

/* ---------- startup: pick up an existing server session, else stay in guest mode ---------- */
(async function bootstrap() {
  const res = await apiMe();
  if (res && res.user) {
    currentUser = res.user;
    store.setMode("api");
    await store.syncFromServer();
  } else {
    store.setMode("local");
  }
  updateHeaderAccount();
})();
