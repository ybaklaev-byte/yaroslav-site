// Rule-based advisor (Task 5). Pure module — no document/window/localStorage/network.
// Ported from app.html's inline initChat()/answer() intent dispatch.

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

function saveAnswer(a) {
  if (!a.trimRecs.length) return "Крупных необязательных статей не вижу — уже неплохо. Следи за мелкими подписками.";
  const t = a.trimRecs.slice(0, 3).map((r) => "<b>" + r.name + "</b> −" + rub(r.save) + "/мес").join(", ");
  return "Проще всего подрезать: " + t + ". Суммарно это до <b>" + rub(a.potential) + "/мес</b> (≈ " + rub(a.potential * 12) + "/год) без потери качества жизни.";
}

function putAsideAnswer(a) {
  const withCut = Math.max(0, a.net) + a.potential;
  return "Сейчас в среднем остаётся <b>" + (a.net >= 0 ? rub(a.net) : "0 ₽ (уходишь в минус)") + "/мес</b>. Если подрезать необязательные траты, реально откладывать до <b>" + rub(withCut) + "/мес</b>.";
}

function cushionAnswer(a) {
  if (a.cushionMonths >= 3) return "Да — резерва хватит на <b>" + a.cushionMonths.toFixed(1) + " мес</b>, это в норме (3–6). Дальше можно думать про инвестиции.";
  return "Пока нет: резерва на <b>" + (a.cushionMonths < 0.1 ? "меньше месяца" : a.cushionMonths.toFixed(1) + " мес") + "</b>, а безопасный минимум — 3–6 месяцев расходов, то есть <b>" + rub(a.expMo * 3) + "–" + rub(a.expMo * 6) + "</b>. Это цель №1.";
}

function whereAnswer(a) {
  const t = a.cats.slice(0, 3).map((x) => "<b>" + x.name + "</b> " + pct(x.sum / a.expense)).join(", ");
  return "Крупнейшие статьи: " + t + ". Всего за период — " + rub(a.expense) + " (" + rub(a.expMo) + "/мес).";
}

function goalAnswer(a) {
  const rate = Math.max(0, a.net) + a.potential;
  if (rate <= 0) return "При текущем раскладе накопить не выйдет — сначала нужно выйти в плюс (см. рекомендации).";
  const mo = Math.ceil(300000 / rate);
  return "Откладывая ~" + rub(rate) + "/мес (с учётом экономии), 300 000 ₽ соберёшь примерно за <b>" + mo + " мес</b> (~" + (mo / 12).toFixed(1) + " года).";
}

function investAnswer(a) {
  const gate = a.cushionMonths >= 3
    ? "подушка на 3–6 месяцев уже есть — можно переходить к общим принципам инвестирования."
    : "подушки на 3–6 месяцев ещё нет — сначала резерв, потом инвестиции.";
  return "Это общее образовательное объяснение, не персональная рекомендация: мы не даём персональных рекомендаций конкретных бумаг. Инвестиции имеет смысл начинать только <b>после</b> подушки безопасности. Сейчас " + gate + " Общие принципы: диверсификация, соответствие горизонту цели и вашей терпимости к риску, минимизация комиссий. За конкретным выбором инструментов — к лицензированному финансовому консультанту.";
}

function debtAnswer() {
  return "По выписке крупных долговых платежей не вижу. Если есть кредиты — гаси сначала самые дорогие по ставке, и держи платежи в пределах 30% дохода.";
}

function stateAnswer(a, prev) {
  const v = a.score >= 55 ? "неплохое" : "уязвимое";
  let s = "Оценка финансового здоровья — <b>" + a.score + "/100</b> (" + v + "). Откладываешь <b>" + pct(a.savingsRate) + "</b> дохода, подушки хватит на <b>" + (a.cushionMonths < 0.1 ? "меньше месяца" : a.cushionMonths.toFixed(1) + " мес") + "</b>, необязательные траты — <b>" + pct(a.discShare) + "</b>. Главное, над чем поработать — " + (a.cushionMonths < 3 ? "подушка безопасности" : "дисциплина сбережений") + ".";
  if (prev) {
    const diff = a.score - prev.score;
    const trend = diff > 0 ? "выросло" : diff < 0 ? "снизилось" : "не изменилось";
    s += " Твой score изменился с <b>" + prev.score + "</b> до <b>" + a.score + "</b> — состояние " + trend + (diff !== 0 ? " на " + Math.abs(diff) + " " + "балл" + (Math.abs(diff) === 1 ? "" : "ов") : "") + " по сравнению с прошлым разбором.";
  }
  return s;
}
