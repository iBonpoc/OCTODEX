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
1. Apple Developer Program ($99/год): https://developer.apple.com/programs/enroll/
2. После одобрения: ключ App Store Connect API (https://appstoreconnect.apple.com/access/integrations/api → «+», доступ Admin) — передать Claude файл `.p8`, Key ID, Issuer ID и Team ID (https://developer.apple.com/account → Membership).
3. Токен Expo: https://expo.dev/settings/access-tokens → Create token → передать Claude.
4. Claude настраивает сертификаты, собирает iOS и отправляет в TestFlight. Вы ставите приложение **TestFlight** из App Store и устанавливаете OCTODEX.
