# В. ИИ-помощник и сканеры — первоисточники (15.11.2026)

Вход к спецификации `docs/specs/43-ai-assistant.md`. Здесь только то, что открыто на странице-первоисточнике 15.11.2026, с дословной цитатой (английский — как на странице). Метки: **[проверено]** — цитата скопирована со страницы; **[не проверено]** — страница не открылась или текста нет, в решениях на это не опираемся; **[вывод]** — наше рассуждение.

Страницы читал помощник-сборщик (инструмент WebFetch); цитаты — из дословного текста страницы, не из пересказа. Возможны расхождения в знак-два из-за выгрузки. Перед отправкой в App Store и перед расчётом тарифа (направление Е) — открыть снова: правила Apple и цены меняются.

## 1. App Store Review Guidelines

Источник: https://developer.apple.com/app-store/review/guidelines/ — в подвале «Last Updated: October 16, 2026» (ссылка https://developer.apple.com/news/?id=92th7e5i, не открывали). **[проверено]**

| П. | Дословно (главное) | Что значит для нас [вывод] |
|---|---|---|
| 5.1.2(i) | "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." Там же: "Your app may not require users to enable system functionalities (such as push notifications, location services, tracking) in order to access functionality…" | Экран согласия **до первой** передачи данных в ИИ; явное «Разрешить»; без согласия приложение работает целиком, просто без ИИ. |
| 5.1.1(i) | "The privacy policy must clearly and explicitly: Identify what data, if any, the app/service collects… Confirm that any third party with whom an app shares user data… will provide the same or equal protection… Explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion of the user's data." | В политику: поставщик ИИ (Anthropic) как получатель, что уходит, срок хранения у него, как отозвать согласие. |
| 5.1.1(ii) | "Apps must also provide the customer with an easily accessible and understandable way to withdraw consent. Ensure your purpose strings clearly and completely describe your use of the data." | Отзыв согласия — в Настройках, одним переключателем. |
| 5.1.1(iii) | "Where possible, use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts." | Сканеры берут фото через системный выбор/камеру, без полного доступа к Фото. |
| 5.1.1(iv) | "…apps that include the ability to post photos… must not also require microphone access before allowing the user to upload photos." | Микрофон не обязателен ни для чего. |
| 5.1.1(v) | "If your app supports account creation, you must also offer account deletion within the app." | Удаление учётной записи удаляет и историю помощника (у нас она только на телефоне — см. спеку §8.4). |
| 2.5.14 | "Apps must request explicit user consent and provide a clear visual and/or audible indication when recording… This includes any use of the device camera, microphone…" | Камера сканера — только по нажатию человека, видимо. |
| 5.1.2(ii) | "Data collected for one purpose may not be repurposed without further consent…" | Данные, ушедшие в ИИ, — только для ответа на этот запрос; не для обучения, не для аналитики. |
| 1.2 | "…This includes social media, user-generated content platforms, and AI content creation apps. To prevent abuse, such apps must include: A method for filtering objectionable material from being posted… A mechanism to report offensive content… The ability to block abusive users… Published contact information…" | Помощник не публикует контент и не «создаёт контент» для других людей; но кнопку «Сообщить об ответе» и контакт поддержки держим (дёшево, снимает вопрос). |
| 2.1(a) | "…include demo account info (and turn on your back-end service!) if your app includes a login." | Демо-учётка для проверяющего с запасом лимита ИИ. |
| 2.3.1(a) | "…marketing your app in a misleading way, such as by promoting content or services that it does not actually offer… is grounds for removal…" | В описании не писать «делает всё», пока тест покрытия не 100%. |
| 3.1.1 | "If you want to unlock features or functionality within your app, (by way of example: subscriptions…) you must use in-app purchase." | Платный ИИ (кредиты, тариф) — через встроенные покупки. Решает направление Е. |
| 3.1.1(a) | "These entitlements are not required for developers to include buttons, external links, or other calls to action in their United States storefront apps." | Для витрины США ссылка на оплату на сайте разрешена. Направление Е. |
| 3.1.3(e) | "If your app enables people to purchase physical goods or services that will be consumed outside of the app, you must use purchase methods other than in-app purchase…" | Оплата счетов подрядчика клиентами — не через Apple (Stripe, как сейчас). |
| 4.8 | "Another login service is not required if: Your app exclusively uses your company's own account setup and sign-in systems." | У нас вход только по почте — Sign in with Apple не требуется, пока нет Google-входа. ИИ на это не влияет. |

Не найдено на странице: отдельного правила для ИИ кроме 1.2 и 5.1.2(i); слова «generative». Утверждение документа основателя «правило 5.1.2(i) добавлено в ноябре 2025» — по странице не проверить (там только текущая редакция) **[не проверено]**.

## 2. Цены моделей Anthropic

Источник: https://platform.claude.com/docs/en/about-claude/pricing **[проверено]**. USD за 1 млн токенов.

| Модель (id) | Вход | Запись кэша 5 мин | Чтение кэша | Выход |
|---|---|---|---|---|
| Claude Opus 5.5 (`claude-opus-5-5`) | $4 | $5 | $0.20 | $20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $2.50 | $0.10 | $10 |
| Claude Haiku 5.5 (`claude-haiku-5-5`), запрос до 100 000 токенов | $0.10 | $0.125 | $0.01 | $0.50 |
| Claude Haiku 5.5, запрос больше 100 000 токенов | $0.50 | $0.625 | $0.05 | $2.50 |

- "Claude Haiku 5.5 is priced by prompt length: a request whose prompt is over 100,000 tokens pays higher prices." **[проверено]**
- "The Batch API allows asynchronous processing of large volumes of requests with a 50 percent discount on both input and output tokens." **[проверено]** — для помощника не годится (ответ нужен сразу), для ночных разборов — да.
- Поиск в интернете $10 за 1000 — **[не проверено]** (только пересказ хвоста страницы). Нам не нужен.

Сверка с документом основателя (§9, §12): Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 (до 100 тыс.), Opus 5.5 $4/$20 — **совпадает**.

Модели: https://platform.claude.com/docs/en/about-claude/models/overview — "All current models support text and image input, text output, multilingual capabilities, vision, and tool use." Окно 1M, выход до 128K у Opus 5.5 / Sonnet 5.5 / Haiku 5.5. **[проверено]**

## 3. Фото для модели (сканеры)

Источник: https://platform.claude.com/docs/en/build-with-claude/vision **[проверено]**
- "Claude supports JPEG, PNG, GIF, and WebP images" — **HEIC нет**, фото iPhone переводить в JPEG на телефоне.
- "10 MB (base64-encoded) on the Claude API…"; "The maximum dimensions for each image are 8000x8000 px."
- "An image, therefore, costs `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens."
- Предел длинной стороны 1568 px / 2576 px для новых моделей — **[не проверено]** (из пересказа).

[вывод] Фото чека 1568×1176 → ⌈56⌉×⌈42⌉ = 2352 токена. С подсказкой — вход ~5 тыс. токенов, ответ ~500. Haiku 5.5: 5000 × $0.10/млн + 500 × $0.50/млн ≈ **$0.0008** за скан. Sonnet 5.5: 5000 × $2/млн + 500 × $10/млн ≈ **$0.015**. (Тот же расчёт — спека §6.5.) Оценка документа основателя «$0.05–0.15 за скан» завышена в 5–100 раз для одного фото; верна только для многостраничной сметы на сильной модели. Точный расчёт — направление Е.

Expo (SDK 58): https://docs.expo.dev/versions/latest/sdk/camera/ **[проверено]** — `scanDocumentAsync`: "Presents the system document scanner and returns the captured pages once the user saves. On iOS, this uses VisionKit's VNDocumentCameraViewController". В списке модулей Expo нет распознавания текста. https://docs.expo.dev/versions/latest/sdk/imagemanipulator/ — сохранение в JPEG/PNG/WEBP, `compress`, уменьшение. Про HEIC на странице нет **[не проверено]**. В приложении уже стоят `expo-image-manipulator`, `expo-image-picker`, `expo-document-picker`, `expo-file-system`; `expo-camera` **не стоит** (`apps/mobile/package.json`) — понадобится новая зависимость по правилу 17.

Распознавание на телефоне: Google ML Kit v2 — "can recognize text in any Chinese, Devanagari, Japanese, Korean and Latin character set" (https://developers.google.com/ml-kit/vision/text-recognition/v2) **[проверено]** — **кириллицы нет**, для ru не годится. Apple Vision (языки, RecognizeDocumentsRequest), DataScannerViewController — страницы открылись без текста **[не проверено]**.

## 4. Инструменты модели

- "Setting `strict: true` on a tool definition guarantees Claude's tool inputs match your JSON Schema." "Strict tool use is available on every model." (https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use) **[проверено]**
- Для Opus 5.5 и Sonnet 5.5: "`any` and `tool` return a 400 error" — принудительного вызова инструмента нет, только `auto` (https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) **[проверено]**. Документ основателя прав.
- Поиск инструментов: `tool_search_tool_bm25_20251119` / `tool_search_tool_regex_20251119`; "Mark tools for on-demand loading by adding `defer_loading: true`." (https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) **[проверено]**
- Параллельные вызовы — на прочитанных страницах не найдено **[не проверено]**.

## 5. Хранение и обучение у Anthropic

- "Anthropic may not train models on Customer Content from Services." (https://www.anthropic.com/legal/commercial-terms, раздел B) **[проверено]**
- "For Anthropic API users, we automatically delete inputs and outputs on our backend within 30 days of receipt or generation." (https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) **[проверено]**; исключения — нарушения правил (до 2 лет), требования закона.
- Нулевое хранение (ZDR) — только по договорённости с отделом продаж: "To request ZDR for your organization, contact the Anthropic sales team." (https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) **[проверено]**. Модели Fable/Mythos под ZDR недоступны; Opus/Sonnet/Haiku 5.5 — доступны.
- Противоречие на страницах: страница хранения API пишет "Conversation content… is not retained by default", статья — «удаляем в течение 30 дней». В политике пишем осторожное: «до 30 дней». **[вывод]**

## 6. Что в документе основателя не подтвердилось или не проверено

| Утверждение документа | Итог |
|---|---|
| 5.1.2(i) «третьи лица, включая сторонний ИИ, явное разрешение до передачи» | **подтверждено** дословно |
| Удаление учётной записи в приложении 5.1.1(v) | **подтверждено** |
| 4.8 — Sign in with Apple только при входе через соцсети | **подтверждено** |
| 1.2 — «отдельного правила для ИИ нет» | **иначе**: в 1.2 прямо названы "AI content creation apps"; мы к ним не относимся, но кнопку «Сообщить» держим |
| Цены Sonnet/Haiku/Opus 5.5 | **подтверждено** |
| `tool_choice` any/tool → 400 у Opus/Sonnet 5.5 | **подтверждено** |
| Скан фото $0.05–0.15 | **не подтверждено**, по формуле ≈ $0.0008 (Haiku) – $0.015 (Sonnet) за одно фото |
| HEIC не читается моделью | **подтверждено** (в списке форматов нет) |
| Small Business Program 15%, правила ЕС/Японии, суды о комиссии | **не проверено** — направление Е |
| SpeechAnalyzer, Foundation Models, навыки Siri iOS 27.3 | **не проверено** — в первой версии не используем (спека §2.2 п.21–22) |
| Конкуренты (Jobber, HCP, ServiceTitan) | **не проверено** нами — направление А |
