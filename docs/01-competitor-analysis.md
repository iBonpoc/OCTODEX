# 01. Анализ конкурентов

Статус: справочно — снимок рынка ноября 2026 (обновлён 16.11.2026); шапка поставлена 26.11.2026, текст не сверялся · экраны и матрица функций — `market/`.

> Экран за экраном и матрица функций — `docs/market/`.

> Срез: ноябрь 2026, обновлено 16.11.2026: новейшие игроки, таблица «как у них сделано X», идеи и open-source — §12–§16. Рынок: US home services, старт Лос-Анджелес; первая ниша Gutters, затем Roofing.
> Пометки: **[≈]** оценка или источники расходятся, **[?]** не подтверждено, **[вторично]** цитата взята из блога конкурента, а не из первоисточника.
> Reddit, Capterra и App Store напрямую агентам были недоступны. Жалобы собраны с Trustpilot, G2, GetApp, Software Advice, BBB и форумов вендоров.

---

## 1. Карта рынка

| Сегмент | Игроки | Для кого |
|---|---|---|
| Горизонтальные FSM (enterprise) | **ServiceTitan**, FieldEdge | HVAC/plumbing, 10+ техников, выручка $3M+ |
| Горизонтальные FSM (SMB) | **Housecall Pro**, **Jobber**, Workiz, Service Fusion, FieldPulse, ServiceM8, Kickserv, GorillaDesk, Markate | 1–30 человек |
| Roofing / exterior CRM | **JobNimbus** (+SumoQuote), **AccuLynx**, **Roofr**, Leap, ProLine, improveit360, Builder Prime, Buildertrend | кровельщики и exteriors |
| Замеры | EagleView, Hover, GAF QuickMeasure, RoofSnap, Nearmap, Google Solar API | отчёты за деньги или через API |
| Точечные инструменты | ArcSite (takeoff), CompanyCam (фото), Roofle (instant quote), GutterFlowApp | одна функция |
| AI-native новички | Avoca ($1B), Netic, Probook, Broccoli AI, UpSmith, Topline Pro, Rilla/Siro | AI-ресепшн, бронирование, продажи **поверх** чужих FSM |
| AI-native FSM и перезапуски 2024–2026 | **FieldCamp**, **Simpro Lightning**, Foreman (YC W26), Drillbit (YC), Contractor+ | своё ядро FSM, AI-агенты внутри (§12) |
| AI-слой поверх FSM (2025–2026) | Ressl AI (YC W26), CentralComs (YC), NOSO Labs (YC S25) | агенты работают в чужих Jobber/HCP/ServiceTitan |

## 2. Цены (2026)

| Продукт | Вход, $/мес | Модель | Контракт |
|---|---|---|---|
| ServiceTitan | ~$245–500 за техника + внедрение $5–50k [≈] | за техника + Pro-модули | 12+ мес. |
| Housecall Pro | $59 (год) / $79 | тир + места (+$35–100/польз.) + add-ons | нет |
| Jobber | $29 (год) / $49 | тир с лимитом мест, +$29/польз. Подорожание +17–26% в июле 2026 | по выбору |
| Workiz | ~$229–325 [≈], с 2026 только по запросу | места + add-ons | годовой автопродляемый |
| Service Fusion | $208 / $245 | flat, **пользователи без лимита** | год/мес |
| ServiceM8 | $0–349 | за число работ в месяц | нет |
| GorillaDesk | $49 | за маршрут, пользователи без лимита, **сезонная заморозка** | нет |
| JobNimbus | публичной цены нет, ~$500–1,700 со всеми add-ons [≈] | места + add-ons | — |
| AccuLynx | custom, тариф $250 убран в 2026 [≈] | места | — |
| Roofr | $0 / $249 / $349 | **пользователи без лимита** + платные отчёты и add-ons | нет |
| Leap | $79 / $298 + $99/польз. | места | — |
| Builder Prime | $199–900 [≈] | — | — |
| ArcSite (takeoff) | $99–160 за пользователя | места | — |

**Платёжные комиссии** у всех: карты 2.59–2.9% + 30¢, ACH 0.8–1%, instant payout +1%. Для конкурентов это **главный скрытый источник выручки**: $50k оборота картами в месяц дают около $1,300 комиссии против $149 подписки.

## 3. Что пользователи любят

- **ServiceTitan:** «We now know our numbers and doubled revenue in 2 years», прозрачность по работам, персональный CSM.
- **Jobber:** простота («so easy to use, powerful and clever»), быстрая поддержка, Client Hub, повторяющиеся визиты.
- **Housecall Pro:** доступность, простые инвойсы и эстимейты, связь офиса и поля, испанский язык.
- **JobNimbus:** гибкие канбан-доски и автоматизации.
- **AccuLynx:** глубокий insurance-workflow, сильная поддержка, интеграция с ABC Supply.
- **Roofr / Service Fusion / GorillaDesk:** **пользователи без лимита** и предсказуемая цена.
- **Leap SalesPro:** смета и подпись в тот же день прямо у клиента дома.
- **ArcSite:** точный gutter takeoff (runs, downspouts, elbows, waste).

## 4. Главные жалобы (общие паттерны рынка)

| # | Боль | Где проявляется |
|---|---|---|
| 1 | **Цена на сайте не равна реальной цене.** Ключевые функции вынесены в add-ons (HCP $189 → $457 [вторично]) | HCP, ServiceTitan, Workiz, Markate, JobNimbus |
| 2 | **Постоянное подорожание** | Jobber +26%, Workiz «doubled», Service Fusion +9%, ServiceTitan +15–20% при продлении |
| 3 | **Оплата за каждого пользователя** растёт вместе с командой | Jobber, HCP, JobNimbus, AccuLynx, Leap |
| 4 | **Контракты, автопродление, трудная отмена, заложники в виде данных и телефонного номера** (перенос номера из Workiz занял 3 мес.) | ServiceTitan, Workiz, FieldPulse, FieldEdge, AccuLynx |
| 5 | **Скрытые цены** («request pricing») | ServiceTitan, FieldEdge, FieldPulse, Workiz, JobNimbus |
| 6 | **Поддержку заменили AI или скриптами** («No support unless you want to speak with AI») | HCP, Workiz |
| 7 | **Нестабильное мобильное приложение, регрессии после обновлений** («App constantly crashes») | ServiceTitan, HCP, JobNimbus («slow, crashes, missing features»), Kickserv |
| 8 | **Нет настоящего офлайн-режима** | Jobber (офлайн доступны только заметки), Kickserv, HCP (только просмотр) |
| 9 | **Слабая отчётность** | Jobber, Service Fusion, Kickserv |
| 10 | **Долгое и дорогое внедрение** (2–12 мес.) | ServiceTitan |
| 11 | **Запросы отзывов за пейволлом** или не ведут в Google | Jobber, HCP |
| 12 | **Ошибки спутниковых замеров** («off by 13 squares») | Roofr |

## 5. Чего не хватает рынку: наши окна возможностей

1. **Gutter-смета внутри CRM.** Ни одна CRM не делает расчёт материалов (BOM) по гаттерам: LF по runs, miters, end caps, outlets, downspouts по высоте, hangers по шагу, цвет и толщина coil, cut list для seamless-машины. Roofing-CRM считают в squares, Jobber и HCP считают только строки вручную. Takeoff (ArcSite) живёт отдельно от CRM.
2. **Учёт coil-склада** (по цвету и толщине) и автоматический PO локальному поставщику.
3. **Связка «замер → смета → заказ материалов → маржа по работе»** есть только у ServiceTitan и roofing-CRM, и то не для гаттеров.
4. **Замкнутый ROI рекламы до денег** (потрачено в LSA, Yelp, Angi, Thumbtack, Meta → закрыто → маржа → LTV) для малого бизнеса. Сейчас он есть только в дорогом ServiceTitan Marketing Pro. В Jobber источник задаётся вручную и учитывает только первый платёж, у HCP два отчёта противоречат друг другу.
5. **Настоящий агентный AI-помощник.** Jobber AI Voice (beta) редактирует строки в смете, но только голосом, только на телефоне и только для админа. JobNimbus Scout в закрытой beta. **Ни у кого нет:**
   - фото чека плюс голос, из которых получается расход на нужного клиента или работу с наценкой;
   - паритета голоса и текста;
   - понимания текущего экрана («удали строку 10 *здесь*»), предпросмотра изменений и отмены;
   - работы на испанском и офлайн;
   - проактивных денежных подсказок («в смете нет guards, обычно это +$X»; «клиент открыл смету 3 раза, позвони»).
6. **Портал как витрина**, а не только оплата и подпись. Ни один портал не показывает вместе: варианты G/B/B с ежемесячным платежом, фото до и после, историю дома, гарантии, другие услуги подрядчика, membership, запись на следующую чистку в один клик, реферальную ссылку.
7. **Онлайн-бронирование с учётом реальной загрузки** и длительности работы по размеру дома.
8. **Честная модель для сезонного бизнеса**: пауза аккаунта в межсезонье есть только у GorillaDesk.
9. **Надёжный офлайн** с полным циклом: смета, подпись, оплата, фото.
10. **EN/ES** для бригад и клиентов. Для Лос-Анджелеса это критично.
11. **Прозрачная цена без контракта и свободный выход** с данными и номером.

## 6. Специфика Gutters и Лос-Анджелеса

- **Структура сметы:** LF по профилю (K-style 5"/6", half-round), материал (aluminum .027/.032, steel, copper), цвет coil, inside/outside miters, end caps, outlets, downspouts 2x3/3x4 (LF по высоте этажа), A/B elbows, extensions, hangers (шаг 24"), tear-off старых гаттеров, fascia repair, надбавки за этажность, крутой скат и tile roof, guards ($/LF), cleaning plan.
- **Черепица (clay tile)** часто встречается в LA, для неё нужны специальные strap hangers.
- **Пожароопасные зоны WUI/FHSZ.** По CRC R337 / CBC 705A и правилам LA County 2026 гаттеры и сетки должны быть **негорючими**. После пожаров января 2025 это сильный аргумент для upsell металлических guards и замены винила. Проверку адреса можно делать автоматически по данным CAL FIRE.
- **Сезонность:** чистка перед сезоном дождей (октябрь–ноябрь). Это повторяющийся доход.
- Града почти нет, поэтому insurance-workflow для LA вторичен.
- **Ориентир цен LA** [≈]: ~$10–20/LF за seamless aluminum с downspouts, ~$12–25/LF за guards. **Нужно сверить с реальными данными основателя.**

## 7. Замеры и поставщики

| Инструмент | Цена | Gutters | API |
|---|---|---|---|
| Google Solar API | ~$0.01 за запрос [?] | LF eaves можно вывести из сегментов крыши (черновая оценка) | открытый, подходит для instant quote |
| Hover | $39–139 за скан | да (Exterior scan) | **API на всех тарифах** |
| EagleView | Gutter report **$13.75** | да | developer portal [≈] |
| RoofSnap | Gutter report ~$11 | да | [?] |
| GAF QuickMeasure | $18–20 | нет (только roof) | через партнёров |

**Поставщики:** ABC Supply, SRS (Home Depot), Beacon (QXO). API у всех **закрытые и партнёрские**. Основной материал гаттеров — coil (Service Partners: Fontana, Camarillo). Для MVP хватит **PO по email/PDF и учёта coil**. API-партнёрства подключаем после первых клиентов.

## 8. Интеграции лидов (доступ)

| Источник | Доступ |
|---|---|
| Thumbtack | Partner API, через Partnerships |
| Yelp Leads | только reseller-партнёры, иначе Zapier |
| Angi | односторонний webhook после одобрения (crmintegrations@angi.com) |
| Google LSA | Google Ads API (read-only leads), нужен developer token |
| Google Business Profile | заявка на доступ, рассмотрение до 14 дней |
| Meta Lead Ads | Graph API + App Review |
| Nextdoor | Conversions API по заявке |
| Call tracking | собственные номера Twilio на каждый источник + DNI. Для SMS нужна регистрация A2P 10DLC (1–4 недели) |

**Вывод:** заявки на партнёрства нужно подавать в самом начале разработки, согласования идут неделями и месяцами.

## 9. Деньги клиента и монетизация

- **Финансирование:** Wisetack (3.9%, до $65k) подходит для гаттеров. Для кровли нужен мульти-лендер в духе Hearth. Ежемесячный платёж показываем **прямо в смете**.
- **Платежи:** Stripe Connect, ACH (0.8%, cap $5) обязателен для крупных чеков. **В Калифорнии надбавку за оплату картой не делаем** (Civil Code §1748.1, SB 478). Вместо неё скидка за ACH или наличные (нужна юридическая проверка).
- **Отзывы:** запрос отправляем **всем** клиентам. Review gating запрещён правилами Google и FTC Rule 16 CFR 465, штраф около $51k за нарушение.
- **Apple (US):**
  - сейчас разрешена ссылка на оплату на сайте **без комиссии**;
  - Apple предлагает 5–15%, решение суда ожидается, так что в 2027 комиссия может вернуться;
  - стратегия: web-биллинг через Stripe, IAP через RevenueCat как запасной вариант, модули продаём **на компанию** (guideline 3.1.3(c)).
- **Google Play (US):** с 2026 комиссия 10% на первый $1M. Внешние платежи разрешены.

## 10. Рейтинг идей «помогаем подрядчику зарабатывать»

| # | Фича | Почему деньги | Impact | Effort |
|---|---|---|---|---|
| 1 | Speed-to-lead: AI-ответ на любой лид за 60 сек + запись на осмотр | на Thumbtack, Angi и Yelp выигрывает первый ответивший | 5 | 2 |
| 2 | Дожим неподписанных смет + трекинг открытий | возвращает 10–20% зависших смет | 5 | 2 |
| 3 | Финансирование в смете («от $X/мес») | выше средний чек и закрываемость | 5 | 2 |
| 4 | Good/Better/Best с готовыми gutter-пакетами | upsell в момент решения | 4 | 1 |
| 5 | **Gutter takeoff → BOM → смета → cut list → PO** | скорость, меньше ошибок и повторных выездов | 5 | 3 |
| 6 | **Агентный AI-оператор** (голос/текст/фото, EN/ES, preview + undo) | экономит часы владельца | 5 | 4 |
| 7 | Чек → расход → маржа по работе | реальная прибыль, перевыставление материалов | 4 | 2 |
| 8 | Замкнутый ROI по источникам + алерты («Angi убыточен») | перераспределение бюджета | 5 | 3 |
| 9 | Возврат конверсий в Google Ads, LSA, Meta CAPI | реклама учится на продажах | 4 | 2 |
| 10 | AI-ресепшн 24/7 **в базовом плане** | пропущенный звонок = потерянные деньги | 5 | 3 |
| 11 | Instant gutter quote по адресу на сайте | лид приходит сразу с ценой | 4 | 3 |
| 12 | Отзывы без gating + AI-ответы | local pack, органика | 4 | 2 |
| 13 | Реферальная программа в портале | самый дешёвый лид | 4 | 2 |
| 14 | Портал-витрина (профиль дома, гарантии, cross-sell) | LTV | 4 | 3 |
| 15 | Membership: чистка 2 раза в год с автосписанием | recurring revenue | 4 | 2 |
| 16 | Реактивация базы (гаттеры без guards, старые крыши) | деньги из уже имеющейся базы | 4 | 2 |
| 17 | WUI/FHSZ-проверка адреса → upsell негорючих guards | compliance-аргумент | 4 | 2 |
| 18 | Погодные триггеры (ливень в LA → кампания) | всплески спроса | 3 | 2 |
| 19 | ACH-first, депозит при подписи, tap-to-pay | кэшфлоу, экономия 2–3% | 4 | 2 |
| 20 | Учёт coil-склада и маржа с учётом отходов | маржа | 3 | 2 |
| 21 | AI price coach («твоя цена ниже рынка LA на 15%») | маржа | 4 | 3 |
| 22 | Photo-to-estimate | скорость | 4 | 4 |
| 23 | Субподряд gutters для кровельщиков (B2B-сеть) | новый канал заказов | 3 | 3 |
| 24 | EN/ES везде | рынок LA | 3 | 2 |
| 25 | Сезонная пауза аккаунта, пользователи без лимита, без контрактов | доверие, низкий порог входа | 3 | 1 |

## 11. Итог: позиционирование

**«CRM, которая зарабатывает тебе деньги, а не забирает их».**

1. **Честная цена:** без контрактов, без оплаты за места (или с большим лимитом), без скрытых add-ons, сезонная пауза, свободный выход с данными и номером. Это удар по главной боли рынка.
2. **Ядро, которое приносит деньги:** speed-to-lead, дожим смет, G/B/B + финансирование, отзывы, рефералки, membership, ROI рекламы. Всё это входит в базовый план.
3. **AI-оператор как центр продукта**, а не add-on. Он работает через те же сущности и права, что и пользователь.
4. **Вертикальная глубина через платные модули:** Gutters (takeoff, BOM, cut list, coil, WUI), затем Roofing (замеры, materials, production, insurance-lite).
5. **Качество:** стабильное mobile-first приложение, офлайн, EN/ES, живая поддержка.

### Что проверить дальше
- Реальные цены и процессы основателя (gutter-бизнес в LA).
- Условия партнёрских программ: Hover API, EagleView, ABC/SRS/Beacon, Thumbtack, Angi, Yelp, GBP, Meta.
- Точные цены Google Solar API.
- Reddit (r/gutters, r/sweatystartup, r/Roofing) нужно прочитать вручную.
- Юридическая проверка правил оплаты картой и ACH-скидки в CA, а также решения по комиссии Apple.

### Ключевые источники
Jobber pricing https://www.getjobber.com/pricing/ · HCP pricing https://www.housecallpro.com/pricing/ · Trustpilot ServiceTitan/HCP/Jobber/Workiz · Jobber AI Voice https://help.getjobber.com/en/articles/jobber-ai-voice-and-chat-beta/ · ServiceTitan Atlas https://www.servicetitan.com/blog/pantheon-max-atlas-homh-next-steps · Roofr https://roofr.com/pricing · EagleView https://www.eagleview.com/pricing/ · Hover https://hover.to/pricing · ArcSite gutters https://www.arcsite.com/feature-details/gutter-estimate-software · Builder Prime gutters https://www.builderprime.com/industries/gutters-gutter-guards · Google LSA API https://developers.google.com/google-ads/api/docs/campaigns/local-service-campaigns · Meta Lead Ads https://developers.facebook.com/docs/marketing-api/guides/lead-ads/ · Wisetack https://www.wisetack.com/press · Stripe Connect https://stripe.com/connect/pricing · CA surcharge https://www.oag.ca.gov/consumers/general/credit_card_surcharges · LA County WUI 2026 https://dpw.lacounty.gov/bsd/lib/fp/Building/Very%20High%20Fire%20Hazard%20Severity%20Zone/2026%20Code%20Version/Fire%20Hazard%20Notes%202026.pdf · Apple SBP https://developer.apple.com/app-store/small-business-program/ · RevenueCat https://www.revenuecat.com/blog/engineering/can-you-use-stripe-for-in-app-purchases

---

## 12. Новейшие игроки и как изменились старые (срез 16.11.2026)

Основатель называет Jobber, Housecall Pro и ServiceTitan «старыми». По интерфейсу и модели цены это так, но в 2025–2026 все трое выпустили AI-агентов и обновили мобильные приложения. Сравниваем их с теми, кто начал с AI и телефона. Все ссылки открыты **16.11.2026**. Пометки **[≈]**, **[?]**, **[вторично]** — как в шапке.

### 12.1. Основные конкуренты

**Jobber** (Канада, SMB). Это самая простая горизонтальная FSM. За 2025–2026 вышли: AI Receptionist для звонков и SMS, который с января 2026 сам переносит и отменяет визиты; Copilot — «бизнес-коуч» по данным компании; Jobber Voice (октябрь 2025: 100+ действий голосом; с 26.06.2026 — для всей бригады, есть испанский); офлайн-режим в приложении (18.03.2026); каталог Home Depot прямо в смете (25.02.2026).
- Платформа: iOS, Android, веб. Настройки и шаблоны смет — только на вебе.
- Цена: от $29/$49 в месяц (§2), Receptionist входит в Plus, для Grow — add-on.
- Сильная технология: голос в поле для всей бригады, живые цены поставщика в смете.
- Источники: https://productupdates.getjobber.com/134787-keep-working-in-jobber-even-without-internet · https://productupdates.getjobber.com/149891-jobber-voice-is-now-available-for-your-whole-team · https://productupdates.getjobber.com/129946-quote-faster-with-real-home-depot-pricing-and-inventory-info-right-in-jobber · https://www.pmmag.com/articles/106754-jobber-launches-ai-powered-receptionist

**Housecall Pro** (США, SMB). Пакет «AI Team»: CSR AI отвечает на звонки и бронирует работы даже ночью (весна 2025); с февраля 2026 CSR AI Chat отвечает в чате на сайте, собирает детали работы и зовёт человека, когда нужно. Прайс-лист импортируется из файла, есть готовые прайсы Profit Rhino. AI-сметы по фото в официальных материалах не найдены.
- Платформа: iOS, Android, веб. Техник работает только в приложении.
- Цена: от $59/$79 в месяц (§2).
- Сильная технология: AI-ресепшн плюс чат на сайте в одном пакете.
- Источники: https://housecallpro.com/resources/february-2026-product-updates/ · https://www.housecallpro.com/resources/news-press/release-notes/spring-2025-product-updates/ · https://help.housecallpro.com/en/articles/7173129-how-to-import-and-export-price-book-services-and-materials

**ServiceTitan** (enterprise, HVAC/plumbing, есть отдельные разделы для roofing и commercial). AI-помощник Atlas запущен 18.09.2025 и встроен в мобильное приложение: «Ask Atlas» внутри работы. Field Mobile App переписано с нуля и заменяет старое приложение; AI Nameplate Scan есть только в нём. Прайс-лист синхронизируется с каталогами поставщиков через Pricebook Connect.
- Платформа: iOS, Android, веб.
- Цена: по запросу, за техника (§2).
- Сильная технология: каталоги поставщиков с ночным обновлением цен и очередью «Updates»; консоль версий приложения у бригады.
- Источники: https://help.servicetitan.com/docs/atlas-in-mobile-overview · https://www.servicetitan.com/blog/fall-2025-release-guide · https://help.servicetitan.com/docs/full-procurement-integration-faq

**JobNimbus** (roofing и exteriors CRM). Scout — голосовой и текстовый помощник в мобильном приложении (20.01.2026, закрытая beta): создаёт работы, сметы, счета. AssistAI — телефонный ресепшн. NimbusLabs (август 2026) — ранний доступ к функциям по тумблеру. Analytics AI (октябрь 2026) — вопросы о бизнесе обычным языком, платный add-on. Есть интеграции заказов материалов с ABC, SRS, QXO.
- Платформа: iOS, Android, веб.
- Цена: публичной нет (§2).
- Сильная технология: ранний доступ к функциям, заказ материалов из сметы.
- Источники: https://www.fieldtechnologiesonline.com/doc/jobnimbus-unveils-scout-a-mobile-ai-assistant-designed-for-real-time-field-work-0001 · https://support.jobnimbus.com/what-is-nimbuslabs · https://www.utahbusiness.com/press-releases/2026/08/05/jobnimbus-launches-nimbuslabs-early-access-program-new-features/ · https://support.jobnimbus.com/how-do-integrated-suppliers-interact-with-material-orders

**AccuLynx** (roofing). Сильная сторона — интеграция с ABC Supply: каталог, живые цены, заказ из сметы в местный филиал, статусы заказа (готов, отгружен, доставлен, задержка).
- Платформа: iOS, Android, веб.
- Цена: по запросу (§2).
- Сильная технология: путь «смета → заказ материалов → трекинг» без выхода из CRM.
- Источник: https://acculynx.com/features/abc

**Roofr** (roofing). Отчёт замера по спутнику от $13, «Instant Estimator» даёт цену по адресу для сайта, есть AI Receptionist. В релизе 6.4 (июнь 2026) процент отходов из замера сам попадает в смету. По данным обзоров, нативного приложения нет, работает в браузере [вторично].
- Платформа: веб и мобильный веб [вторично].
- Цена: $0/$249/$349, пакеты пересобраны в 2026.
- Сильная технология: замер, смета и предложение в одном потоке.
- Источники: https://roofr.com/release-notes · https://roofr.com/measurements · https://help.roofr.com/en/articles/15545259-roofr-pricing-and-packaging-update-2026

**Contractor+** (США, mobile-first, SMB). Estimatic AI собирает смету из замера, аэрофотоотчёта или сметы конкурента с живыми ценами поставщиков. Ведёт PO в roofing-поставщика.
- Платформа: iOS, Android, веб.
- Цена: есть бесплатный старт [?]; карты 2.7%, ACH 1% (до $10).
- Сильная технология: AI-смета из чужого документа.
- Источники: https://www.contractorplus.app/ai-estimating-software · https://www.contractorplus.app/suppliers · https://apps.apple.com/us/app/contractor-invoice-estimate/id1526947450

### 12.2. Новейшие (2024–2026, AI-first или перезапуск)

**FieldCamp** — «AI-native field service management». Приложение в App Store с конца 2024 года [≈]. AI CSR принимает звонки, SMS, почту и чат, читает фото и видео (например, табличку оборудования). AI Dispatcher предлагает раскладку бригад и маршрутов, человек принимает или отклоняет. Estimate Drafter превращает заявку с фото в черновик сметы Good/Better/Best с рекомендованным вариантом.
- Платформа: iOS (в том числе iPad), веб.
- Цена: по обзорам от $249 в месяц [вторично], на сайте — по звонку.
- Сильная технология: AI предлагает, человек подтверждает; черновик сметы из фото заявки.
- Источники: https://fieldcamp.ai · https://apps.apple.com/app/id6737540187 · https://roboticsandautomationnews.com/2026/03/19/fieldcamp-introduces-ai-dispatcher-for-field-service-skills-matching-route-optimization-and-emergency-reshuffling-built-for-the-trades/99895

**Simpro Lightning** — перезапуск Simpro, AroFlo и BigChange как «AI-native» платформы (13–14.05.2026, крупнейший релиз группы). В центре AI Cooper, который отвечает на вопросы по данным компании и заранее предупреждает о проблемах. Четыре агента: FieldReady обучает техника, JobReady готовит бриф перед выездом, JobScribe записывает работу с голоса, JobBrief пишет итог для клиента. Новые агенты выходят каждый месяц, в планах 20+. Вместо квартальных релизов исправления выходят непрерывно. В июле 2026 вышел RAIN — встроенная воронка продаж и CRM.
- Платформа: веб и мобильное приложение.
- Цена: для существующих клиентов — как апгрейд платформы.
- Сильная технология: агенты по ролям и непрерывная выдача обновлений.
- Источники: https://itbrief.co.uk/story/simpro-launches-ai-platform-lightning-for-field-trades · https://www.businesswire.com/news/home/20260513010148/en/ · https://cfotech.com.au/story/simpro-launches-rain-with-ai-tools-for-field-service

**Foreman** (YC W2026, основан в 2026, 6 человек) — AI-платформа «от сметы до счёта» для trade-подрядчиков. Подрядчик загружает план, фото или описание, а AI делает takeoff, смету по объёму работ и предложение. Клиенты, документы, разрешения, фото и change orders живут внутри работы. Рядом стоят **Drillbit** (YC, запуск 09.02.2026, AI-ресепшн и AI-сметчик на своей CRM) и AI-слои поверх чужих FSM: **Ressl AI** (YC W26, работает даже в софте без API, читая интерфейс), **CentralComs** (YC, диспетчеризация внутри ServiceTitan, HCP и Jobber).
- Платформа: нет данных (Foreman), веб (Drillbit).
- Цена: нет данных.
- Сильная технология: смета из плана или фото, работа как контейнер для всех документов.
- Источники: https://www.ycombinator.com/companies/foreman · https://fondo.com/blog/drillbit-launches · https://fondo.com/blog/ressl-ai-launches · https://www.ycombinator.com/companies/centralcoms

**Вывод.** Новые игроки отличаются не экранами, а тем, что **AI делает черновик (смета, диспетчеризация, заметка), а человек подтверждает**. Старые игроки догоняют через add-ons. Ни у кого не найдено: входа по passkey, настоящего офлайна для смет и оплат, gutter-BOM.

## 13. Таблица «как у них сделано X»

«нет данных» означает, что в справке, changelog и пресс-релизах ответа нет. Это не значит, что функции нет.

### (a) Вход без пароля

| Кто | Как сделано | Источник |
|---|---|---|
| Jobber | почта и пароль; двухшаговая проверка только для действий Jobber Payments, включает владелец; вход через Google или Apple в справке не найден | https://help.getjobber.com/es/articles/security-passwords/ |
| Housecall Pro | «Continue with Google» и «Sign in with Apple» на вебе и в приложении (почта аккаунта должна совпадать); 2FA — код по SMS после пароля | https://help.housecallpro.com/en/articles/6390055-how-to-log-in-to-housecall-pro · https://help.housecallpro.com/en/articles/8536911-protect-your-account-with-two-factor-authentication |
| ServiceTitan | пароль плюс обязательная MFA (TOTP-приложение или SMS, пользователь выбирает при входе), SSO через корпоративный IdP; без пароля нет | https://help.servicetitan.com/docs/multi-factor-authentication-mfaenforcement |
| JobNimbus, AccuLynx, Roofr | нет данных | — |
| FieldCamp, Simpro, Foreman | нет данных | — |

**Итог:** passkeys не найдены ни у кого. Лучший найденный уровень — Google или Apple у HCP.

### (b) Настройки внутри раздела или в общих настройках

| Кто | Как сделано | Источник |
|---|---|---|
| Jobber | всё в общих «Gear → Settings» на jobber.com: каталог, Work Settings, напоминания по сметам. В приложении настройки не меняются, шаблоны смет только на вебе | https://help.getjobber.com/en/articles/work-settings/ · https://help.getjobber.com/en/articles/quote-templates/ |
| ServiceTitan | настройки обновления цен живут **внутри раздела**: Pricebook Connect → Updates → Settings (авто-обновление по полям, авто-отклонение) | https://help.servicetitan.com/docs/full-procurement-integration-faq |
| JobNimbus | общие Settings → NimbusLabs, у каждой функции два тумблера: «для себя» и «для всей компании» | https://support.jobnimbus.com/what-is-nimbuslabs |
| Housecall Pro | Price Book видят только админ и офис с правом «Update company account info» | https://help.housecallpro.com/en/articles/7173129-how-to-import-and-export-price-book-services-and-materials |
| Roofr, новые | нет данных | — |

### (c) Выбор значений в формах (меню, шторки, сегменты)

| Кто | Как сделано | Источник |
|---|---|---|
| Jobber (приложение) | экран «Add Line Item» — список из 100 позиций в порядке каталога с веба; Home Depot — поиск по названию прямо в строке сметы | https://help.getjobber.com/hc/en-us/articles/7760313735575 · https://help.getjobber.com/en/articles/jobber-and-the-home-depot-integration/ |
| ServiceTitan | Atlas: «Ask Atlas» в работе, затем выбор модуля из списка; при входе выбор способа MFA | https://help.servicetitan.com/docs/atlas-in-mobile-overview |
| Остальные | нет данных: справки не описывают тип контрола; экраны разобраны вручную в `docs/market/` | — |

### (d) Прайс поставщика и распознавание документов

| Кто | Как сделано | Источник |
|---|---|---|
| Jobber | каталог Home Depot (3M+ товаров) в смете: живая цена, остаток в 20 ближайших магазинах, своя цена Pro Xtra; на сохранённом шаблоне сметы баннер «цены изменились». В свой каталог эти товары пока не сохраняются | https://help.getjobber.com/en/articles/jobber-and-the-home-depot-integration/ |
| Housecall Pro | импорт Excel/CSV в фоне, письмо по готовности; импорт из QuickBooks; готовые прайсы Profit Rhino; на MAX импорт делает команда HCP. AI-распознавание не найдено | https://help.housecallpro.com/en/articles/7173129-how-to-import-and-export-price-book-services-and-materials · https://help.housecallpro.com/en/articles/8754493-profit-rhino-overview |
| ServiceTitan | Pricebook Connect: каталоги поставщиков, сопоставление по артикулу («High Match»), загрузка истории закупок, цены обновляются ночью, очередь Updates «применить / отклонить / авто», журнал History Log. AI Nameplate Scan читает табличку оборудования | https://help.servicetitan.com/docs/full-procurement-integration-faq · https://help.servicetitan.com/docs/costs-dont-populate-after-a-pricebook-import |
| JobNimbus | заказ материалов из сметы; кнопка «Change to Supplier» подбирает похожие позиции другого поставщика; счёт и фото доставки QXO сами ложатся в документы заказа. В NimbusLabs есть «AI Material Order Import» [вторично] | https://support.jobnimbus.com/how-do-integrated-suppliers-interact-with-material-orders · https://www.rooferscoffeeshop.com/post/jobnimbus-launches-nimbuslabs-an-early-access-program-for-new-features |
| AccuLynx | каталог ABC и живые цены, новые цены поставщика подтягиваются сами, заказ из сметы | https://acculynx.com/features/abc |
| Contractor+ | AI-смета из замера, аэроотчёта или **сметы конкурента** с живыми ценами нескольких поставщиков | https://www.contractorplus.app/ai-estimating-software |
| FieldCamp | черновик сметы G/B/B из заявки с фото; импорт прайса не описан | https://fieldcamp.ai |

### (e) Обновление приложения и новые версии

| Кто | Как сделано | Источник |
|---|---|---|
| ServiceTitan | **Mobile Device Console**: версия приложения у каждого техника со статусом Latest / Rolling out / Outdated / Unsupported, кнопка «Notify N outdated». Устройство ниже минимума остаётся на последней совместимой версии. Старое приложение работает до даты перехода аккаунта | https://help.servicetitan.com/v1/docs/track-your-team-s-field-mobile-app-versions-with-the-mobile-command-center · https://help.servicetitan.com/docs/system-requirements |
| JobNimbus | NimbusLabs: новые функции включает админ (для себя или для компании), есть «Submit Feedback». Когда функция выходит для всех, она помечается «Managed by JobNimbus» и выключить её уже нельзя | https://support.jobnimbus.com/what-is-nimbuslabs |
| Jobber | публичный changelog с датой и тегом раздела (Mobile App и др.) | https://productupdates.getjobber.com/134787-keep-working-in-jobber-even-without-internet |
| Roofr | нумерованные заметки о релизах (6.4, 7.2, 7.5…) | https://roofr.com/release-notes |
| Housecall Pro | ежемесячные страницы release notes | https://housecallpro.com/resources/february-2026-product-updates/ |
| Simpro Lightning | непрерывная выдача исправлений вместо квартальной, новые агенты каждый месяц | https://itbrief.co.uk/story/simpro-launches-ai-platform-lightning-for-field-trades |

### (f) Сметы с чертежом и замером

| Кто | Как сделано | Источник |
|---|---|---|
| RoofSnap | отдельный **gutter-отчёт**: LF по eaves, гаттерам и сеткам, отметки end caps и miters, предлагаемые места водостоков, +5% отходов, срок 4 часа. **Высоту водостоков не меряют** — её вводят вручную | https://support.roofsnap.com/hc/en-us/articles/21976861623831-NEW-FEATURE-Gutter-Measurement-Reports |
| Hover | скан телефоном ~5 минут даёт 3D-модель с гаттерами и водостоками; в PDF есть раздел gutter systems | https://hover.to/measurements/siding · https://help.hover.to/articles/1215021-understanding-hover-s-measurements-pdf |
| Roofr | отчёт по крыше (eaves есть, отдельной строки гаттеров нет), отходы из отчёта идут в смету, Instant Estimator по адресу | https://roofr.com/measurements · https://roofr.com/release-notes |
| EagleView | gutter report $13.75 (§7) | https://www.eagleview.com/pricing/ |
| Contractor+ | аэрозамеры прямо в смете | https://contractorplus.app/integrations |
| Foreman | takeoff из плана или фото | https://www.ycombinator.com/companies/foreman |
| Jobber, HCP, ServiceTitan | своего замера нет, только сторонние интеграции | нет данных |

## 14. Что взять OCTODEX

Решение о попадании в 1.0 — за руководителем (правило 22). Ниже указано, к какой спеке или задаче относится каждая идея.

1. **Вход без пароля лучше, чем у всех** (спека 52). Код на почту или SMS плюс Sign in with Apple и Google, как у HCP, но без пароля вообще. Passkey — следующий шаг: у конкурентов его нет. Дополнительную проверку просить только на денежных действиях (как Jobber Payments), а не при каждом входе.
2. **Настройки там, где работа** (#1920). Образец — ServiceTitan «Pricebook Connect → Updates → Settings»: правила обновления цен лежат рядом с самими обновлениями. Антипример — Jobber, где на телефоне настройки менять нельзя. Для «телефон-first» это наше преимущество. Разделить «для меня» и «для компании», как тумблеры NimbusLabs.
3. **Очередь «Изменения цен» с решением по каждой строке** (спека 53). Как Updates у ServiceTitan: «принять / отклонить», авто-принятие по выбранным полям, журнал. Плюс баннер Jobber «цены изменились» на сохранённой смете или шаблоне.
4. **Сопоставление по артикулу с уровнем совпадения** (спеки 53, 54). Точный артикул — сразу; совпадение по названию — «проверьте». Повторяет «High Match» у ServiceTitan и защищает от ошибочной склейки позиций.
5. **Документ поставщика → черновик → проверка человеком** (спеки 53, 51). Фото или PDF счёта даёт черновик строк, строки с низкой уверенностью уходят в отдельную очередь, исходный файл прикрепляется к заказу (как QXO-счета у JobNimbus). AI предлагает, человек подтверждает — так делают все новые игроки (FieldCamp, Lightning).
6. **Версии у бригады** (#1912). Владелец видит версию приложения у каждого человека: «свежая / обновляется / устарела / не поддерживается» и кнопку «напомнить» (ServiceTitan). В приложении — короткий список «что нового» с датой. Ранний доступ к функциям по тумблеру (NimbusLabs) — копилка после 1.0.
7. **Поиск позиции прямо в строке сметы** (спека 56). Вместо длинного списка из 100 строк, как в Jobber: поиск плюс недавние, а каталог поставщика — второй источник в той же шторке («нет в каталоге — найти в прайсе»).
8. **Gutters: закрыть то, чего нет у RoofSnap** (спеки 33). Рынок отдаёт LF и отметки углов, концевиков и водостоков, но **не высоту водостоков**. Наш чертёж с этажами (`drawing.story1..4`) считает её сам — это довод в продажах. Процент отходов из замера сразу в смету (Roofr 6.4). Импорт LF из внешнего отчёта (Hover, EagleView, RoofSnap) как черновик рисунка — после 1.0.
9. **Голос в поле для всей бригады, EN/ES** (AI-оператор, §5) — после 1.0. Jobber уже даёт его всем ролям, значит это скоро станет нормой рынка.
10. **Черновик G/B/B из фото заявки** (FieldCamp) — копилка после 1.0, рядом с идеей №22 из §10.

## 15. Open-source: что посмотреть (зависимости не добавляем)

| Репозиторий | Что это | Чем полезен |
|---|---|---|
| https://github.com/crater-invoice/crater-mobile | Expo/React Native клиент для open-source счетов и смет Crater (356★, **AGPL-3.0**) | образец мобильных экранов «смета → счёт» на нашем стеке. Код не копировать из-за AGPL |
| https://github.com/kodlyft/fsm | FSM на Frappe/ERPNext, приложение техника на Ionic и Capacitor с офлайн-работами (MIT, молодой, 4★) | схема данных FSM (смета, работа, визит, счёт) и подход к офлайну техника |
| https://github.com/invoice-x/invoice2data | разбор PDF-счетов по YAML-шаблонам на regex, плагин для строк, опционально AI (MIT, 2.3k★) | детерминированный шаблон «на поставщика» для повторяющихся прайсов, без LLM, — для спеки 53 |
| https://github.com/docling-project/docling | PDF и изображения → структура с таблицами (MIT, 70k★) | извлечение таблиц прайса на сервере, эталон для сравнения качества |
| https://github.com/mercoa-finance/llm-document-ocr | Node: PDF → PNG, обрезка полей, LLM → JSON по списку полей (MIT, 110★) | паттерн для серверной функции распознавания: подготовка страниц и строгий JSON |

## 16. Ограничения среза

- Справки многих вендоров (Jobber changelog, Simpro) отдают 403 роботам. Часть фактов взята из пресс-релизов и отраслевых СМИ и помечена **[вторично]**.
- «нет данных» по входу, настройкам и выбору значений нужно проверить вручную на пробных аккаунтах (`docs/market/`).
- Нативное приложение Roofr и цена FieldCamp подтверждены только обзорами.
