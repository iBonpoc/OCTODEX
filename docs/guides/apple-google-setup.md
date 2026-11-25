# Настройка входа через Apple и Google — шаги для основателя

> 17.11.2026, к спеке 58 (#1822). Делается руками один раз, примерно 30–40 минут, плюс ожидание проверки бренда Google
> (несколько дней — начните с Google). **Ключи, секреты и файлы .p8 никуда не пересылайте:** ни в чат, ни в задачи, ни в
> почту. Они вставляются только в формы, указанные ниже. Мне достаточно слов «Apple готов» / «Google готов».
>
> Адрес вашего проекта Supabase (он не секретный): `https://kgiaxygsjkyiquhjbxdg.supabase.co`
> Адрес возврата для Apple и Google (тоже не секретный): `https://kgiaxygsjkyiquhjbxdg.supabase.co/auth/v1/callback`

## Часть 1. Google (начать первой — проверка занимает дни)

1. Откройте https://console.cloud.google.com и войдите аккаунтом компании.
2. Вверху → выбор проекта → **New project** → имя `GoRix` → **Create**. Убедитесь, что вверху выбран проект GoRix.
3. Слева меню → **APIs & Services** → **OAuth consent screen** (в новом виде — **Google Auth Platform**) → **Get started**:
   - App name: `GoRix`
   - User support email: ваша почта поддержки
   - Audience: **External**
   - Contact information: ваша почта → **Create**.
4. **Branding** (оформление):
   - App logo: квадратный логотип GoRix (120×120)
   - App domain → Application home page: `https://gorix.app`
   - Privacy policy link и Terms of service link: адреса страниц политики и условий на gorix.app (задача #836 — если
     страниц ещё нет, этот шаг дождётся их)
   - Authorized domains: `gorix.app` и `supabase.co`
   - **Save**.
5. **Data access** (доступ к данным) → **Add or remove scopes** → отметить `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` → **Update** → **Save**. Больше ничего не добавлять.
6. **Audience** → **Publish app** (перевести в рабочий режим). Затем на **Branding** → **Verify branding** /
   **Submit for verification** — Google проверит логотип и название (обычно несколько рабочих дней; ответ придёт на почту).
7. **Clients** → **Create client**:
   - Application type: **Web application**
   - Name: `GoRix — Supabase`
   - Authorized redirect URIs → **Add URI**: `https://kgiaxygsjkyiquhjbxdg.supabase.co/auth/v1/callback`
   - **Create**. Откроется окно с **Client ID** и **Client secret** — не закрывайте его, переходите к шагу 8.
   - Клиенты iOS и Android **не нужны**: вход через Google у нас идёт через системное окно (спека 58 §2).
8. Во второй вкладке: https://supabase.com/dashboard → проект **OCTODEX-APP** → **Authentication** → **Sign In /
   Providers** → **Google** → включить:
   - Client IDs: вставить **Client ID** из шага 7
   - Client Secret (for OAuth): вставить **Client secret** из шага 7
   - **Skip nonce check** — оставить **выключенным**
   - **Save**. Окно Google из шага 7 теперь можно закрыть.

## Часть 2. Apple

Нужен платный аккаунт Apple Developer (он у вас уже есть — через него идут сборки TestFlight).

1. Откройте https://developer.apple.com/account → **Certificates, IDs & Profiles**.
2. **Включить вход у приложения:** **Identifiers** → **App IDs** → `com.gorix.app` → в списке **Capabilities** отметить
   **Sign In with Apple** → **Save** → **Confirm**.
3. **Service ID (для входа на сайте и на Android):** **Identifiers** → **+** → **Services IDs** → **Continue**:
   - Description: `GoRix web sign-in`
   - Identifier: `com.gorix.app.web`
   - **Continue** → **Register**.
   Откройте созданный `com.gorix.app.web` → отметить **Sign In with Apple** → **Configure**:
   - Primary App ID: `com.gorix.app`
   - Domains and Subdomains: `kgiaxygsjkyiquhjbxdg.supabase.co`
   - Return URLs: `https://kgiaxygsjkyiquhjbxdg.supabase.co/auth/v1/callback`
   - **Next** → **Done** → **Continue** → **Save**.
4. **Ключ:** **Keys** → **+**:
   - Key Name: `GoRix Sign in with Apple`
   - отметить **Sign In with Apple** → **Configure** → Primary App ID `com.gorix.app` → **Save**
   - **Continue** → **Register** → **Download**. Файл `.p8` скачивается **только один раз** — сохраните его в надёжное
     место (менеджер паролей). Запишите **Key ID** (на этой же странице) и **Team ID** (справа вверху или в
     **Membership details**).
5. **Секрет для Supabase:** Apple требует подписанный секрет (JWT), который живёт 6 месяцев. Сделать его можно генератором
   на странице Supabase про вход через Apple (https://supabase.com/docs/guides/auth/social-login/auth-apple, раздел про
   секрет): туда вводятся Team ID, Key ID, Service ID `com.gorix.app.web` и содержимое `.p8`; генератор работает в вашем
   браузере. Полученную длинную строку — сразу в шаг 6.
   Через 6 месяцев секрет нужно сделать заново — мы заведём задачу-напоминание.
6. Supabase → **Authentication** → **Sign In / Providers** → **Apple** → включить:
   - Client IDs: `com.gorix.app,com.gorix.app.web`
   - Secret Key (for OAuth): строка из шага 5
   - **Save**.
7. Файл `.p8`, Key ID и Team ID понадобятся ещё для отзыва доступа Apple при удалении аккаунта (спека 58 §6). Их
   вставляют в **Supabase → Project Settings → Edge Functions → Secrets**. Точные имена полей я напишу, когда дойдём до
   этой части (PR-C) — до тех пор просто храните `.p8` у себя.

## Часть 3. Общие настройки Supabase (2 минуты)

Supabase → **Authentication**:
1. **URL Configuration** → **Redirect URLs** → **Add URL**: `gorix://**` и `https://gorix.expo.app/**` → **Save**.
2. **Sign In / Providers** → раздел пользователей:
   - **Allow manual linking** — **выключено**
   - **Secure email change** — **включено**
   - **Allow anonymous sign-ins** — **выключено**
   - **Phone** — выключено.

## Что сказать после

Напишите в чат: «Google готов» (и когда придёт письмо об одобрении бренда — «бренд одобрен») и «Apple готов». Ключи и
секреты не присылайте — они уже на своих местах.
