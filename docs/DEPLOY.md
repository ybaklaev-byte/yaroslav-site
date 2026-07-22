# Деплой «Баланса» на российский VPS

Инструкция «для человека, не сисадмина»: все команды копируются как есть.
Результат: приложение с аккаунтами живёт по твоему адресу с HTTPS, база
переживает перезагрузки, раз в день делается бэкап.

Что понадобится: ~30 минут, VPS (~150–300 ₽/мес), опционально домен (~200–600 ₽/год).

---

## Шаг 1. Арендовать VPS

Подойдёт любой российский провайдер с оплатой картой РФ: Timeweb Cloud, Beget,
reg.ru и т.п. Минимальная конфигурация достаточна: 1 CPU, 1 ГБ RAM, 10 ГБ диск,
ОС **Ubuntu 24.04**.

После создания сервера у тебя будут: **IP-адрес**, логин `root` и пароль (или
SSH-ключ). Проверь вход (Терминал на Mac):

```bash
ssh root@ТВОЙ_IP
```

> Дальше все команды выполняются НА СЕРВЕРЕ (после ssh), если не сказано иное.

## Шаг 2. Установить Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
node --version   # должно показать v24.x
```

## Шаг 3. Загрузить код

Код публичный на GitHub, поэтому просто:

```bash
apt-get install -y git
git clone https://github.com/ybaklaev-byte/yaroslav-site.git /opt/balance
```

Обновление в будущем: `cd /opt/balance && git pull && systemctl restart balance`.

## Шаг 4. Создать пользователя и systemd-службу (автозапуск)

```bash
useradd --system --home /opt/balance --shell /usr/sbin/nologin balance
chown -R balance:balance /opt/balance

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

systemctl daemon-reload
systemctl enable --now balance
systemctl status balance --no-pager   # ожидаем: active (running), listening on 4600
```

`BALANCE_SECURE=1` включает Secure-cookie и доверие заголовку X-Forwarded-For —
это правильно ТОЛЬКО за HTTPS-прокси (Caddy из шага 5).

## Шаг 5. HTTPS через Caddy (автоматические сертификаты)

### Вариант А: с доменом (рекомендую)

Сначала у регистратора домена создай **A-запись**: `имя_домена → ТВОЙ_IP`
(и `www`, если хочешь). Подожди 5–15 минут. Затем:

```bash
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

cat > /etc/caddy/Caddyfile << 'EOF'
ТВОЙ_ДОМЕН {
    reverse_proxy 127.0.0.1:4600
}
EOF

systemctl restart caddy
```

Всё: `https://ТВОЙ_ДОМЕН` — сертификат Caddy получит и будет продлевать сам.

### Вариант Б: без домена (по IP, для быстрой проверки)

HTTPS на голый IP не выдаётся. Временно можно открыть приложение напрямую:

```bash
# в /etc/systemd/system/balance.service замени Environment=BALANCE_SECURE=1 на =0
sed -i 's/BALANCE_SECURE=1/BALANCE_SECURE=0/' /etc/systemd/system/balance.service
systemctl daemon-reload && systemctl restart balance
ufw allow 4600/tcp 2>/dev/null || true
```

Открывай `http://ТВОЙ_IP:4600`. ⚠️ Пароли пойдут без шифрования — используй
только для проверки, для реальных пользователей нужен домен + вариант А.

## Шаг 6. Бэкап базы (раз в день, хранится 14 копий)

```bash
mkdir -p /opt/backups
cat > /etc/cron.daily/balance-backup << 'EOF'
#!/bin/sh
cp /opt/balance/server/data.db /opt/backups/data-$(date +%F).db 2>/dev/null || exit 0
ls -t /opt/backups/data-*.db | tail -n +15 | xargs -r rm
EOF
chmod +x /etc/cron.daily/balance-backup
```

Восстановление: `systemctl stop balance && cp /opt/backups/data-ДАТА.db /opt/balance/server/data.db && chown balance:balance /opt/balance/server/data.db && systemctl start balance`.

## Шаг 7. Проверка

1. Открой сайт → лендинг работает, `app.html` открывается.
2. «Посмотреть на демо-данных» → разбор появился (гостевой режим).
3. «Войти» → «Создать аккаунт» → зарегистрируйся.
4. Сделай разбор, выйди, войди снова — история на месте (уже с сервера).
5. `systemctl status balance` — active; `journalctl -u balance -n 20` — без ошибок.

## Если что-то не так

- `journalctl -u balance -n 50 --no-pager` — логи приложения.
- `journalctl -u caddy -n 50 --no-pager` — логи HTTPS-прокси.
- Порт занят: `lsof -i :4600`.
- После `git pull` всегда `systemctl restart balance`.

## Что важно знать

- **Приватность:** на сервер уходят только результаты разборов (score, категории,
  рекомендации). Сырые операции из выписки не покидают браузер пользователя.
- **Rate-limit:** 10 попыток входа/регистрации за 15 минут с одного IP, затем 429.
- База — один файл `server/data.db`. Он в `.gitignore` и не попадает в git.
