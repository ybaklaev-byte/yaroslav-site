import { CATS, autoCat, isInternal } from "./categories.js";

const TRIM = { cafe: .30, taxi: .35, fun: .40, shopping: .25, alcohol: .30, food: .12 };

const TIPS = {
  cafe: "Готовь дома 2–3 раза в неделю вместо кафе.",
  taxi: "Часть поездок — на общественном транспорте.",
  fun: "Пересмотри подписки, часть не используешь.",
  shopping: "Правило 24 часов перед незапланированной покупкой.",
  alcohol: "Сократи спонтанные покупки.",
  food: "Закупайся по списку, меньше мелких забегов."
};

// Local text helpers — kept private to analyzer.js. Only used to produce
// human-readable `detail` strings on risks/recs; numeric fields (save) stay raw.
function rub(n) {
  return Math.round(Math.abs(n)).toLocaleString("ru-RU") + " ₽";
}
function pct(n) {
  return Math.round(n * 100) + "%";
}

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

// Ported from app.html's flags(a). Returns {level,icon,title,detail}[].
function buildRisks(a) {
  const out = [];
  if (a.savingsRate < 0) {
    out.push({ level: "bad", icon: "🔴", title: "Тратишь больше, чем зарабатываешь", detail: "В среднем расходы превышают доход — это главный риск, разбираем в рекомендациях." });
  } else if (a.savingsRate < 0.1) {
    out.push({ level: "warn", icon: "🟡", title: "Почти ничего не откладывается", detail: "Норма сбережений ниже 10% — при любой неожиданности выручать нечем." });
  } else {
    out.push({ level: "good", icon: "🟢", title: "Здоровая норма сбережений", detail: "Откладываешь " + pct(a.savingsRate) + " дохода — так и держи." });
  }
  if (a.cushionMonths < 1) {
    out.push({ level: "bad", icon: "🛟", title: "Нет подушки безопасности", detail: "Резерва меньше чем на месяц. Цель — 3–6 месяцев расходов (" + rub(a.expMo * 3) + "–" + rub(a.expMo * 6) + ")." });
  } else if (a.cushionMonths < 3) {
    out.push({ level: "warn", icon: "🛟", title: "Подушка маловата", detail: "Хватит на " + a.cushionMonths.toFixed(1) + " мес, а надо 3–6. Продолжай откладывать." });
  }
  if (a.discShare > 0.35) {
    out.push({ level: "warn", icon: "🍹", title: "Много необязательных трат", detail: pct(a.discShare) + " уходит на кафе, такси, шопинг и т.п. — здесь самый простой резерв." });
  }
  const topDisc = a.trimRecs[0];
  if (topDisc) {
    out.push({ level: "warn", icon: "📌", title: "Крупная статья: " + topDisc.name.toLowerCase(), detail: "~" + rub(topDisc.mo) + "/мес. Даже небольшое сокращение заметно освободит бюджет." });
  }
  return out;
}

// Ported from app.html's recs(a). Returns {id,title,detail,save}[] with stable ids
// for progress tracking (recDone, Task 8).
function buildRecs(a) {
  const list = [];
  if (a.cushionMonths < 3) {
    list.push({
      id: "cushion",
      title: "Собери подушку безопасности",
      detail: "Автоматически откладывай в начале месяца фиксированную сумму на отдельный счёт, пока не накопишь 3–6 месяцев расходов. Цель: " + rub(a.expMo * 3) + "–" + rub(a.expMo * 6),
      save: 0
    });
  }
  a.trimRecs.slice(0, 2).forEach((r) => {
    const tip = TIPS[r.id] || "Сократи необязательные траты.";
    list.push({
      id: "trim-" + r.id,
      title: "Сократи «" + r.name.toLowerCase() + "»",
      detail: tip + " −" + rub(r.save) + "/мес ≈ " + rub(r.save * 12) + "/год",
      save: r.save
    });
  });
  if (a.savingsRate < 0.1) {
    list.push({
      id: "savings-rate",
      title: "Доведи норму сбережений до 10–20%",
      detail: "Начни с 10% дохода «в первую очередь», остальное — на жизнь. Это дисциплинирует расходы сильнее любого учёта.",
      save: 0
    });
  }
  list.push({
    id: "recurring",
    title: "Проверь регулярные списания",
    detail: "Подписки и мелкие автоплатежи незаметно съедают бюджет — раз в квартал пересматривай их.",
    save: 0
  });
  if (a.potential > 0) {
    list.unshift({
      id: "potential",
      title: "Суммарный потенциал экономии",
      detail: "Если умеренно подрезать необязательные категории, освобождается заметная сумма — можно направить в подушку или на цель. До " + rub(a.potential) + "/мес · " + rub(a.potential * 12) + "/год",
      save: a.potential
    });
  }
  return list.slice(0, 5);
}
