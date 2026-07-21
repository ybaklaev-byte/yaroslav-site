// Demo transaction generator (Task 8). Pure module — no DOM/localStorage/network.
// Ported verbatim from app.html's inline demoTx().

export function demoTx() {
  const now = Date.now(), D = 86400000, tx = [];
  function e(days, amt, desc) { tx.push({ ts: now - days * D, amount: -amt, desc: desc }); }
  function inc(days, amt, desc) { tx.push({ ts: now - days * D, amount: amt, desc: desc }); }
  inc(3, 82000, "Зарплата"); inc(33, 80000, "Зарплата"); inc(20, 6000, "Возврат Авито");
  const groc = ["Пятёрочка", "Магнит", "Ашан", "Перекрёсток", "ВкусВилл"];
  for (let i = 0; i < 26; i++) e(i * 2 + 1, 200 + Math.round(Math.random() * 1400), groc[i % 5]);
  e(2, 3373, "LUKOIL AZS"); e(9, 2100, "АЗС Нефтьмагистраль"); e(16, 3000, "LUKOIL");
  const caf = ["Кофе Way", "Ресторан Веранда", "Вкусно и точка", "Кофейня", "Ланч кафе"];
  for (let j = 0; j < 18; j++) e(j * 3 + 1, 250 + Math.round(Math.random() * 1600), caf[j % 5]);
  for (let t = 0; t < 15; t++) e(t * 3 + 2, 300 + Math.round(Math.random() * 2400), "Яндекс Такси");
  e(5, 2890, "Кино Mori"); e(19, 3200, "Концерт"); e(30, 199, "Яндекс Плюс подписка"); e(1, 299, "Подписка");
  e(6, 1490, "Аптека Горздрав"); e(22, 3400, "Клиника");
  e(3, 1780, "Коммуналка ЖКХ"); e(12, 1200, "Хозтовары Твой Дом"); e(28, 6019, "Мебель");
  e(8, 9494, "LCWaikiki одежда"); e(15, 6000, "Gold Apple"); e(24, 4200, "OZON");
  e(4, 1508, "Красное&Белое"); e(11, 890, "WINELAB"); e(18, 650, "Табак");
  e(7, 700, "Интернет Ростелеком"); e(14, 650, "МТС связь");
  e(10, 55000, "Перевод на вклад"); // savings move
  return tx;
}
