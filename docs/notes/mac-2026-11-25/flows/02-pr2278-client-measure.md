# Сценарий 02. Проверка #2278 «Замер gutter» с карточки клиента

Правка: https://github.com/iBonpoc/OCTODEX/pull/2278 (ветка gutters27/2271-client-measure-direct).
Ожидается: один адрес → сразу холст, «назад» на клиента; несколько адресов → шторка выбора, один плавный переход; нет адреса → строка «У клиента нет адреса…».
Поломка: пустой экран, мелькание, второй рывок.

## Подготовка

1. Код: локальное слияние main + PR (см. STAND.md, «Как проверить ветку PR»):
   `git stash push -m stand-prebuild apps/mobile/package.json apps/mobile/tsconfig.json && git fetch origin pull/2278/head:pr-2278 && git checkout -b test-2278 origin/main && git -c user.name=stand -c user.email=stand@localhost merge --no-edit pr-2278`
   Если PR уже влит в main — просто main.
2. Перезапустить приложение (команда openurl из STAND.md), при экране входа — «Посмотреть без входа».
3. Модуль Gutters включён (Ещё → Настройки компании → Модули).

## Шаги (iPhone 17, пункты 402×874)

1. Запись: `xcrun simctl io <UDID> recordVideo --codec h264 --force ~/GoRix/shots/pr2278.mp4 &`
2. Клиенты → David Kim → «Замер gutter» → подождать 2 с → «назад» (30, 87).
3. Клиенты → прокрутить вниз → Sarah Mitchell → «Замер gutter» → шторка «Для какого адреса замер?» → первый адрес → холст → «назад».
4. Клиенты → вверх → CLT-0008 (только город) → «Замер gutter» → «назад».
5. Остановить запись (`kill -INT <pid>`).
6. Кадры: `swift ~/GoRix/tools/frames.swift pr2278.mp4 out 0.5 0 999 200`, найти переходы по размеру файлов; затем шаг 0,05 с вокруг каждого (ширина 300). Пустой экран — кадры заметно меньше (~16 КБ против ~25 КБ у холста при ширине 300).
7. Вернуть рабочую копию: `git checkout main && git stash pop`.

## Результат 20.11.2026

Один адрес и два адреса: работает (пустого экрана нет). Без адреса: не смог проверить (нет такого клиента в демо, форма не даёт создать). Страница: https://claude.ai/artifact/QPTFa2zzqQS8VuJ589epoH
