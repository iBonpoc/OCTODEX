# Испытательный стенд GoRix на Mac (iPhone-симулятор)

Дата записи: 2026-11-20. Всё лежит внутри ~/GoRix. Пароли и входы не нужны, приложение работает в демо-режиме.

## Что поставлено

| Что | Версия | Откуда / команда |
|---|---|---|
| macOS | 26.6, Apple Silicon (arm64) | системная |
| Xcode | 27.2 (27B52), лицензия принята | App Store |
| Платформа iOS для симулятора | 27.2 | Xcode → Settings → Components |
| Симулятор | iPhone 17 (UDID 15597753-E436-4AEC-B096-3D52658CDB69) | входит в iOS 27.2 |
| Node.js | v26.13.0 (проект проверяют на Node 22, сбоев не было) | уже стоял |
| git | 2.54.0 | уже стоял |
| Проект | OCTODEX, ~/GoRix/OCTODEX | `git clone https://github.com/iBonpoc/OCTODEX` |
| Зависимости проекта | 631 пакет | `cd ~/GoRix/OCTODEX && npm install` |
| mise (менеджер версий) | 2026.11.10 | скачан в ~/GoRix/tools/bin/mise (с mise.jdx.dev) |
| Ruby | 3.4.13 (готовая сборка) | `MISE_DATA_DIR=~/GoRix/tools/data MISE_CONFIG_DIR=~/GoRix/tools/config ~/GoRix/tools/bin/mise use --global ruby@3.4` (в mise включено `ruby.compile=false`) |
| CocoaPods | 1.17.0 | `GEM_HOME=~/GoRix/tools/gems gem install cocoapods --no-document` (под Ruby 3.4) |

Не нужны и не ставились: Homebrew, Java. Системный Ruby 2.6 слишком старый для CocoaPods, поэтому нужен свой Ruby (выше).

## Как запустить с нуля

Одна команда сборки и запуска (первая сборка ~3 минуты, потом быстрее):

```bash
T=~/GoRix/tools
RB=$(MISE_DATA_DIR=$T/data MISE_CONFIG_DIR=$T/config $T/bin/mise where ruby@3.4)/bin
cd ~/GoRix/OCTODEX/apps/mobile
PATH="$RB:$T/gems/bin:$PATH" GEM_HOME=$T/gems LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
  npx expo run:ios --device "iPhone 17"
```

Что происходит: Expo создаёт папку `apps/mobile/ios`, ставит iOS-библиотеки (pod install), собирает приложение, запускает Metro на порту 8081 и открывает приложение com.gorix.app на iPhone 17.

Если приложение уже собрано, достаточно запустить только Metro (быстро):

```bash
cd ~/GoRix/OCTODEX/apps/mobile && npx expo start --dev-client
```

и открыть приложение в симуляторе: `xcrun simctl launch booted com.gorix.app`.

## Как обновить до свежего main

```bash
cd ~/GoRix/OCTODEX
git stash                 # убрать локальные правки prebuild (см. ниже)
git pull origin main
git stash pop             # вернуть их; при конфликте: git checkout -- apps/mobile/package.json apps/mobile/tsconfig.json и пересобрать
npm install               # если менялся package-lock.json
```

Когда нужна пересборка (`npx expo run:ios ...` из блока выше): если менялись нативные зависимости в `apps/mobile/package.json`, `app.json` или `app.config.ts`. Если менялся только код в `src/`, пересборка НЕ нужна: достаточно перезагрузить приложение (Metro подхватит сам, или нажать `r` в окне Metro).

## Что prebuild меняет в проекте (не откатывать и не коммитить)

`npx expo run:ios` при первой сборке сам правит два файла и создаёт папку:
- `apps/mobile/package.json` (изменён)
- `apps/mobile/tsconfig.json` (изменён)
- `apps/mobile/ios/` (создана, сгенерирована, это не код проекта)

Это особенность стенда. Код проекта вручную не менялся. Перед `git pull` делать `git stash`, после `git stash pop`.

## Как включить модуль Gutters в демо

В демо-компании модуль Gutters выключен, поэтому кнопки «Замер gutter» нет. Включение: Ещё → Настройки компании → (прокрутить вниз) Модули → «Водостоки (Gutters)» → «Подключить — 7 дней бесплатно». Пробный период действует только в демо-данных на этом устройстве, деньги не списываются. После этого в нижней панели появляется вкладка «Gutters». Данные демо хранятся на устройстве: после стирания симулятора включать заново.

## Работа с симулятором (инструменты)

- Встроенный инструмент Claude `control`: `attach` (панель), `screenshot`, `tap`, `swipe`, `text`, `press_key`, `touch_path`, `touch2_path` (щипок), `set_appearance`, `rotate`, `open_url`. Координаты касаний в пунктах: 402×874 (скриншот в файле 1206×2622: делить на 3).
- Снимок в файл: `xcrun simctl io booted screenshot ~/GoRix/shots/имя.png`
- Видео: `xcrun simctl io booted recordVideo --codec h264 --force ~/GoRix/shots/имя.mp4 &`, остановить: `kill -INT <pid>`.
- Если после касания экран ещё меняется (переход), подождать 1–2 секунды и снять ещё раз.
- Предупреждение «Open debugger to view warnings» в dev-сборке: это не ошибка приложения, закрывается крестиком (кнопка внизу справа, около x=370 y=812).

## Находки при работе со стендом

- **Клавиатура симулятора на русской раскладке.** Инструмент `text` печатает «как с английской клавиатуры»: «Test» превращается в «Еуые», «NoAddress» в «ТщФввкуыы». Цифры и телефоны вводятся нормально. Для латиницы переключить раскладку в симуляторе (Settings → General → Keyboard) или принять кириллицу в тестовых именах.
- **Форма «＋ Клиент» требует адрес или город** (правило в `src/app/client/edit.tsx`, переменная `ok`): без них кнопка «Создать клиента» бледная и не нажимается. Поэтому клиента совсем без адреса через эту форму создать нельзя. Если указан только город, создаётся объект без улицы (проверено: CLT-0008, объект «Туые»).
- **В демо у всех 7 клиентов есть адрес** (seed: `src/data/seed.ts`); у Sarah Mitchell (CLT-0001) два адреса (1420 Oak Grove Ave и 88 Rosemont Ave): подходит для проверки «второй адрес / шторка выбора».
- В демо-данных (на устройстве) добавлен тестовый клиент CLT-0008 «Еуые ТщФввкуыы».

## Правила стенда

Только внутри ~/GoRix; пароли и входы не вводить; только демо-данные; код проекта не менять; без git push и без задач на GitHub; «работает» писать только по снимку или видео, которые смотрел сам.

## Как проверить ветку запроса на слияние (PR) без полной пересборки

Пример для PR №N (подставить номер). Всё из `~/GoRix/OCTODEX`.

```bash
cd ~/GoRix/OCTODEX
git stash                                  # убрать правки prebuild (package.json, tsconfig.json)
git fetch origin pull/N/head:pr-N          # скачать ветку PR в локальную ветку pr-N
git checkout pr-N
git stash pop                              # вернуть правки prebuild; при конфликте: git checkout -- apps/mobile/package.json apps/mobile/tsconfig.json
git diff --name-only main...pr-N | grep -E 'package(-lock)?\.json|app\.json|app\.config' \
  && echo "НУЖНА пересборка" || echo "пересборка не нужна"
```

- Пересборка (`npx expo run:ios ...` из блока «Как запустить с нуля») нужна, только если PR меняет нативные зависимости (`apps/mobile/package.json`, `package-lock.json`) или `app.json` / `app.config.ts`. Если `package-lock.json` менялся, сначала `npm install`.
- Иначе (меняется только код `src/`) достаточно перезапустить Metro с очисткой кеша и перезапустить приложение:
  ```bash
  # в окне, где запущен Metro: Ctrl+C, затем
  cd ~/GoRix/OCTODEX/apps/mobile && npx expo start --dev-client --clear
  xcrun simctl terminate booted com.gorix.app; xcrun simctl launch booted com.gorix.app
  ```
  Если Metro уже работает и его не перезапускать, хватает перезапуска приложения: Metro сам подхватит переключённые файлы (но `--clear` надёжнее после смены ветки).
- Вернуться на main: `git stash && git checkout main && git stash pop` (ветку pr-N можно удалить: `git branch -D pr-N`).
- Если правка уже влита в main (`git log --oneline main | grep '#N'`), проверять на main.
- **Ветки PR часто отстают от main** (20.11.2026: #2278/#2260/#2196 на 14–62 коммита, #1685 на 257), в них старые `expo`/`expo-router` и нет шрифта, добавленного в main, а приложение собрано из main. Надёжнее проверять «как будет после влития»: локальная ветка от main + слияние PR (только локально, без push):
  ```bash
  git stash push -m stand-prebuild apps/mobile/package.json apps/mobile/tsconfig.json
  git checkout -b test-N origin/main
  git -c user.name=stand -c user.email=stand@localhost merge --no-edit pr-N   # конфликт → git merge --abort и проверять pr-N как есть, сказав об этом
  # ... проверка ...
  git checkout main && git stash pop
  ```
  Нужна ли пересборка, смотреть так: `git diff --stat origin/main pr-N -- apps/mobile/package.json apps/mobile/app.json apps/mobile/app.config.ts` (если там только откат версий из-за отставания ветки, при слиянии с main берётся версия main, пересборка не нужна).
- Перезапуск приложения без Metro-окна: `xcrun simctl terminate <UDID> com.gorix.app; xcrun simctl openurl <UDID> "com.gorix.app://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`. После этого может открыться экран «Вход в GoRix»: жать «Посмотреть без входа» (демо), не входить. Демо-данные (модуль Gutters, CLT-0008) при этом сохраняются.

## Кадры из видео без ffmpeg

ffmpeg не установлен. Свои маленькие утилиты (собраны встроенным `xcrun swiftc`, ничего не ставилось), лежат в `~/GoRix/tools/scripts/`:
- `frames <видео.mp4> <папка> <кадров_в_сек> [ширина]`: нарезать кадры в JPEG (имя содержит время).
- `sheet --diff <кадры...>`: насколько каждый кадр отличается от предыдущего (найти переходы и мелькания).
- `sheet <out.jpg> <столбцов> <кадры...>`: лист-раскладка кадров с подписями.

Ещё один вариант (скрипт, без сборки): `swift ~/GoRix/tools/frames.swift <видео> <папка> <шаг_сек> [начало] [конец] [ширина]`, кадры точно по времени. Быстрый поиск переходов: нарезать раз в 0,5–1 с при ширине 300 и смотреть размеры JPEG (`stat -f %z`): пустой экран заметно «легче» соседних кадров. Пример: калибровка `~/GoRix/shots/calibration.md`.

## Один симулятор на несколько чатов

Перед касаниями проверить, не пишет ли кто-то ещё видео: `pgrep -fl recordVideo`. Если пишет, симулятором управляет другой чат: не трогать, договориться.

## Второй симулятор (чтобы два чата не мешали друг другу)

Второй испытатель работает на **iPhone 17e** (UDID `94BAC059-8D57-4098-84F2-F2312320B12F`, экран 390×844 пт, меньше, чем у iPhone 17). Первый испытатель на iPhone 17 (`15597753-…`).

```bash
U=94BAC059-8D57-4098-84F2-F2312320B12F
xcrun simctl boot $U && xcrun simctl bootstatus $U -b
# установить уже собранное приложение, без пересборки:
xcrun simctl install $U ~/Library/Developer/Xcode/DerivedData/GoRix-dscadvsvhauncphivwpwopfqyzrz/Build/Products/Debug-iphonesimulator/GoRix.app
xcrun simctl launch $U com.gorix.app        # само подключается к Metro 8081
```

- Все команды адресовать по UDID, **никогда `booted`** (когда запущены два симулятора, `booted` берёт любой): `xcrun simctl io $U screenshot …`, `xcrun simctl io $U recordVideo …`. Встроенный инструмент `control`: параметр `device: "<UDID>"`.
- Оба симулятора берут код из **одного** Metro, значит, из одной рабочей копии `~/GoRix/OCTODEX`. Кто переключает ветку, меняет код у обоих: переключать только по договорённости.
- Демо-данные у каждого устройства свои: на новом устройстве модуль Gutters нужно включить заново (см. выше).

## ПРАВИЛО СТЕНДА: один чат — своя копия кода, свой порт Metro, свой симулятор по UDID

| Чат | Рабочая копия | Metro | Симулятор |
|---|---|---|---|
| испытатель 1 (gorix-1f) | `~/GoRix/OCTODEX` | 8081 | iPhone 17 `15597753-E436-4AEC-B096-3D52658CDB69` |
| испытатель 2 (gorix-8e) | `~/GoRix/tester` (git worktree) | 8082 | iPhone 17e `94BAC059-8D57-4098-84F2-F2312320B12F` |

Как сделана вторая связка (без пересборки и без `npm install`):

```bash
# 1. своя рабочая копия на origin/main
cd ~/GoRix/OCTODEX && git fetch origin main && git worktree add --detach ~/GoRix/tester origin/main
# 2. зависимости: APFS-клон node_modules (копирование при записи: ~6 с, почти не занимает места)
O=~/GoRix/OCTODEX; cd ~/GoRix/tester
cp -c -R $O/node_modules ./node_modules
for p in packages/design-tokens packages/estimating-engine; do cp -c -R $O/$p/node_modules ./$p/node_modules; done
# 3. свой Metro на 8082 (держать запущенным; лог: ~/GoRix/shots/metro8082.log)
cd ~/GoRix/tester/apps/mobile && nohup npx expo start --dev-client --port 8082 > ~/GoRix/shots/metro8082.log 2>&1 &
# 4. порт Metro ЗАШИТ в сборку (Info.plist → RCTMetroPort=8081; expo-dev-client в проекте нет,
#    поэтому ссылки expo-development-client и defaults RCT_jsLocation не помогают).
#    Копия готовой сборки с портом 8082, локальная подпись, установка только на свой симулятор:
U=94BAC059-8D57-4098-84F2-F2312320B12F; D=~/GoRix/tools/app8082; mkdir -p $D
cp -c -R ~/Library/Developer/Xcode/DerivedData/GoRix-*/Build/Products/Debug-iphonesimulator/GoRix.app $D/
plutil -replace RCTMetroPort -string 8082 $D/GoRix.app/Info.plist
codesign -f -s - --deep $D/GoRix.app
xcrun simctl install $U $D/GoRix.app && xcrun simctl launch $U com.gorix.app
# проверка: lsof -nP -iTCP -sTCP:ESTABLISHED | grep '^GoRix'   → у своего процесса порт :8082
```

- Ветку PR проверять в СВОЕЙ копии: `cd ~/GoRix/tester && git fetch origin pull/N/head:pr-N && git checkout --detach origin/main && git merge --no-edit pr-N` (слияние с main: ветки PR отстают). Перезапустить приложение на своём UDID. Возврат: `git checkout --detach origin/main`.
- Чужую копию, чужой Metro и чужой симулятор не трогать. `git stash` в worktree общий с основной копией: не использовать.
- Если пересобрали приложение (`expo run:ios`), шаг 4 повторить: новая сборка снова будет на 8081.

## Известное ограничение инструмента: щипок

Двухпальцевый жест инструмента `control` (`touch2_path`) холст Gutters не масштабирует. После таких попыток приложение может перестать отвечать на касания, пока его не перезапустишь (`xcrun simctl terminate/launch`). Это ограничение инструмента, а не дефект приложения. Масштаб чертежа проверять руками: в Simulator.app щипок мышью с зажатым Option. Или на реальном iPhone.

## Кто чем занят на стенде (21.11)

- iPhone 17e + Metro 8082 + `~/GoRix/tester` — испытатель (gorix-8e).
- Симулятор «GoRix — новый дизайн» + порт 8090 — руководитель разработки №21 (ветка редизайна). Не трогать.
- Почтовый ящик чатов — задача GitHub #2337 «0000 — Почта аудита». Писать комментарием, если напрямую не доходит: `~/GoRix/tools/bin/gh issue comment 2337 -R iBonpoc/OCTODEX --body-file <файл>` (gh уже вошёл).
