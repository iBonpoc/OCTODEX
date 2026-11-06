# 01. Анализ конкурентов

> Экран за экраном и матрица функций — `docs/market/`.

> Срез: ноябрь 2026. Рынок: US home services, старт Лос-Анджелес; первая ниша Gutters, затем Roofing.
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
