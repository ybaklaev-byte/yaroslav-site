# Полная инструкция по деплою «Баланса» на российский VPS

Пошагово, «с нуля и по кнопкам» — рассчитано на человека без опыта администрирования
серверов. Каждую команду можно копировать целиком. Если застрял — в конце есть раздел
«Если что-то пошло не так».

**Что получится:** приложение с аккаунтами живёт по твоему адресу (домен + HTTPS),
база данных переживает перезагрузки сервера, раз в день делается резервная копия.

**Сколько времени и денег:**

| Что | Сколько |
|---|---|
| Время на всё | ~30–40 минут |
| VPS (сервер) | ~150–300 ₽/мес |
| Домен (по желанию, но рекомендую) | ~200–600 ₽/год |
| Итого на старт | до ~1000 ₽ (первый месяц + домен) |

**Условные обозначения:** команды, которые выполняются **на твоём Mac**, помечены
`# на Mac`. Всё остальное выполняется **на сервере** (после подключения по SSH).
Замени заглушки `ТВОЙ_IP`, `ТВОЙ_ДОМЕН` на свои значения.

---

## Шаг 0. Что тебе нужно иметь под рукой

- Компьютер (Mac — в инструкции команды для него; на Windows аналогично через PowerShell).
- Банковская карта для оплаты VPS.
- ~40 минут.
- (Опционально) желаемое имя домена, например `balance-app.ru`.

---

## Шаг 1. Арендовать VPS

VPS — это «виртуальный компьютер в интернете», который работает круглосуточно.

1. Зайди на сайт российского провайдера. Проверенные, с оплатой картой РФ:
   - **Timeweb Cloud** (timeweb.cloud) — простой интерфейс, рекомендую для начала
   - **Beget** (beget.com)
   - **reg.ru**, **Selectel**, **VDSina**
2. Создай **облачный сервер / VPS** с параметрами:
   - **ОС:** Ubuntu 24.04 LTS (важно именно Ubuntu)
   - **Конфигурация:** минимальная достаточна — 1 CPU, 1 ГБ RAM, 10–15 ГБ диск
   - **Регион:** любой в РФ
3. При создании выбери способ доступа:
   - Проще всего — **по паролю** (провайдер пришлёт `root` + пароль).
   - Надёжнее — **по SSH-ключу** (см. Шаг 2, вариант Б).
4. После создания запиши: **IP-адрес сервера** (например `81.200.150.10`) и пароль root.

---

## Шаг 2. Подключиться к серверу с Mac

Открой на Mac приложение **Терминал** (Cmd+Пробел → «Терминал»).

### Вариант А — по паролю (проще)

```bash
# на Mac
ssh root@ТВОЙ_IP
```

При первом подключении спросит «Are you sure…» — введи `yes`. Затем введи пароль
(при вводе он не отображается — это нормально, просто печатай и жми Enter).

### Вариант Б — по SSH-ключу (надёжнее, без ввода пароля каждый раз)

```bash
# на Mac — создать ключ (если ещё нет). На все вопросы можно жать Enter.
ssh-keygen -t ed25519

# на Mac — скопировать ключ на сервер (введёшь пароль root один раз)
ssh-copy-id root@ТВОЙ_IP

# теперь вход без пароля:
ssh root@ТВОЙ_IP
```

> Если видишь приглашение вида `root@ubuntu:~#` — ты на сервере. **Все следующие
> команды (без пометки «на Mac») выполняются здесь.**

---

## Шаг 3. Обновить систему и включить фаервол

```bash
apt-get update && apt-get upgrade -y

# фаервол: разрешаем только SSH и веб (80/443), остальное закрыто
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

---

## Шаг 4. Установить Node.js 24

Приложению нужен Node.js версии 24 (в нём встроенная база SQLite).

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git
node --version    # должно показать v24.x.x
```

---

## Шаг 5. Загрузить код приложения

Код лежит в публичном репозитории на GitHub, поэтому просто клонируем его.

```bash
git clone https://github.com/ybaklaev-byte/yaroslav-site.git /opt/balance
ls /opt/balance/server    # должны быть server.js, db.js, auth.js
```

> В будущем, чтобы обновить приложение до свежей версии:
> `cd /opt/balance && git pull && systemctl restart balance` (см. Шаг 10).

---

## Шаг 6. Настроить автозапуск (systemd)

Чтобы приложение стартовало само при загрузке сервера и перезапускалось при сбоях.

```bash
# отдельный пользователь без прав входа — для безопасности
useradd --system --home /opt/balance --shell /usr/sbin/nologin balance
chown -R balance:balance /opt/balance

# создать службу
cat > /etc/systemd/system/balance.service << 'EOF'
[Unit]
Description=Balance app (fin-consultation)
After=network.target

[Service]
Type=simple
User=balance
WorkingDirectory=/opt/balance
Environment=PORT=4600
Environment=BALANCE_SECURE=1
ExecStart=/usr/bin/node server/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# запустить и включить автозапуск
systemctl daemon-reload
systemctl enable --now balance
systemctl status balance --no-pager
```

Ожидаемый результат: строка `Active: active (running)` и в логе `listening on 4600`.

> `BALANCE_SECURE=1` включает защищённые cookie и доверие прокси. Это правильно
> ТОЛЬКО когда впереди стоит HTTPS-прокси Caddy (Шаг 7, вариант А). Если пойдёшь
> по варианту Б (без домена, по IP) — поставь `=0` (там сказано, как).

---

## Шаг 7. HTTPS и адрес сайта

### Вариант А — с доменом (рекомендуется, «правильный» способ)

**7.1. Купить домен** (если ещё нет): у любого регистратора — reg.ru, timeweb,
nic.ru. Например `balance-app.ru`.

**7.2. Направить домен на сервер.** В панели регистратора домена найди раздел
**DNS-записи** и добавь запись типа **A**:

| Тип | Имя (host) | Значение |
|---|---|---|
| A | `@` | `ТВОЙ_IP` |
| A | `www` | `ТВОЙ_IP` |

Сохрани. Обновление DNS занимает от нескольких минут до пары часов. Проверить,
что домен уже указывает на сервер, можно так (на Mac): `dig +short ТВОЙ_ДОМЕН` —
должен вернуть твой IP.

**7.3. Установить Caddy** (веб-сервер, сам получает и продлевает HTTPS-сертификат):

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

**7.4. Настроить Caddy** (замени `ТВОЙ_ДОМЕН`):

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
ТВОЙ_ДОМЕН, www.ТВОЙ_ДОМЕН {
    reverse_proxy 127.0.0.1:4600
}
EOF

systemctl restart caddy
systemctl status caddy --no-pager
```

Готово: открывай **`https://ТВОЙ_ДОМЕН`** — замочек, сертификат Caddy получит сам.

### Вариант Б — без домена, по IP (только для быстрой проверки)

HTTPS на «голый» IP не выдаётся, поэтому только временно и без реальных паролей:

```bash
sed -i 's/BALANCE_SECURE=1/BALANCE_SECURE=0/' /etc/systemd/system/balance.service
systemctl daemon-reload && systemctl restart balance
ufw allow 4600/tcp
```

Открывай `http://ТВОЙ_IP:4600`. ⚠️ Соединение НЕ шифруется — пароли передаются
открыто. Годится только «посмотреть, что работает». Для реальных людей —
обязательно вариант А (домен + HTTPS).

---

## Шаг 8. Резервное копирование базы (раз в день, 14 копий)

```bash
mkdir -p /opt/backups
cat > /etc/cron.daily/balance-backup << 'EOF'
#!/bin/sh
cp /opt/balance/server/data.db /opt/backups/data-$(date +%F).db 2>/dev/null || exit 0
ls -t /opt/backups/data-*.db | tail -n +15 | xargs -r rm
EOF
chmod +x /etc/cron.daily/balance-backup
```

**Восстановить из копии:**

```bash
systemctl stop balance
cp /opt/backups/data-ГГГГ-ММ-ДД.db /opt/balance/server/data.db
chown balance:balance /opt/balance/server/data.db
systemctl start balance
```

---

## Шаг 9. Финальная проверка

1. Открой сайт (`https://ТВОЙ_ДОМЕН` или `http://ТВОЙ_IP:4600`).
2. Лендинг открывается, кнопка «Открыть приложение» ведёт в `app.html`.
3. «Посмотреть на демо-данных» → появился разбор (это гостевой режим, без входа).
4. «Войти» → «Создать аккаунт» → зарегистрируйся (email + пароль от 6 символов).
5. Сделай разбор, нажми «Выйти», войди снова — история на месте (уже с сервера).
6. Проверь, что синхронизация реальна: открой сайт в режиме инкогнито, войди тем
   же аккаунтом — разборы подтянулись.

Диагностика на сервере:
```bash
systemctl status balance --no-pager      # active (running)?
journalctl -u balance -n 30 --no-pager    # логи приложения
```

---

## Шаг 10. Как обновлять приложение

Когда в репозитории появятся изменения:

```bash
cd /opt/balance
git pull
systemctl restart balance
```

База (`server/data.db`) при обновлении не трогается — аккаунты и история сохраняются.

---

## Если что-то пошло не так

| Симптом | Что делать |
|---|---|
| `systemctl status balance` не `running` | `journalctl -u balance -n 50 --no-pager` — прочитать ошибку. Часто: порт занят (`lsof -i :4600`) или права (`chown -R balance:balance /opt/balance`). |
| Сайт не открывается по домену | Проверь DNS: `dig +short ТВОЙ_ДОМЕН` должен вернуть твой IP. Если пусто — DNS ещё не обновился, подожди. |
| Caddy не поднялся / нет сертификата | `journalctl -u caddy -n 50 --no-pager`. Обычная причина — домен ещё не указывает на сервер (см. выше) или закрыты порты 80/443 (`ufw status`). |
| «Не удалось войти» после регистрации | Проверь, что `BALANCE_SECURE=1` только при HTTPS. По http:// с secure-cookie вход не работает. |
| Забыл, куда что ставил | Приложение: `/opt/balance`. Служба: `/etc/systemd/system/balance.service`. Caddy: `/etc/caddy/Caddyfile`. Бэкапы: `/opt/backups`. |
| Хочу перезапустить всё | `systemctl restart balance caddy` |

---

## Важно знать (безопасность и приватность)

- **Приватность данных:** на сервер уходят только результаты разборов (score,
  суммы по категориям, рекомендации). Сырые операции из выписки **не покидают
  браузер** пользователя — разбор считается на устройстве.
- **Защита входа:** пароли хранятся хешированными (scrypt + соль); есть ограничение
  10 попыток входа за 15 минут с одного IP; cookie-сессии защищённые (за HTTPS).
- **База — один файл** `server/data.db`. Не в git (в `.gitignore`). Твои резервные
  копии в `/opt/backups` — единственная страховка, следи, что бэкап работает.
- **Юр-момент для реального запуска:** для сбора персональных данных (email)
  публичному сервису в РФ нужна политика конфиденциальности и учёт 152-ФЗ —
  это отдельная задача перед публичным запуском на широкую аудиторию.

---

*Нужна помощь на любом шаге — пришли вывод команды, разберём вместе.*
