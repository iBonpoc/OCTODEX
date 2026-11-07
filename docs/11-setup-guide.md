# Инструкция основателя: где что находится и что нажимать

## Ссылки
| Что | Ссылка |
|---|---|
| Сайт приложения (Expo Hosting, обновляется сам) | https://octodex.expo.app |
| Код (GitHub) | https://github.com/iBonpoc/OCTODEX |
| База данных (Supabase) | https://supabase.com/dashboard/project/kgiaxygsjkyiquhjbxdg |
| Сборки iPhone/Android (Expo) | https://expo.dev/accounts/octodex-team/projects/octodex |
| Хостинг (Cloudflare) | https://dash.cloudflare.com |

## 0. Приложение на iPhone через Expo Go (работает)
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
   - **Apple ID** — почта аккаунта Apple Developer;
   - **Password** — пароль Apple ID (буквы не видны при вводе, так и должно быть);
   - **код из 6 цифр** — придёт на iPhone, ввести в Терминал.
5. **Все остальные вопросы — просто `Return`.** Это согласие по умолчанию: создать сертификат, профиль, ключ пушей (Push Notifications → **Yes**), ключ App Store Connect, приложение в App Store Connect.
   - Если спросит имя приложения и скажет, что «OCTODEX» занято, ввести `GoRix` (решение основателя 07.11).
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
- **Expo Go остаётся** и работает как раньше: он получает те же изменения. Основное приложение теперь OCTODEX из TestFlight. Пуши приходят только в него.
- Сборка в TestFlight живёт 90 дней. Обновлять её — кнопкой (5.4).
- Ключ пушей Apple один на аккаунт, всего их можно 2. **Не отзывать** его на developer.apple.com, иначе пуши перестанут приходить всем.
- Проверка пушей: OCTODEX → «Ещё» → «Мои настройки» → «Уведомления» → переключатель → **Разрешить**. Если вместо переключателя написано про Expo Go, напишите руководителю.
- Если `npm run ios:first` остановился с ошибкой, скопируйте **последние строки ошибки** руководителю. Перед отправкой проверьте, что в них нет пароля.

## 6. Пуши: отправка с сервера (один раз, после влития P3)
Сервер раз в минуту отправляет пуши через функцию `send-push`. Пока шагов ниже нет, он молчит, приложение работает как раньше. Ключи вставляются **только в поля Supabase и Expo**, не в чат и не в код. Подробности — `docs/specs/27-push.md` §4.5.

1. **Ключ функции.** На Mac откройте «Терминал» и выполните `openssl rand -hex 32`. Скопируйте строку из 64 символов. Это ключ функции, он нужен в шагах 3 и 4.
2. **Токен Expo.** expo.dev → значок аккаунта → **Account settings** → **Access tokens** → **Create token**, имя `send-push`. Скопируйте токен (он показывается один раз).
3. **Секреты функции.** Supabase → **Edge Functions** → **Secrets** → **Add new secret**, два раза:
   - `PUSH_FN_KEY` — ключ из шага 1;
   - `EXPO_ACCESS_TOKEN` — токен из шага 2.
4. **Адрес и ключ для расписания.** Supabase → **SQL Editor** → **New query**, вставьте и замените `<ключ>` на ключ из шага 1:
   ```sql
   select vault.create_secret('https://kgiaxygsjkyiquhjbxdg.supabase.co/functions/v1/send-push', 'push_fn_url');
   select vault.create_secret('<ключ>', 'push_fn_key');
   ```
   **Run**. Запрос не сохраняйте: закройте вкладку без «Save».
5. **Защита пушей Expo.** expo.dev → **Account settings** → **Access tokens** → включите **Enhanced Security for Push Notifications**. Делать после шага 3: иначе пуши без токена будут отклонены.
6. **Проверка.** Supabase → **Edge Functions** → `send-push` → **Logs**: раз в минуту строка `send-push claimed=0 …`. Строка `unauthorized` значит, что ключ в шаге 3 и шаге 4 разный. Потом подпишите тестовую смету и через 1–2 минуты получите пуш «Estimate signed» на телефон со сборкой OCTODEX.

Сменить ключ: шаг 1 заново, в шаге 3 замените `PUSH_FN_KEY`, в шаге 4 выполните `select vault.update_secret((select id from vault.secrets where name = 'push_fn_key'), '<новый ключ>');`.
Остановить отправку: `select cron.unschedule('send-push');` в SQL Editor (вернуть — напишите руководителю).
