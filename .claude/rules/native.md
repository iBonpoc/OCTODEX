---
paths:
  - "apps/mobile/app.json"
  - "apps/mobile/app.config.ts"
  - "apps/mobile/eas.json"
  - ".github/workflows/eas-build.yml"
  - ".github/workflows/release.yml"
  - "apps/mobile/src/nav/**"
  - "apps/mobile/src/ui/**"
---
# Правила области: сборка, Expo и натив

Статус: действует · сверено 25.11.2026 · подгружается само, когда чат читает или правит настройки сборки, `src/nav/**` или `src/ui/**`.

Источник строк: `A` — `docs/ai/BOARD-archive.md`, `B` — `docs/ai/BOARD.md`, `L` — `docs/ai/LOG.md` (номер — строка); выписка — `docs/notes/2026-11-25-board-lessons.md` §5. Главное — `CLAUDE.md` правила 11 (номер сборки) и 27 (телефон — не браузер), `docs/ai/MAC.md`.

## Сборка и магазин
- `eas-cli --non-interactive` не создаёт сертификат и ключ APNs — первый запуск под Apple ID руками (A:262; L:141). В поле Apple ID — почта целиком (A:262).
- Плагины location и image-picker добавляют шаблонные тексты разрешений — проверять `expo config --type introspect` (A:262).
- Веб-сборка `output: single` не умеет заголовки по путям (A:131).
- После публикации основателю — «закрыть и открыть приложение» (B:74).

## Натив и навигация
- `Modal` на iPhone по умолчанию только портрет; на iPad без «экраном вниз» модалка переворачивает интерфейс (A:437; L:77–78). Новый `Modal` на iOS — только после `onDismiss` старого (A:770).
- `dismissTo` при `(tabs)` сверху стека ничего не делает — действие выбирать по стеку (`tabLeave`/`goAction`); стек в `useRootNavigationState` лежит под `__root` (A:239).
- `Screen` не может звать `usePathname` — путь передавать параметром (A:437).
- `useRef` у ScrollView — тип `ScrollViewInstance` (A:163). На вебе `uri` фото — `blob:` страницы (A:344).

## Модули и тесты
- `require.context` работает в Metro, в vitest — нет: модули подключать через `registerModule` (A:413).
- Модуль с импортами react-native не тянуть в vitest: чистые правила — в `*Rule.ts` без react-native (A:137, 401).
