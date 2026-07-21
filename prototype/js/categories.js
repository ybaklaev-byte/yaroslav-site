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
