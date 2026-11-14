# Инструкция основателя: где что находится и что нажимать

## Ссылки
| Что | Ссылка |
|---|---|
| Сайт приложения (Expo Hosting, обновляется сам) | https://gorix.expo.app (старое имя octodex освобождено при смене поддомена 14.11, #656; функции его не принимают) |
| Код (GitHub) | https://github.com/iBonpoc/OCTODEX |
| База данных (Supabase) | https://supabase.com/dashboard/project/kgiaxygsjkyiquhjbxdg |
| Сборки iPhone/Android (Expo) | https://expo.dev/accounts/octodex-team/projects/octodex |
| Хостинг (Cloudflare) | https://dash.cloudflare.com |

## 0. Приложение на iPhone через Expo Go (устарело с 14.11.2026)

> **Не использовать.** Expo Go в App Store отстаёт от нашего SDK и показывает старую версию (сборка 284). Приложение — только из TestFlight (§5.6), туда же приходят обновления по воздуху.

- Каждое изменение в `main` само публикуется в Expo Go (EAS Workflow «Publish to Expo Go», канал `preview`).
- Открыть: вставить в Safari `exp://u.expo.dev/49d009d4-a05b-4911-b7da-1e47c4e10fba?runtime-version=exposdk%3A58.0.0&channel-name=preview`, или войти в Expo Go под аккаунтом Expo — проект будет в списке.
- Новая версия: закрыть и снова открыть OCTODEX в Expo Go.

## 1. Cloudflare Pages: сайт приложения
1. Регистрация/вход: https://dash.cloudflare.com/sign-up
2. Слева **Workers & Pages** → **Create** → вкладка **Pages** → **Connect to Git** → GitHub → репозиторий **OCTODEX** → **Begin setup**.
3. Поля:
   - Project name: `octodex`
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `cd apps/mobile && npx expo export --platform web`
   - Build output directory: `apps/mobile/dist`
   - Root directory: **пусто**
   - Environment variables → Add: `NODE_VERSION` = `22`
4. **Save and Deploy**. Адрес будет `https://octodex.pages.dev`. Пришлите его Claude.

## 2. Supabase: куда ведут письма
1. https://supabase.com/dashboard/project/kgiaxygsjkyiquhjbxdg/auth/url-configuration
   - Site URL: адрес сайта (Cloudflare, пока не готов — Vercel)
   - Redirect URLs → Add URL: тот же адрес + `/**`
   - Save
2. Вход по коду из письма (по желанию): https://supabase.com/dashboard/project/kgiaxygsjkyiquhjbxdg/auth/templates → **Magic Link** → добавить в текст `Код: {{ .Token }}` → Save.
3. Название проекта: https://supabase.com/dashboard/project/kgiaxygsjkyiquhjbxdg/settings/general → Project name: `OCTODEX` → Save.

## 3. Вход в приложение на iPhone
1. Откройте сайт в Safari.
2. «Поделиться» → «На экран Домой» → OCTODEX появится иконкой.
3. В приложении: **Ещё** → **Войти или создать аккаунт** → **Войти с паролем** → **Нет аккаунта — создать** → имя, email, пароль → **Создать аккаунт**.
4. Откройте письмо от Supabase → ссылка подтверждения.
5. Снова в приложении: **Войти с паролем** → email и пароль → **Войти** → название компании → **Создать компанию**.
6. Готово: вы владелец, роли Мастер / Диспетчер / Директор — в **Ещё**.

## 4. Android (Expo)
1. https://expo.dev/accounts/octodex-team/projects/octodex → **Build from GitHub**
2. Base directory `apps/mobile`, Platform **Android**, Git ref `main`, Build profile `preview`, Environment **Preview** → **Confirm**.
3. Через 10–20 минут: **Builds** → сборка → **Install** / QR на Android-телефоне.

## 5. iPhone как настоящее приложение (TestFlight)
Своя сборка OCTODEX ставится из TestFlight. Пуши работают только в ней, в Expo Go их нет. Подробности — `docs/specs/30-ios-testflight.md`.

> ### ⚠️ Пароль Apple ID и код с iPhone — только в Терминал на Mac.
> ### Никогда не пишите их в чат, в GitHub или в письмо. Claude их не спрашивает и не видит.

### 5.1. Один раз: подготовить Mac (MacBook Pro M5, 10 минут)
1. Открыть **Терминал**: нажать `⌘ Command` + `Пробел`, набрать `Терминал`, нажать `Return`.
2. Проверить git: вставить `git --version` и нажать `Return`. Видна версия — хорошо. Если Mac предлагает «Установить инструменты командной строки», нажать **Установить** и дождаться конца.
3. Поставить Node.js: открыть https://nodejs.org → большая кнопка **LTS** → скачать `.pkg` → открыть → **Продолжить** до конца.
4. Закрыть Терминал и открыть заново. Вставить `node -v`, нажать `Return`. Должно быть `v20` или больше (например `v22.…`).

### 5.2. Один раз: первая сборка (30–40 минут, почти всё ждать)
1. В Терминале по очереди вставить три строки. После каждой нажимать `Return`:
   ```
   cd ~
   git clone https://github.com/iBonpoc/OCTODEX.git
   cd OCTODEX/apps/mobile
   ```
   Если папка `OCTODEX` уже есть, вместо второй строки выполнить `cd ~/OCTODEX && git pull && cd ~`.
2. Вставить `npm run ios:first` и нажать `Return`. Первые минуты ставятся файлы проекта, это нормально.
3. **Вход в Expo** (если спросит): почта и пароль аккаунта expo.dev.
4. **Вход в Apple.** Вопрос «Do you want to log in to your Apple account?» → `Y` → `Return`. Дальше:
   - **Apple ID** — **полностью почта** аккаунта Apple Developer (не `y`!);
   - **Password** — пароль Apple ID (буквы не видны при вводе, так и должно быть);
   - **код из 6 цифр** — придёт на iPhone, ввести в Терминал.
5. **Все остальные вопросы — просто `Return`.** Это согласие по умолчанию: создать сертификат, профиль, ключ пушей (Push Notifications → **Yes**), ключ App Store Connect, приложение в App Store Connect.
   - Если «OCTODEX» занято, Expo сам даст имя вида «OCTODEX (ea2bef)» — так и вышло 07.11. Поменять: App Store Connect → приложение → App Information → Name (запасное — `GoRix`, решение основателя 07.11). На iPhone под иконкой всё равно OCTODEX.
   - Роль ключа App Store Connect — `Return` (ADMIN).
6. В конце появятся две ссылки: Build и Submission. Терминал можно закрыть: дальше всё идёт на серверах Expo и Apple.
7. Через 20–40 минут придёт письмо от TestFlight. Если не придёт через час, проверить статус на https://expo.dev/accounts/octodex-team/projects/octodex/builds.

### 5.3. Один раз: поставить на iPhone
1. На iPhone открыть **TestFlight**.
2. Если OCTODEX нет в списке: https://appstoreconnect.apple.com → **Apps** → **OCTODEX** → вкладка **TestFlight** → слева **Internal Testing**. Если группы нет, нажать **+** и создать её с любым именем. В группе нажать **Testers** → **+** → отметить себя → **Add**.
3. В TestFlight у OCTODEX нажать **Install** (Установить).
4. Прислать руководителю (в чат можно, это не секрет): App Store Connect → **Apps** → **OCTODEX** → **App Information** → строка **Apple ID** (только цифры, например `6740000000`). Это номер приложения. С ним следующие сборки уходят в TestFlight кнопкой.

### 5.4. Дальше: новые сборки — кнопкой, Mac не нужен
- Обычные изменения приходят сами, как в Expo Go: из канала `preview` после каждого влития в `main`. Закрыть OCTODEX и открыть **два раза**: первый раз скачивается, второй — показывается.
- Новая сборка нужна, только если Claude скажет «нужна новая сборка» (появился новый нативный модуль). Тогда с телефона:
  1. https://github.com/iBonpoc/OCTODEX/actions → слева **EAS build** → справа **Run workflow**.
  2. **Which phone** → `ios`, галочка **send to TestFlight** → **Run workflow**.
  3. Через 20–40 минут — письмо TestFlight, обновить OCTODEX в TestFlight.
- В GitHub для этого нужен только секрет `EXPO_TOKEN`, он уже есть. Ключи Apple в GitHub **не нужны и не кладутся**: они хранятся в Expo.

### 5.5. Что знать
- **Expo Go больше не получает изменения** (его SDK старее нашего, 14.11.2026). Основное приложение теперь OCTODEX из TestFlight. Пуши приходят только в него.
- Сборка в TestFlight живёт 90 дней. Обновлять её — кнопкой (5.4).
- Ключ пушей Apple один на аккаунт, всего их можно 2. **Не отзывать** его на developer.apple.com, иначе пуши перестанут приходить всем.
- Проверка пушей: OCTODEX → «Ещё» → «Настройки приложения» → «Уведомления» (в сборке 1.0.0 (2) — «Мои настройки») → переключатель → **Разрешить**. Если вместо переключателя написано про Expo Go, напишите руководителю.
- Если `npm run ios:first` остановился с ошибкой, скопируйте **последние строки ошибки** руководителю. Перед отправкой проверьте, что в них нет пароля.

## 6. Пуши: отправка с сервера (один раз, после влития P3)
Сервер раз в минуту отправляет пуши через функцию `send-push`. Пока шагов ниже нет, он молчит, приложение работает как раньше. Ключи вставляются **только в поля Supabase и Expo**, не в чат и не в код. Подробности — `docs/specs/27-push.md` §4.5.

1. **Ключ функции.** На Mac откройте «Терминал» и выполните `openssl rand -hex 32`. Скопируйте строку из 64 символов. Это ключ функции, он нужен в шагах 3 и 4.
2. **Токен Expo.** expo.dev → значок аккаунта → **Account settings** → **Access tokens** → **Create token**, имя `send-push`. Скопируйте токен (он показывается один раз).
3. **Секреты функции.** Supabase → **Edge Functions** → **Secrets** → **Add new secret**, два раза:
   - `PUSH_FN_KEY` — ключ из шага 1;
   - `EXPO_ACCESS_TOKEN` — токен из шага 2.
4. **Адрес и ключ для расписания.** Supabase → **Integrations** → **Vault** (в старом меню: **Project Settings** → **Vault**) → **Secrets** → **Add new secret**, два раза:
   - имя `push_fn_url`, значение `https://kgiaxygsjkyiquhjbxdg.supabase.co/functions/v1/send-push`;
   - имя `push_fn_key`, значение — ключ из шага 1.
   Через SQL Editor ключ не вводить: запрос с ключом остаётся в его истории («Recent»).
5. **Защита пушей Expo.** expo.dev → **Account settings** → **Access tokens** → включите **Enhanced Security for Push Notifications**. Делать после шага 3: иначе пуши без токена будут отклонены.
6. **Проверка.** Supabase → **Edge Functions** → `send-push` → **Logs**: раз в минуту строка `send-push claimed=0 …`. Строка `unauthorized` значит, что ключ в шаге 3 и шаге 4 разный. Потом подпишите тестовую смету и через 1–2 минуты получите пуш «Estimate signed» на телефон со сборкой OCTODEX.

В Supabase → **Database** → **Extensions** у `pg_net` и `pg_cron` стоит «включено» — их включил выпуск сам. **Там ничего трогать не нужно**: не выключайте их и не меняйте права, иначе пуши перестанут уходить.

Сменить ключ: шаг 1 заново, в шаге 3 замените `PUSH_FN_KEY`, в шаге 4 откройте `push_fn_key` в Vault → **Edit** → новое значение. Оба значения должны совпадать.
Остановить отправку: `select cron.unschedule('send-push');` в SQL Editor (вернуть — напишите руководителю).

### 6.1. Первый пуш: проверка за 5 минут
Нужно: шаги 1–5 выше сделаны, OCTODEX из TestFlight (не Expo Go) на iPhone, вы вошли как владелец.
1. iPhone: OCTODEX → «Ещё» → **«Настройки приложения»** → «Уведомления» → включите переключатель → **Разрешить**. В сборке TestFlight 1.0.0 (2) экран ещё старый: «Ещё» → «Мои настройки» → «Уведомления».
2. Компьютер: Supabase → **Edge Functions** → `send-push` → **Logs** — раз в минуту строка `send-push claimed=0 …`. Нет строк — не сделан шаг 4; `unauthorized` — ключи в шагах 3 и 4 разные.
3. iPhone или компьютер: создайте смету на тестового клиента (цены — тестовые) и отправьте её клиенту — получите ссылку на страницу клиента.
4. Откройте эту ссылку в браузере компьютера и подпишите смету как клиент.
5. Сверните OCTODEX или заблокируйте iPhone. Через 1–2 минуты придёт пуш **«Estimate signed»**. Тап по нему откроет эту смету.

Если пуша нет — посмотрите строку в Logs после подписи и пришлите её руководителю (в ней только числа):
- `claimed=1 … sent=1` — Expo принял пуш: проверьте, что уведомления OCTODEX разрешены в настройках iPhone;
- `claimed=1 … failed=1` или `retry=1` — ошибка на стороне Expo или ключа `EXPO_ACCESS_TOKEN`;
- `claimed=0` — телефон не записан: выключите и снова включите переключатель из шага 1.
### 5.6. Если нет ключа пушей (Push Key)
Проверка: https://expo.dev/accounts/octodex-team/projects/octodex/credentials → **iOS** → `com.gorix.app` → строка **Push Key** (bundle id с 14.11, #656; у старого `com.octodex.app` свой ключ, он больше не нужен). Если там пусто — один раз на Mac:
1. Терминал → `cd ~/OCTODEX/apps/mobile`
2. `npx eas-cli@27.4.1 credentials -p ios`
3. **Which build profile?** — стрелками ↓ выбрать `testflight` → `Return`.
4. **What do you want to do?** — стрелками выбрать строку со словами **Push Notifications** → `Return`, затем **Set up your project to use Push Notifications** → `Return`.
5. Вход в Apple: `Y` → Apple ID (**вся почта**) → пароль → код с iPhone. **Только в Терминал.**
6. **Generate a new Apple Push Notifications service key?** → `Return` (Yes).
7. Появится «Push Key assigned» — готово. Выйти: стрелками **Exit** → `Return`.
Новая сборка для этого не нужна: ключ используется сервером при отправке пуша.

## 7. Адреса GoRix: что настроено руками 14.11.2026 (#656)
Сделано основателем в своих аккаунтах (через чат на Mac), в репозитории этого не видно:

| Где | Что стоит | Зачем |
|---|---|---|
| Expo → проект → Hosting | поддомен `gorix` → сайт `https://gorix.expo.app` | адрес сайта приложения. **Expo даёт сменить поддомен всего 3 раза, одна смена израсходована; старое имя `octodex` вернуть нельзя.** Без отдельной причины не менять |
| Cloudflare → зона `gorix.app` → DNS | `AAAA @ → 100::` и `AAAA www → 100::`, прокси включён | записи-заглушки: сами никуда не ведут, нужны только для правила переадресации |
| Cloudflare → зона `gorix.app` → Rules → Redirect Rules | правило «gorix.app to app»: `gorix.app` и `www.gorix.app` → `https://gorix.expo.app` + тот же путь, код 302, параметры запроса сохраняются | человек набирает `gorix.app` — открывается приложение. 302 (временная): после 1.0 сайт переедет на сам `gorix.app` (#641), правило снимается |
| Cloudflare → зона `gorix.app` → DNS | 3 записи MX, TXT DKIM (`cf2024-1._domainkey`), TXT SPF | почта `hello@gorix.app` (Email Routing). **Не трогать** |
| Supabase → Authentication → URL Configuration | Site URL `https://gorix.expo.app`; Redirect URLs: `https://gorix.expo.app/**` (один адрес) | куда ведут ссылки из писем входа. До 14.11 Site URL был `http://localhost:3000`, список был пуст |
| Apple Developer → Identifiers | `com.gorix.app` (Explicit, Push Notifications) | идентификатор приложения GoRix |
| App Store Connect | запись «GoRix: Contractor CRM», Apple ID `6834689554`, SKU `gorix-ios` | новая запись приложения; старая «OCTODEX (ea2bef)» не удалена — убрать после того, как сборка GoRix встанет на iPhone |

Не настроено (нужно до запуска соответствующей функции):
- **Cloudflare Turnstile** — в аккаунте нет ни одного виджета; капча формы заявок `/f/` не работает (#1445). При создании виджета hostname — `gorix.expo.app`.
- **Stripe** — рабочий режим не настроен, список Payment method domains пуст (оплата — версия 1.1).

Адреса для записи App Store (политика, условия) — существующие страницы приложения `https://gorix.expo.app/legal/…`; отдельные короткие маршруты `/privacy`, `/support` не заводим (решение аудита 14.11).
