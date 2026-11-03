# 08a. SEO: публичные страницы компаний и портал

> Статус: черновик **v0.1**, ноябрь 2026 (Фаза 3, артефакт 3.6). Кода нет.
> Опирается на: PRD `12-portal-public-page.md` (POR-US-09, §7 «Публичная SEO-страница», открытый вопрос 3), `04-domain-model.md` (`Company.public_slug`, `PublicProfile`, `File.public_gallery`, `PortalAccess`, `BookingRequest`, `Referral`, `LeadSource`), `08-security.md` §8 (ссылки портала), §12 (файлы).
> Правила поисковиков меняются: факты помечены **[пров. 03.11.2026]**.

**Цель SEO для подрядчика (money_impact):** бесплатные лиды из поиска и Google Business Profile вместо платных ($30–80 за лид Thumbtack/Angi). Метрика PRD 12: ≥ 15% лидов из бесплатных каналов через 6 месяцев. Для Octo — каждая страница подрядчика это ещё и канал привлечения новых подрядчиков («Powered by Octo» внутри формы).

---

## 1. Ключевые решения (кратко)

| # | Решение | Почему |
|---|---|---|
| S1 | Публичная страница — **`octo.app/p/<slug>`** (EN) и **`octo.app/p/<slug>/es`** (ES) | Подкаталог наследует авторитет домена, один сертификат, один sitemap index; поддомен на компанию (`slug.octo.app`) Google оценивает почти как отдельный сайт — новая компания начинает с нуля |
| S2 | Портал и документы — **отдельный хост `my.octo.app`** (`/d/<token>`, `/w/<token>` для нарядов), везде `noindex`, не связан ссылками с публичными страницами | Документы клиентов не должны попадать в индекс даже по ошибке; разделение хостов = разные правила robots, CSP, cookies (закрывает открытый вопрос 3 PRD 12) |
| S3 | **Одна страница на компанию** (+ языковая версия). Районы — раздел страницы и `areaServed`, без страниц «услуга × город» в MVP | Политика Google против doorway pages; страницы «Gutter cleaning Glendale / Burbank / Pasadena…» с одинаковым текстом — прямой риск санкций |
| S4 | **Quality gate**: страница индексируется (`index`) только после проверки компании и минимального наполнения; до этого `noindex` | Тысячи пустых шаблонных профилей на `octo.app` — риск для всего домена (тонкий контент, site reputation abuse) и для имперсонации чужого бизнеса |
| S5 | **SSR/ISR** (Next.js), весь контент и JSON-LD в исходном HTML; обновление по событию изменения PublicProfile | Googlebot и AI-краулеры видят контент без JS; быстрая отдача с CDN |
| S6 | JSON-LD **`HomeAndConstructionBusiness`** + `Service`; **без `AggregateRating`/`Review` в MVP** | Google не показывает звёзды для отзывов бизнеса о самом себе (self-serving, с 2019) — выгоды нет, а риск нарушения правил о фейковых/стимулированных отзывах есть. **Изменение относительно POR-US-09** (там «aggregateRating только из реальных отзывов») — предлагаем отключить по умолчанию |
| S7 | Свой домен подрядчика — **позже** (Запуск+): `octo.app/p/<slug>` → 301 на свой домен, canonical на свой домен | Подрядчики с сайтом хотят ссылочный вес себе; в MVP — виджет записи на их сайт (§10) |
| S8 | Аналитика — **первая сторона, без рекламных пикселей** на портале и публичной странице в MVP; UTM/gclid/ref пишутся в Lead | Атрибуция ROI (PRD 14) без «sale/share» данных по CCPA и без сторонних скриптов рядом с оплатой (PCI, `08-security` §9) |

---

## 2. Схема URL

| URL | Что | Индекс | В sitemap |
|---|---|---|---|
| `octo.app/` и маркетинговые страницы Octo | Сайт продукта (для подрядчиков) | ✅ | ✅ (свой sitemap) |
| `octo.app/p/<slug>` | Публичная страница компании, EN | ✅ после quality gate | ✅ |
| `octo.app/p/<slug>/es` | ES-версия (только если перевод утверждён) | ✅ после quality gate | ✅ |
| `octo.app/p/<slug>?ref=<code>` / `?utm_*` / `?gclid=` | Реферальная/рекламная ссылка | canonical → без параметров | ❌ |
| `octo.app/p/<slug>/book` (и шаги записи) | Онлайн-запись | `noindex, follow` | ❌ |
| `octo.app/embed/<slug>/…` | Виджет для сайта подрядчика (iframe) | `noindex` | ❌ |
| `my.octo.app/d/<token>`, `/d/s/…` (после обмена токена на cookie) | Портал клиента: сметы, инвойсы, «Мой дом» | `noindex, nofollow, noarchive` | ❌ |
| `my.octo.app/w/<token>` | Наряд субподрядчика | `noindex, nofollow, noarchive` | ❌ |
| `app.octo.app` | Веб-приложение подрядчика | `noindex` | ❌ |
| `files.octousercontent.com/…` (приватные файлы, signed URL) | Фото/PDF документов | `noindex` (X-Robots-Tag) | ❌ |
| `img.octo.app/g/<company>/<file>.webp` | Опубликованные фото галереи | ✅ (как изображения) | ✅ (image sitemap) |

**Slug:**
- Формат `[a-z0-9-]{3,50}`, из названия компании при онбординге, редактируется owner; запрещённые/зарезервированные слова (бренды крупных компаний, `admin`, `octo`, `support`…).
- **Смена slug** → старый slug навсегда хранится в истории и отдаёт 301 на новый (таблица `public_slug_history`, нужна в модели данных).
- Два бизнеса с одним названием — суффикс города (`ace-gutters-glendale`), не цифры.

**Жизненный цикл страницы:**
| Состояние компании | Страница |
|---|---|
| Онбординг, не прошла quality gate | 200 + `noindex` (владелец видит превью и чек-лист «чтобы страница попала в Google») |
| Активна, gate пройден | 200 + `index` |
| Пауза (сезонная) | 200 + `index`, запись показывает «Принимаем заявки» без слотов |
| Подписка отменена | 30 дней — как есть; затем `noindex`; через 90 дней — **410 Gone** (данные — по правилам удаления) |
| `do_not_publish` / жалоба на имперсонацию | 404/410 сразу |

---

## 3. Quality gate (что нужно для индексации)

Страница получает `index`, когда выполнено **всё**:
1. Телефон компании подтверждён (код) и совпадает с указанным на странице.
2. Указан номер лицензии CSLB (для CA) — проверка формата; позже авто-проверка по базе CSLB. Без лицензии — допускается для услуг до $500 (чистка) с явным выбором владельца [юрист, Б4].
3. Заполнены: ≥ 1 услуга, ≥ 1 район обслуживания, «О компании» ≥ 300 знаков **своим текстом** (AI-черновик допускается только из ответов владельца на вопросы онбординга, не общий шаблон).
4. ≥ 3 фото галереи (опубликованных владельцем) **или** ≥ 1 отзыв с согласием.
5. Нет жалоб на имперсонацию; название не совпадает с другим проверенным профилем в том же городе.

Почему: защищает домен `octo.app` от массы тонких одинаковых страниц и от «site reputation abuse» — Google с 2024 г. наказывает сайты, где сторонний контент используется ради ранжирования за счёт репутации хоста, причём перенос в подкаталог/поддомен проблему не снимает [пров. 03.11.2026]. Профили реальных проверенных бизнесов (как у Yelp/BBB) — нормальный сценарий; массовые пустые — нет. **Мониторинг:** доля индексируемых страниц, ручные меры в Search Console; если риск вырастет — план Б: вынести профили на отдельный домен с 301.

---

## 4. Индексируемое и закрытое

**Портал и документы — правила «не находится никогда»:**
- Отдельный хост `my.octo.app`; ни одной ссылки с публичных страниц, sitemap, маркетинга на документы.
- Каждый ответ (включая 404, 401, ошибки, PDF) — `X-Robots-Tag: noindex, nofollow, noarchive`; HTML — дублирующий `<meta name="robots">`.
- `robots.txt` для `my.octo.app` **не** запрещает обход (`Disallow` помешал бы роботу увидеть `noindex`, а URL мог бы индексироваться «без описания» по внешней ссылке); страницы без cookie-сессии всё равно отдают экран «ссылка недействительна, запросите новую» без данных.
- Токен удаляется из URL после первого открытия (обмен на cookie, `08-security` §8) → в аналитике, истории и Referer токена нет; `Referrer-Policy: no-referrer`.
- PDF смет/инвойсов — только signed URL с коротким сроком, `noindex`, `Content-Disposition: attachment`.
- Никакой PII в URL (имя, адрес, номер документа в пути не пишем, только непрозрачный id/токен).
- Если документ всё-таки оказался в индексе (переслали на публичный форум): отзыв ссылки (410) + запрос удаления в Search Console (runbook).

**robots.txt `octo.app`:** `Allow: /p/`; `Disallow: /api/`, `/app/`; `Sitemap: https://octo.app/sitemap.xml`. Страницы записи и embed закрываем `noindex` (а не Disallow), чтобы правило было увидено.

**AI-краулеры** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended): публичные страницы компаний — разрешены (ответы AI-поиска на «gutter cleaning near me» — тоже канал лидов); портал — закрыт так же, как для Google. Настройка «не показывать AI-сервисам» — у владельца позже.

---

## 5. Рендеринг и производительность

- Next.js (App Router), **ISR**: страница собирается на сервере, кэшируется на CDN; on-demand revalidation по событию изменения `PublicProfile`, `File.public_gallery`, услуг, часов работы (тег кэша на компанию). Слоты записи — отдельный клиентский запрос (динамика не ломает кэш страницы).
- Весь текст, `<title>`, meta description, canonical, hreflang, JSON-LD — в исходном HTML (без зависимости от JS).
- `<html lang="en-US">` / `lang="es-US"`.

**Бюджеты Core Web Vitals** (оценка по p75 реальных пользователей на мобильных; пороги Google «хорошо»: LCP ≤ 2.5 с, INP ≤ 200 мс, CLS ≤ 0.1 — без изменений [пров. 03.11.2026]):
| Метрика | Порог Google | Наш бюджет (публичная страница, 4G, средний iPhone/Android) |
|---|---|---|
| LCP | ≤ 2.5 с | **≤ 2.0 с** (PRD: < 2.5 с) |
| INP | ≤ 200 мс | **≤ 150 мс** |
| CLS | ≤ 0.1 | **≤ 0.05** |
| TTFB | — | ≤ 400 мс из кэша CDN |
| JS (gzip) | — | ≤ 70 KB на первую загрузку; без сторонних скриптов, кроме Turnstile на шаге формы (ленивая загрузка) |
| Hero-изображение | — | ≤ 120 KB (AVIF/WebP), `fetchpriority=high`, размеры заданы |
| Шрифты | — | ≤ 2 файла woff2, subset, `font-display: swap`, preload |
| Lighthouse SEO / Accessibility | — | ≥ 95 / ≥ 90 (POR-US-09) |
- CI: Lighthouse CI на эталонной странице, падение бюджета → PR не проходит. RUM: `web-vitals` в собственную аналитику (страница компании редко имеет данные CrUX).

---

## 6. Структура страницы и on-page

| Блок | SEO-заметки |
|---|---|
| `<title>` | `{Company} — {главная услуга} in {главный город}, CA \| Licensed #{CSLB}` (≤ 60 знаков, правится владельцем) |
| meta description | Из «О компании»/услуг, 140–160 знаков, CTA «Book a free inspection» |
| H1 | Название компании + главная услуга |
| Услуги (H2 + H3 на услугу) | Описание каждой своими словами; цена «от» — только если владелец включил (А26, по умолчанию выкл.) |
| Районы обслуживания (H2) | Список городов/районов текстом (Glendale, Burbank, Pasadena…), карта области без точки адреса; **не** ссылки на отдельные страницы городов |
| Галерея | §8 |
| Отзывы | Тексты с согласием клиента + кнопка «Отзывы в Google» (ссылка на GBP). Без разметки рейтинга (§7) |
| Лицензия и страховка | CSLB # со ссылкой на проверку на сайте CSLB; «Insured» — только если загружен COI |
| FAQ | Обычный HTML-контент (полезен людям и AI-поиску); разметка FAQPage не даёт расширенных результатов — Google, по отраслевым данным, полностью убрал FAQ rich results в 2026 [пров. 03.11.2026, сверить с документацией Google] — разметку не добавляем |
| CTA | «Записаться на осмотр» (онлайн-запись), телефон `tel:` (клик = событие атрибуции) |
| Footer | NAP: Name, город (или полный адрес у storefront), телефон — точно как в GBP |

**NAP-согласованность:** название, телефон и (если показывается) адрес на странице должны совпадать с Google Business Profile символ в символ; онбординг сверяет и подсвечивает расхождения.

---

## 7. Schema.org (JSON-LD)

**Тип:** `HomeAndConstructionBusiness` (подтип `LocalBusiness`). Для roofing позже — `RoofingContractor`; для смежных — `Plumber`, `Electrician`, `HousePainter`, `GeneralContractor`. Для gutters отдельного типа нет.

| Свойство | Источник | Правило |
|---|---|---|
| `@id` | `https://octo.app/p/<slug>#business` | Стабильный идентификатор |
| `name`, `url`, `telephone`, `logo`, `image` | Company, PublicProfile | Совпадает с видимым на странице |
| `address` | Company.address | **Service-area business** (`hide_street_address = true`): только `addressLocality`, `addressRegion`, `postalCode`, без улицы; storefront — полный адрес |
| `geo` | — | Только для storefront; для работы из дома — **не выводим** (раскрывает домашний адрес) |
| `areaServed` | PublicProfile.service_areas | Массив `City` (`name`, `containedInPlace` = Los Angeles County) |
| `openingHoursSpecification` | Company.business_hours | |
| `sameAs` | GBP URL, Yelp, Facebook, Instagram, BBB | Только ссылки, принадлежащие компании |
| `makesOffer` → `Offer` → `itemOffered: Service` | PublicProfile.services | `serviceType`, `name`, `description`, `areaServed`; `priceSpecification` — только если цена «от» показана на странице |
| `priceRange` | — | Не выводим (неинформативно) |
| `hasCredential` | CSLB license | `EducationalOccupationalCredential` с `recognizedBy` CSLB — для полноты (Google не использует для rich results) |
| `aggregateRating`, `review` | — | **Не выводим в MVP** (см. ниже) |
| `inLanguage` | locale | На ES-странице `es-US` и переведённые `description` |

**Правила отзывов (критично):**
- Google с сентября 2019 не показывает звёзды (review snippets) для `LocalBusiness`/`Organization`, если отзывы о самом бизнесе размещены на его же странице (self-serving), независимо от виджета [пров. 03.11.2026].
- В 2026 г. Google ужесточил правила review snippets: нельзя размещать фейковые или нераскрытые стимулированные отзывы в контенте и разметке, нарушение → возможная ручная мера [пров. 03.11.2026 по отраслевым источникам, сверить с документацией].
- Следствия для продукта:
  1. `aggregateRating` и `review` в JSON-LD **не выводим** по умолчанию (выгоды нет). Изменить формулировку POR-US-09.
  2. **Никогда** не переносим рейтинг/число отзывов из Google в нашу разметку и не пишем «4.9★ (120 reviews)» как собственный рейтинг без ссылки на источник; на странице допустимо «Rated 4.9 on Google» со ссылкой — только если число получено из GBP API (позже) и обновляется.
  3. Награда рефералки (PRD 12/13) **никогда** не зависит от отзыва; запрос отзыва уходит всем (без review gating, FTC 16 CFR 465).
  4. Отзывы, добавленные владельцем вручную: имя/инициалы, дата, `consent = true`; помечаем «Отзыв передан компанией» — честно.

---

## 8. Изображения галереи: SEO + приватность

- Источник — только `File.public_gallery = true` (решение владельца на каждое фото); публикуется **производная копия** из пайплайна `08-security` §12: EXIF/GPS удалены, разрешение ≤ 1600 px, AVIF/WebP + JPEG fallback, `srcset`.
- **Без точных адресов:** подпись и alt — город/район, не улица; предупреждение про номер дома, машины, людей; позже — авто-размытие номеров домов и номерных знаков. Проекты не связываются публично с Property/Customer (нет «Работа для семьи Ким на Oak St»).
- **alt-текст:** AI-черновик по типу работы и городу, владелец утверждает: «Seamless 6-inch K-style aluminum gutters installed on a two-story home in Glendale, CA». Без набивки ключевыми словами.
- **Имя файла:** `seamless-gutter-installation-glendale-01.webp` (из alt, транслитерация, без адреса).
- Первое фото — LCP-кандидат (без lazy), остальные `loading="lazy"`, явные `width/height` (CLS).
- Image sitemap: `<image:image>` в записи страницы компании.
- Фото «до/после» в портале клиента — приватные (`client_visible`), в публичную галерею автоматически **не** попадают.

---

## 9. Языки: hreflang EN/ES

- Две версии: `/p/<slug>` (`en-US`) и `/p/<slug>/es` (`es-US`). ES-версия существует **только** если перевод текстов компании утверждён владельцем (PRD 12: неутверждённый перевод не публикуется) — иначе нет ни URL, ни hreflang.
- На обеих страницах взаимные `hreflang="en-US"`, `hreflang="es-US"` и `hreflang="x-default"` → EN; self-canonical у каждой версии (ES не канонизируется на EN).
- Интерфейс ES — из словаря продукта; title/description/alt — переведённые.
- **Без авто-редиректа по Accept-Language/IP** (Googlebot ходит с EN и не увидит ES) — только переключатель языка и подсказка-баннер.
- Те же hreflang-пары в sitemap (`xhtml:link`).
- RU для публичных страниц не делаем (аудитория — клиенты подрядчиков в LA).

---

## 10. Google Business Profile (GBP)

| Шаг | MVP | Позже |
|---|---|---|
| Владелец указывает ссылку на GBP (или ищем по названию и выбираем) → сохраняем place id | ✅ | |
| `sameAs` и кнопка «Отзывы в Google» на странице; ссылка на написание отзыва по place id для ReviewRequest (PRD 13) | ✅ | |
| Инструкция: поле **Website** в GBP → `https://octo.app/p/<slug>?utm_source=google&utm_medium=organic&utm_campaign=gbp` (canonical отбрасывает параметры; лид получает источник «Google Business Profile») | ✅ | |
| Поле «Appointment link» в GBP → `octo.app/p/<slug>/book?utm_source=google&utm_medium=organic&utm_campaign=gbp_booking` | ✅ | |
| Проверка NAP: название/телефон/город совпадают с GBP | ✅ (ручной чек-лист) | авто через API |
| GBP API (OAuth владельца): импорт отзывов и рейтинга, публикация постов «работа выполнена» с фото, часы работы | | ✅ (заявка на доступ к API — параллельная дорожка `00-roadmap`) |
| Токены GBP хранятся как интеграция компании (`08-security` §6, envelope encryption) | | ✅ |
Правило: Octo не создаёт и не верифицирует GBP за подрядчика (риск нарушения правил GBP и имперсонации) — только помогает пройти шаги.

---

## 11. Sitemap

- `octo.app/sitemap.xml` — **sitemap index**: `sitemaps/marketing.xml` + шарды профилей `sitemaps/p-0001.xml…` (≤ 10,000 URL на шард, с запасом от лимита 50,000).
- В шарде: для каждой компании, прошедшей quality gate, — EN URL и ES URL (если есть) с `xhtml:link` hreflang, `lastmod` = реальное время последнего изменения публичного контента (не «сейчас»), `image:image` для галереи.
- Исключены: noindex-страницы, запись, embed, портал.
- Генерация по событию (изменение профиля/статуса gate) + ночная пересборка; ping не нужен (Google его не использует) — sitemap указан в robots.txt и Search Console.
- **«Sitemap на компанию»** нужен, когда у компании свой домен (позже): `www.<домен>/sitemap.xml` только с её URL; Octo при подключении показывает инструкцию добавить домен в Search Console владельца.
- Search Console Octo: домен `octo.app` (DNS-верификация), мониторинг покрытия `/p/`, ручных мер, CWV.

---

## 12. Doorway pages и масштабирование (позже)

- MVP: **одна страница на компанию**. Районы — раздел, `areaServed`, без отдельных URL.
- Страницы «услуга × город» (POR-US-14, позже) — только при **уникальном содержании** в каждой: реальные выполненные работы в этом городе (≥ 3 опубликованных проекта с фото), местные особенности (разрешения города, fire zone), отзывы клиентов из этого города. Генератор не создаёт страницу без порога; без синонимизированного шаблонного текста; лимит страниц на компанию (например, ≤ 10 городов). Ссылки — из раздела районов основной страницы.
- Никаких каталогов «Best gutter companies in Glendale» от имени Octo со списком наших клиентов в MVP (это другой продукт — директория — с другими рисками и правилами).

---

## 13. Виджет для сайта подрядчика (embed)

**MVP: виджет «Записаться на осмотр / Получить смету»** (форма заявки + реальные слоты, как на публичной странице). Instant quote с ценой по адресу и спутнику — позже (PRD 12).

| Аспект | Решение |
|---|---|
| Установка | Одна строка: `<script src="https://octo.app/embed.js" data-company="<slug>" async></script>` + альтернатива «кнопка-ссылка» на `octo.app/p/<slug>/book` для конструкторов без скриптов (Wix/Squarespace блоки HTML) |
| Техника | Скрипт вставляет iframe `octo.app/embed/<slug>/book`; размер через `postMessage` (проверка origin); стили компании из `brand` |
| SEO для подрядчика | Контент iframe не засчитывается сайту подрядчика — это нормально (форма, а не контент). Рекомендуем подрядчику держать свой текст об услугах на своём сайте |
| Ссылка «Powered by Octo» | Только внутри iframe; **никаких** вставляемых в страницу подрядчика ссылок с ключевыми словами — Google считает ссылки в распространяемых виджетах link scheme. Если ссылка видна на странице подрядчика — `rel="nofollow"` |
| Индексация | `octo.app/embed/*` — `noindex` |
| Безопасность | Только этот маршрут разрешён во фрейме (`frame-ancestors *` или список доменов компании), остальной `octo.app` — `frame-ancestors 'none'`; Turnstile; лимиты записи (PRD 12); никаких данных клиента через `postMessage` наружу, кроме события «заявка отправлена» (без PII) для конверсии на сайте подрядчика |
| Атрибуция | Скрипт передаёт в iframe: URL родительской страницы, `document.referrer` родителя, UTM и `gclid/gbraid/wbraid/fbclid` из URL родителя → Lead `source = "Сайт компании"`, `landing_page`, UTM |
| Производительность сайта подрядчика | `embed.js` ≤ 5 KB, `async`, iframe грузится лениво (при прокрутке или клике по кнопке) — не портим их CWV |

---

## 14. Аналитика и атрибуция лидов

**Что фиксируем при каждой заявке (BookingRequest/Lead):** `landing_url` (без токенов), `referrer` (домен), `utm_source/medium/campaign/term/content`, `gclid`/`gbraid`/`wbraid`, `fbclid`, `ref` (реферальный код), `first_touch` и `last_touch` (cookie первой стороны 90 дней на `octo.app/p/<slug>`, только UTM-параметры, без PII), `entry_point` (`public_page` / `embed` / `gbp` / `portal` / `qr`), язык.

**Правила сопоставления с LeadSource (PRD 02/14):**
| Признак | LeadSource |
|---|---|
| `utm_campaign=gbp*` | Google Business Profile |
| `gclid`/`gbraid` или `utm_medium=cpc` + `utm_source=google` | Google Ads |
| `ref=<code>` | Реферал (Referral.new_lead_id) |
| `entry_point=embed` | Сайт компании |
| `utm_source=<любой>` | По таблице сопоставления компании (настраивается) |
| органический Google без UTM (referrer google.*) | Google Organic |
| иначе | Прямой / Публичная страница |
- Клик по `tel:` и `mailto:` на странице — событие (звонок не создаёт лид автоматически; call tracking — Фаза 8).
- **Аналитика первой стороны:** собственная таблица событий (просмотр, клик CTA, старт/завершение записи, звонок) с агрегатами для отчёта владельцу «Ваша страница: 240 просмотров, 18 заявок, 9 из Google». Без Google Analytics/Meta Pixel в MVP: сторонние рекламные пиксели = «sharing» по CCPA (нужны «Do Not Sell or Share» и согласие), плюс они ухудшают CWV и запрещены рядом с оплатой.
- **Позже:** импорт офлайн-конверсий в Google Ads по `gclid` (лид → смета подписана → оплачено) с OAuth владельца; данные Search Console владельца (показы/клики по запросам) в отчёте; Meta Conversions API — только с opt-out механизмом.
- UTM-конструктор в приложении: готовые ссылки для GBP, Facebook, флаеров (QR с `utm_medium=print`), табличек на объекте (`utm_medium=yard_sign`).

---

## 15. Свой домен (позже)

- Подключение `www.<домен подрядчика>` через CNAME → наш edge (Vercel Domains API или Cloudflare for SaaS), автоматический TLS.
- Публичная страница переезжает на корень своего домена; `octo.app/p/<slug>` → **301** на свой домен; canonical, hreflang, sitemap, JSON-LD `url` — на свой домен.
- Портал остаётся на `my.octo.app` (не на домене подрядчика: проще безопасность cookies и CSP). Позже, по запросу, — `portal.<домен>` с теми же `noindex`.
- Отключение домена → 301 обратно на `octo.app/p/<slug>`, пока DNS указывает на нас.

---

## 16. MVP / позже

| Функция | MVP | Запуск | Позже |
|---|---|---|---|
| `octo.app/p/<slug>` + `/es`, SSR/ISR, title/description/canonical/hreflang | ✅ | | |
| Портал на `my.octo.app`, `noindex` везде, токен вне URL после открытия | ✅ | | |
| Quality gate (телефон, лицензия, контент, фото), `noindex` до прохождения | ✅ | | авто-проверка CSLB |
| История slug + 301; жизненный цикл (noindex → 410) | ✅ | | |
| JSON-LD `HomeAndConstructionBusiness` + `Service`, без рейтинга | ✅ | | |
| Галерея с EXIF/GPS-очисткой, alt по городу, image sitemap | ✅ | | авто-размытие номеров |
| Sitemap index + шарды, robots.txt, Search Console `octo.app` | ✅ | | |
| CWV-бюджеты в Lighthouse CI, RUM | ✅ | | |
| GBP: ссылка, place id, UTM-инструкция для Website/Appointment | ✅ | | |
| Атрибуция: UTM, gclid, ref, entry_point → Lead; отчёт по странице | ✅ | | |
| Виджет записи для сайта подрядчика (embed) | | ✅ | |
| UTM-конструктор и QR | | ✅ | |
| Свой домен + 301 + sitemap на домене | | | ✅ |
| GBP API: отзывы, рейтинг, посты | | | ✅ |
| Страницы «услуга × город» с порогом уникальности | | | ✅ |
| Instant quote по адресу в виджете | | | ✅ |
| Офлайн-конверсии Google Ads, Search Console владельца в отчётах | | | ✅ |

---

## 17. Изменения в другие документы (предложение)

1. **PRD 12, POR-US-09:** «aggregateRating только из реальных отзывов» → «aggregateRating/review в JSON-LD не выводятся (self-serving не даёт звёзд); рейтинг Google показывается только ссылкой». Открытый вопрос 3 закрыть: публичные страницы на `octo.app/p/`, портал на `my.octo.app`.
2. **Модель данных:** `public_slug_history` (`company_id`, `slug`, `changed_at`); `PublicProfile.index_status` (`draft`/`noindex`/`indexed`/`gone`) + `quality_gate json`; `PublicProfile.gbp_place_id`; в Lead/BookingRequest — `landing_url`, `utm json`, `click_ids json`, `entry_point`, `first_touch json`; `File.alt_text` (+ ES), `File.public_variant_key`.
3. **`00-decisions-for-founder`:** новый вопрос — показывать ли «Rated X on Google» на странице до появления GBP API (совет: нет, только кнопка «Отзывы в Google»).

---

**Источники (проверено 03.11.2026):** [Google: self-serving reviews (2019)](https://developers.google.com/search/blog/2019/09/making-review-rich-results-more-helpful), [Ужесточение правил review snippets 2026](https://www.techwyse.com/news/search-news/google-review-snippet-structured-data-incentivized-reviews), [Google: site reputation abuse](https://developers.google.com/search/blog/2024/11/site-reputation-abuse?hl=en), [FAQ rich results убраны (2026)](https://www.searchenginejournal.com/google-drops-faq-rich-results/574429/), [Google: localized versions / x-default](https://developers.google.com/search/docs/advanced/crawling/localized-versions?hl=nl), [Core Web Vitals пороги](https://corewebvitals.io/core-web-vitals).
