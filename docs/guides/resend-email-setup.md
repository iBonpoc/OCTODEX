# Своя почта для писем входа (Resend) — шаги для основателя

> 17.11.2026, к спеке 52 §9 (#1756). Зачем: без своей почты Supabase шлёт письма только участникам команды проекта и не
> даёт поставить в письмо код. После этих шагов письмо с кодом придёт любому человеку от «GoRix».
> Примерно 15 минут, плюс ожидание проверки домена (обычно минуты, иногда до часа). Resend — бесплатный тариф
> (до 100 писем в день, 3000 в месяц); перед открытием входа всем — Pro $20/мес (решение основателя 16.11).
> **Ключ Resend никуда не пересылайте** — ни в чат, ни в задачи. Он вставляется только в форму Supabase (шаг 4).
> Мне достаточно слов «почта готова».

## Шаг 1. Аккаунт Resend
1. Откройте https://resend.com → **Sign up** → войдите почтой компании.
2. Включите двухфакторный вход: **Settings** → **Account** (или значок профиля) → **Two-factor authentication** → **Enable**.
   В журнале Resend видны письма с кодами — доступ должен быть только у вас.

## Шаг 2. Домен
1. **Domains** → **Add Domain**.
2. Name: `auth.gorix.app` (именно поддомен — письма входа отдельно от остальной почты компании). Region — любой из
   предложенных (по умолчанию). → **Add**.
3. Resend покажет таблицу записей DNS — обычно 3–4 строки: **MX** и **TXT** (SPF) для `send.auth.gorix.app`, **TXT** (DKIM)
   для `resend._domainkey.auth.gorix.app`. Не закрывайте страницу.
4. Откройте панель того, где куплен домен gorix.app → раздел **DNS** (у разных регистраторов: «DNS», «DNS Records»,
   «Manage DNS», «Advanced DNS»). Для каждой строки из Resend → **Add record**:
   - Type — как в Resend (MX или TXT)
   - Name / Host — как в Resend. Если регистратор сам дописывает `.gorix.app`, вписывайте только часть до него
     (например, `send.auth` вместо `send.auth.gorix.app`)
   - Value / Content — скопировать целиком из Resend
   - Priority (для MX) — как в Resend
   - TTL — оставить по умолчанию (Auto)
   - Если регистратор — Cloudflare: у записей оставить **DNS only** (серое облачко), не Proxied.
5. Добавьте ещё одну запись (защита от подделки писем):
   - Type: **TXT**
   - Name: `_dmarc.auth` (или `_dmarc.auth.gorix.app`, если регистратор ничего не дописывает)
   - Value: `v=DMARC1; p=none`
6. Вернитесь в Resend → **Verify DNS Records**. Когда у всех строк станет **Verified** — шаг готов. Если через час не
   готово — сфотографируйте экран Resend со статусами (без ключей) и пришлите.

## Шаг 3. Ключ для Supabase
1. Resend → **API Keys** → **Create API Key**:
   - Name: `Supabase SMTP`
   - Permission: **Sending access**
   - Domain: `auth.gorix.app`
   - **Add**.
2. Ключ покажут **один раз** — скопируйте его и сразу переходите к шагу 4.
3. Resend → **Domains** → `auth.gorix.app` → **Configuration**: **Click tracking** и **Open tracking** — выключены
   (в письмах входа ничего не отслеживаем).

## Шаг 4. Почта в Supabase
1. https://supabase.com/dashboard → проект **OCTODEX-APP** → **Authentication** → **Emails** → **SMTP Settings** →
   **Enable custom SMTP** — включить.
2. Заполнить:
   - Sender email: `login@auth.gorix.app`
   - Sender name: `GoRix`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Minimum interval between emails: оставить как есть (60)
   - Username: `resend`
   - Password: ключ из шага 3
3. **Save**.

## Как это было сделано 17.11.2026
Основатель подключил Resend к сессии и дал ключ Cloudflare только на DNS gorix.app (7 дней); исполнитель сам создал
домен `auth.gorix.app` в Resend, добавил записи в Cloudflare, подключил SMTP и шаблоны в Supabase, проверил письмо
(«delivered»). **После проверки входа на iPhone — отозвать ключ Cloudflare:** https://dash.cloudflare.com/profile/api-tokens
→ «GoRix DNS for Resend» → **Delete**.

## Что дальше
Напишите в чат: **«почта готова»**. Исполнитель сам поставит шаблоны писем с кодом и лимиты через доступ к Supabase,
пришлёт себе тестовое письмо и сообщит руководителю. После этого вход по коду работает для всех.

**Пока не влита защита от чужих аккаунтов (#1787):** ссылку на приложение публично не давать — только закрытый тест в
TestFlight.
