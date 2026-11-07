# 30. iPhone: своя сборка через TestFlight

Шаг 25 плана §0 («Подготовка к App Store»), часть «EAS submit / TestFlight». Чат «Выпуск iOS (TestFlight)» №1, 07.11.2026. Этап 0 принят руководителем 07.11 (вариант А, без 4 секретов Apple, ios --no-wait).

## 1. Зачем
- Пуши на iPhone работают только в своей сборке, не в Expo Go (спека 27 §2).
- Своя сборка в TestFlight — тот же путь, что потом в App Store.
- Основатель работает с телефона. Значит, каждый его шаг — кнопка в Safari, а не терминал.

## 2. Опоры
| Опора | Что сказано |
|---|---|
| `.github/workflows/eas-build.yml` (#275) | ручной запуск; ios — профиль `testflight`, `--non-interactive`, 4 секрета Apple; первая сборка «регистрирует bundle id и сертификаты» |
| `apps/mobile/eas.json` | `testflight` extends `production`, channel `preview`; submit.testflight — ключ из `$EXPO_ASC_*` |
| `apps/mobile/app.json` | bundle id `com.octodex.app`; тексты камеры, фото, геопозиции EN + locales RU/ES; `ITSAppUsesNonExemptEncryption: false`; `runtimeVersion.policy: sdkVersion`; нет `privacyManifests`, нет splash |
| `release.yml` | `eas update --channel preview --platform all`, eas-cli 27.4.1 |
| спека 27 §2 (#272) | «ключ APNs EAS создаёт при первой сборке» |
| спека 14 §4, §10 | тексты разрешений; App Privacy заполняется в App Store Connect |
| `docs/11-setup-guide.md` §5 | «передать Claude файл .p8, Key ID, Issuer ID, Team ID; токен Expo» |
| задание руководителя 07.11 | 4 секрета → первая сборка без submit → приложение в ASC → ascAppId → сборка с submit; риск APNs |

Проверено по коду eas-cli **27.4.1** (`npm pack`, `build/credentials/ios/**`), а не по памяти.

## 3. Оспаривание
| № | Утверждение | Откуда | Ответ | Почему (доказательство) | Что меняем и где |
|---|---|---|---|---|---|
| 1 | Первая сборка `--non-interactive` с 4 секретами сама создаст сертификат и профиль | eas-build.yml, задание п.2 | **опровергаем** | `SetUpDistributionCertificate.runNonInteractiveAsync`: нет сертификата → `MissingCredentialsNonInteractiveError` («Run this command again in interactive mode»). Без интерактива сертификат дистрибуции не создаётся никогда | один раз — интерактивный запуск (§4); workflow пишет понятную ошибку, если учётных данных нет |
| 2 | Ключ APNs EAS создаст при первой сборке | спека 27 §2, задание (риск) | **опровергаем** | `IosCredentialsProvider.getPushKeyAsync`: при `nonInteractive` → `return null` (молча, без пушей). `appstore/pushKey.js`: «Does not support App Store Connect API (CI)» — ключ пушей делается только входом Apple ID | ключ APNs — в том же интерактивном запуске; правка спеки 27 §2 — сообщением чату пушей |
| 3 | Запасной путь — `eas credentials` с компьютера основателя | задание | **подтверждаем** (решено 07.11) | у основателя MacBook Pro M5 с Xcode. Все вопросы eas-cli отвечаются Enter и текстом (Apple ID, пароль, код 2FA) | основной путь — `npm run ios:first` в Терминале Mac; запасной — GitHub Codespaces |
| 4 | Нужны 4 секрета Apple в GitHub (ключ .p8 и т. д.) | eas-build.yml, задание п.1, 11-setup §5 | **опровергаем** | интерактивный `eas submit` под Apple ID сам создаёт ключ App Store Connect и хранит его в EAS (`SetUpAscApiKey`, `CreateAscApiKey`); дальше `submit` без полей ключа в eas.json берёт его из EAS (`resolveAscApiKeySource → credentialsService`), профиль чинится ключом из EAS (`tryAuthenticateAppStoreWithEasAscApiKeyAsync`). Основатель не держит в руках .p8, в GitHub — только `EXPO_TOKEN` | убрать 4 секрета и `apple_team_type` из workflow, поля ключа из `eas.json`; сторож: в workflow и eas.json нет `EXPO_ASC_*`/`.p8` |
| 5 | Приложение в App Store Connect основатель создаёт руками | задание п.3 | **оспариваем** | интерактивный `eas submit` под Apple ID создаёт приложение и группу TestFlight (`AppProduce.createAppStoreConnectAppAsync`, `ensureTestFlightGroupExistsAsync`). Руками — запасной путь (имя «OCTODEX» может быть занято в App Store; запасное — «GoRix», решение основателя 07.11) | в инструкции: создаётся само; руками — если имя занято |
| 6 | `ascAppId` нужен в eas.json для кнопки в Actions | задание п.4 | **подтверждаем** | без него неинтерактивный submit не знает приложение | основатель присылает число (Apple ID приложения, не секрет) → PR в eas.json; сторож: `ascAppId` — только цифры |
| 7 | `ios_submit` ждёт конец сборки (до 90 мин раннера) | eas-build.yml | **опровергаем** | `runBuildAndSubmit.js`: отправка в TestFlight ставится на сервере EAS сразу после старта сборки, до `wait`. С `--no-wait` задача Actions заканчивается за минуты, очередь EAS бесплатного плана её не обрывает | `--no-wait` и для ios |
| 8 | Сборка получает обновления из канала `preview`, как Expo Go | eas-build.yml, задание | **подтверждаем** | профиль `channel: preview`; `runtimeVersion: sdkVersion` → `exposdk:58.0.0`, тот же, что у обновлений `release.yml` (`--platform all`) | сторож уже есть; добавить: `expo-updates` в зависимостях, `updates.url` = projectId |
| 9 | `runtimeVersion: sdkVersion` безопасен для своей сборки | app.json | **оспариваем** | обновление, где появился новый нативный модуль (не в сборке), упадёт в сборке, а в Expo Go — нет. Сменить на `fingerprint` нельзя, пока живёт Expo Go: он берёт только `exposdk:*` | оставить `sdkVersion`, пока есть Expo Go; сторож: список нативных модулей зафиксирован, новый модуль → тест падает с текстом «нужна новая сборка TestFlight». Смена политики — решение руководителя после отказа от Expo Go |
| 10 | Тексты разрешений есть (камера, фото, геопозиция) | app.json, спека 14 §4 | **подтверждаем**, но есть дыры | плагин `expo-image-picker` без `microphonePermission: false` добавляет в сборку общий текст микрофона («Allow $(PRODUCT_NAME)…»); видео мы не снимаем (`mediaTypes: ["images"]`, камера только фото). Для App Store это риск отказа 5.1.1 | `microphonePermission: false`; сторож: нет `NSMicrophoneUsageDescription` |
| 10а | Плагин геопозиции даёт только наш текст | app.json | **опровергаем** | `expo config --type introspect`: плагин `expo-location` дописывает `NSLocationAlways…`, `NSMotionUsageDescription` и `NSLocationTemporaryUsageDescriptionDictionary` с текстами «Allow $(PRODUCT_NAME)…». Фон, движение и временную точность мы не используем | `motionUsagePermission: false` и `locationFullAccuracyPermission: false` (CoreMotion уходит из сборки). Ключи Always Apple ищет по коду (ITMS-90683), поэтому они остаются с честным текстом «никогда в фоне», EN/RU/ES в `locales/*`. Сторож: в app.json нет `$(PRODUCT_NAME)` |
| 11 | Шифрование: вопрос экспорта в TestFlight не всплывёт | app.json | **подтверждаем** | `ITSAppUsesNonExemptEncryption: false` и `ios.config.usesNonExemptEncryption: false`; свой шифр не используем (HTTPS и `expo-crypto` — освобождены) | сторож на оба ключа |
| 12 | PrivacyInfo не нужен для TestFlight | план §0 «осталось: PrivacyInfo» | **оспариваем** | для внутреннего TestFlight Apple только пишет письмо ITMS-91053; для App Store — отказ. Документация Expo: Apple не всегда читает PrivacyInfo из статических CocoaPods → причины нужно собрать в `ios.privacyManifests` | `ios.privacyManifests`: `NSPrivacyTracking: false`, причины API — объединение `PrivacyInfo.xcprivacy` установленных пакетов; сторож сверяет с `node_modules` |
| 13 | Иконка годится для App Store | app.json | **подтверждаем** | `assets/icon.png` 1024×1024, RGB без альфа-канала (иначе ITMS-90717) | сторож: размер и тип PNG |
| 14 | Нужен splash | — | **оспариваем** | splash не задан → белый экран на долю секунды (в тёмной теме — вспышка). Для TestFlight не мешает; `expo-splash-screen` — новая зависимость (правило 17) | не в этом PR; отдельной задачей после первой сборки |
| 15 | После перехода Expo Go перестанет работать | задание | **опровергаем** | Expo Go и сборка берут одно и то же обновление (п.8). Expo Go остаётся для команды и проверки; пуши — только в сборке | инструкция: два значка, OCTODEX из TestFlight — основной |
| 16 | 11-setup §5: «передать Claude .p8, Key ID…, токен Expo» | 11-setup-guide §5 | **опровергаем** | нарушает правило безопасности задания: ключи и пароли — никогда в чат | раздел переписать: всё вводит основатель сам, только в Терминал Mac (и expo.dev) |
| 17 | Номер сборки Apple — `autoIncrement`, `appVersionSource: remote` | eas.json | **подтверждаем** | EAS сам ведёт buildNumber; `BUILD` в version.ts — наш номер PR, их не путать | без изменений |
| 18 | Внутреннему тестированию нужна проверка Apple | — | **опровергаем** | внутренняя группа TestFlight (до 100 человек из команды App Store Connect) — без Beta Review; сборка живёт 90 дней | инструкция: группа «Internal», добавить себя |

Итого: подтверждаем 7, опровергаем 9, оспариваем 3.

## 4. Решение: путь основателя
**Один раз (≈30–40 мин, на Mac основателя):**
1. Терминал → `git clone https://github.com/iBonpoc/OCTODEX.git` (репозиторий публичный) → `cd OCTODEX/apps/mobile` → `npm run ios:first`. Скрипт: проверка Node ≥ 20 и `expo-notifications`, `npm ci`, вход в Expo, затем `eas build -p ios -e testflight --auto-submit-with-profile testflight` **без** `--non-interactive`; переменные `EXPO_ASC_*` сбрасываются, чтобы вход был по Apple ID.
2. На вопросы: войти в Apple — да; Apple ID, пароль, код с iPhone вводятся **только в Терминал**; остальное — Enter (сертификат, профиль, ключ пушей, ключ App Store Connect, приложение «OCTODEX», если занято — «GoRix»). Всё хранится в EAS, не в репозитории.
3. Через 20–40 мин письмо от TestFlight → установить OCTODEX. Число «Apple ID приложения» из App Store Connect → руководителю → PR `ascAppId`.

**Дальше всегда:** Actions → «EAS build» → ios, `ios_submit` → Run. В GitHub нужен только `EXPO_TOKEN`. JS-изменения приходят сами из канала `preview`; новая сборка — только при новом нативном модуле (сторож п.9).

Запасной путь — тот же скрипт в GitHub Codespaces.

## 5. Варианты
| Вариант | Плюсы | Минусы |
|---|---|---|
| А. Один интерактивный запуск на Mac + кнопка Actions с `EXPO_TOKEN` (**рекомендую**) | основатель не трогает .p8; пуши настраиваются сразу; меньше секретов | один раз Терминал на Mac |
| Б. 4 секрета Apple + Actions (как в #275) | всё кнопкой | **не работает**: п.1–2; плюс ключ .p8 через руки основателя |
| В. 4 секрета + ключ APNs и сертификат руками на developer.apple.com → загрузить на expo.dev | без терминала | сертификат .p12 без компьютера не сделать (нужен CSR); много шагов |

## 6. Стыки
- Шаг 18 «Пуши» (спека 27): ключ APNs (п.2) — условие P4 на iPhone. Сообщить чату пушей: правка 27 §2, порядок «сначала #278 в main, потом `ios:first`» (иначе eas-cli не спросит про пуши: `isExpoNotificationsInstalled`).
- `release.yml` → сборка: канал `preview`, runtime `exposdk:58.0.0` (п.8).
- Новых сущностей, статусов, прав и миграций нет. Карта §4–§5 не меняется.

## 7. Тесты (`apps/mobile/test/easBuild.test.ts`, модульные)
1. В workflow и `eas.json` нет `EXPO_ASC_*`, `.p8`, `BEGIN PRIVATE KEY`; есть только `secrets.EXPO_TOKEN`; ios — `--non-interactive --no-wait`.
2. `ios:first` — без `--non-interactive`, профиль `testflight`, eas-cli той же версии, что в `release.yml`.
3. `ascAppId` — нет или только цифры.
4. `channel: preview`, `runtimeVersion.policy: sdkVersion`, `updates.url` с `extra.eas.projectId`, `expo-updates` в зависимостях.
5. Нативные модули: список зафиксирован (новый → падение с подсказкой «новая сборка TestFlight»).
6. Шифрование — оба ключа `false`; нет `NSMicrophoneUsageDescription`, у image-picker `microphonePermission: false`; у location — честные тексты Always, без motion и временной точности; нигде нет `$(PRODUCT_NAME)`.
7. `privacyManifests`: `NSPrivacyTracking: false`; каждая причина из `node_modules/**/ios/PrivacyInfo.xcprivacy` есть в app.json (тест пропускается без `node_modules`).
8. Иконка 1024×1024, без альфа-канала.

e2e не нужны: экраны не меняются.

## 8. PR и файлы
- **PR 1** (этот чат): `eas.json`, `eas-build.yml`, `app.json` (ios: `privacyManifests`; плагины image-picker и location: тексты разрешений), `locales/*.json` (тексты Always), `package.json` приложения (скрипт `ios:first` — строка в scripts), `scripts/ios-first-build.sh`, `test/easBuild.test.ts`, `docs/11-setup-guide.md` §5, эта спека, `version.ts` (BUILD). Вливать **после #278**.
- **PR 2** (после ответа основателя): `ascAppId` в eas.json.
- Не в этом шаге: splash (п.14), смена `runtimeVersion` (п.9), App Privacy в App Store Connect и скриншоты (спека 14 §10).

## 9. Первый запуск (07.11.2026)
- `npm run ios:first` на Mac основателя прошёл: bundle id зарегистрирован, сертификат и профиль созданы, ключ App Store Connect «[Expo] EAS Submit» (ADMIN) хранится в EAS, группа TestFlight «Team (Expo)».
- Имя «OCTODEX» в App Store занято → Apple ID приложения **6831904411**, имя в App Store Connect «OCTODEX (ea2bef)» (поменять до публикации; на iPhone под иконкой — OCTODEX из app.json). Сборка 1.0.0 (2) отправлена в TestFlight.
- `ascAppId` = 6831904411 в `eas.json` → дальше Actions → «EAS build» → ios + ios_submit.
- Первая попытка упала, потому что в поле Apple ID ввели `y`. Подсказка в инструкции §5.2.
- **Задача основателя перед публикацией в App Store:** переименовать приложение в App Store Connect («OCTODEX (ea2bef)» → своё имя, запасное — GoRix). App Store Connect → приложение → App Information → Name. Пересборка не нужна.
- Ключ APNs: проверить на expo.dev → octodex → Credentials → iOS → com.octodex.app → Push Key. Если его нет — 11-setup §5.6 (`eas credentials` с Mac).
