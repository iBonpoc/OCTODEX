# 04. Словарь сущностей (Domain Model)

> Статус: черновик **v0.3.1**, ноябрь 2026. Источник правды для базы данных, API, типов приложения и инструментов AI-помощника.
> v0.3.1: требования юридического исследования `legal/legal-research.md` (LEG-01…LEG-22): тип договора CA, подпись подрядчика (countersign), согласие E-SIGN (`ESignConsent`), правила срока отказа как данные (`ContractRuleSet`), CA-шаблон договора (`ContractTemplate`), собственник 65+, ремонт после ЧС, бумажная Notice of Cancellation, график платежей, журнал SMS-согласий (`ConsentRecord`, `ConsentText`), поля лицензии/WC/AB5 субподрядчика, пороги 1099-NEC по годам, плата за возвращённый чек. Журнал — §13.3.
> v0.3: решения основателя от 03.11.2026 (второй пакет) — тестовый price book, массовый импорт/экспорт (`ImportJob`, `ImportRow`, `ImportMapping` вместо `PriceListImport`), AI-скан прайса и ценника в MVP, цены поставщиков и каталога без налога, налог при покупке у поставщика, налоговые профили (`TaxProfile`, PRD `03-prd/19-taxes.md`), стандарты расчёта гаттеров (высоты этажей, колена, отходы). Журнал — §13.2.
> v0.2: внесены предложения «Изменения модели данных» из всех PRD (`03-prd/01…17`, раздел 14, и `18-money-test-cases.md` §I), дубли сведены, решения основателя от 03.11.2026 отражены везде. Журнал изменений — §13. Открытые решения для основателя — `03-prd/00-decisions-for-founder.md`.
> Продукт: **Octo** (рабочее название). Кода пока нет, всё проектируется с нуля.
> Термины: **сущность** — объект (Клиент, Смета); **поле** — его характеристика (имя, номер, сумма).

---

## 0. Общие правила для всех сущностей

| Правило | Как |
|---|---|
| Идентификатор | `id` UUID v7 (сортируется по времени, можно создавать офлайн на телефоне) |
| Принадлежность | Каждая бизнес-запись имеет `company_id`. Изоляция компаний на уровне базы (RLS). Исключение — сущности платформы Octo (§8a) |
| Служебные поля | `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (мягкое удаление), `row_version` (для синхронизации и конфликтов) |
| Поля синхронизации | У всех синхронизируемых записей: `created_at_device` (время действия на телефоне), `synced_at` (когда принял сервер), `origin_device_id` → Device (PRD 16) |
| Деньги | Целые **центы** (`amount_cents: int`) + `currency` (по умолчанию `USD`). Никаких float. Округление везде одно: **round half up** |
| Проценты и ставки | Базисные пункты `*_bps` (950 = 9.50%) |
| Цены и налог (v0.3) | Все цены и себестоимость в каталоге и у поставщиков хранятся **без налога**. Налог клиенту — по режиму `TaxProfile` документа, налог при покупке — по ставке поставщика (§6, PRD 19) |
| Длины | Десятичные **футы** с точностью до 1/8″ (`length_ft: numeric(10,3)`). Отображение: 148′ 6″ |
| Время | Хранится в UTC. У компании `timezone` (по умолчанию `America/Los_Angeles`) |
| Номера документов | Человеческий номер на уровне компании: `EST-0148`, `INV-0093`, `JOB-0210`, `PO-0031`, `CO-0004`, `RCT-0001` (квитанция об оплате (из анализа внешней CRM)). Присваивает **только сервер** (офлайн — «черновик» без номера) |
| Статусы | Только через разрешённые переходы (state machine, §9). Каждый переход пишется в `StatusEvent` |
| Идемпотентность | Операции «создать платёж», «смета → работа», «отправить клиенту», «отправить PO», операции outbox принимают `idempotency_key`. Повтор не создаёт дубль |
| Аудит | Значимые изменения пишутся в `AuditLog`: кто (человек, AI по команде человека, клиент, поддержка, система), что, когда, было → стало |
| Удаление | Документы с деньгами (инвойс, платёж) не удаляются, только `void` или refund. Позиции каталога, поставщики, источники — только архив (`is_active = false`) |
| Настройки компании | Группы настроек — json-поля `Company.*_settings` (§1); у каждой есть значения по умолчанию на уровне продукта |

---

## 1. Аккаунты, компании, доступ

### User — человек, который входит в Octo
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| email | text, unique | да | Логин (email-код или Sign in with Apple) |
| full_name | text | да | |
| phone | text | нет | |
| locale | enum `en`/`es`/`ru` | да | Язык интерфейса |
| avatar_file_id | → File | нет | |
| last_active_company_id | → Company | нет | Для открытия последнего контекста |

### Company — юридическое лицо (бизнес подрядчика)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| name, legal_name | text | да | |
| phone, email | text | да | Для документов, reply-to писем (PRD 01) |
| license_number | text | нет | Лицензия CSLB (CA). Пустая → предупреждение при отправке сметы; для CA-договора — блок отправки (v0.3.1, LEG-07). Печатается на сметах, договорах, инвойсах, PDF, `PublicProfile`, подписи email, в HELP-ответе и первом SMS кампании (B&P §7030.5) |
| license_class, license_expires_on | text[], date | нет | (v0.3.1) Класс(ы) CSLB (C-61/D-24, C-39…) и срок; обязательны для CA-договора |
| contract_settings | json | | (v0.3.1, LEG-05, LEG-07) `cgl` {insurer, phone, none}, `workers_comp` {kind `policy`/`exemption`, insurer, policy_no, expires_on}, `cancellation_email`, `cancellation_address`, `cancellation_help_phone`, `paper_notice_of_cancellation` (**вкл.** до ответа юриста Б1), `auto_countersign` {enabled (выкл.), signer_membership_id, signature_file_id, attested_at}, `require_attorney_reviewed_template` (вкл. для CA), `default_contract_type`, `jurisdiction` (`US-CA` → `ContractRuleSet`) |
| ein | text, зашифровано | нет | |
| timezone, currency | text | да | |
| address | Address (встроенный) | да | |
| primary_trade | `gutters`, `roofing`, `other` | да | Из онбординга |
| service_area | json: города, ZIP[] | нет | Зона работ (онбординг, онлайн-запись, SEO) |
| onboarding_state | json | | Шаги онбординга и чек-лист «Настройка» |
| brand | json: logo, цвета, подпись | нет | Для документов и портала |
| default_client_locale | `en` / `es` | да | Язык документов и сообщений клиентам по умолчанию (`en`); отдельно от языка интерфейса `User.locale` (владелец работает на русском, клиенты читают на английском). `Contact.preferred_language` перекрывает (из анализа внешней CRM) |
| public_slug | text, unique | да | Адрес публичной страницы `octo.app/p/bonpoc-gutters` |
| trade_modules | ← Entitlement | | Включённые модули |
| stripe_account_id | text | нет | Stripe Connect |
| numbering | json | да | Префиксы и счётчики документов |
| tax_settings | json | да | (v0.3) `default_tax_profile_id` → TaxProfile (ровно один профиль по умолчанию), `default_purchase_tax_rate_id` → TaxRate (налог при покупке, если у поставщика не задан; заглушка «LA area 10.25% — проверить»). Поля v0.2 `default_enabled`, `default_tax_rate_id`, `default_taxable_scope`, `deposit_tax_mode` **переехали в TaxProfile** (§6) |
| gutter_settings | json | | (v0.3) Стандарты компании для модуля Gutters, переопределяют `Assembly.constants`: `story_heights_ft` ({1:10, 2:20, 3:30, 4:40}, можно добавить 5+), `ds_extension_ft` (0), `coil_waste_pct` (5%, допустимо 0–100%), `hanger_spacing_ft` (2), `default_elbows` ([{style: A, qty: 3}]) и прочие константы PRD 06 §7.6 |
| inbound_lead_address | text, unique | да | `leads-<slug>@in.octo.app` (пересылка писем маркетплейсов, PRD 02) |
| lead_default_assignee_id | → User | нет | Кому назначать новые лиды (по умолчанию owner) |
| lead_response_alert_min | int | | Порог «таймер красный», по умолчанию 5 |
| business_hours | json | | Рабочие часы (повторные push, quiet hours) |
| sms_number | text | нет | Номер Twilio (PRD 13) |
| a2p_brand_status, a2p_campaign_status | `not_started`/`pending`/`approved`/`rejected` | | 10DLC |
| referral_reward | json | | Награда рефереру / скидка новому (по умолчанию $50 / $25) |
| estimate_settings | json | | `default_expiry_days` (30), `min_margin_bps` (3500), `margin_override_role`, `ca_deposit_cap` (вкл. для CA; v0.3.1: для всех жилых HIC, не только от $500), `followup_days[]` (PRD 04, 05) |
| payment_settings | json | | `deposit_default_pct`, `terms_days`, `ach_recommend_threshold_cents` ($1,000), напоминания, `method_discount` (флаг, выкл.) (PRD 09). Реквизиты ручной оплаты для инвойса и портала (из анализа внешней CRM): `manual_methods[]` (`zelle`, `check`, `cash`, `bank_transfer`), `zelle_handle`, `check_payable_to`, `check_mail_address`, `bank_transfer_instructions`. (v0.3.1, LEG-17) `returned_check_fee` {`enabled` (false), `first_cents` ≤ 2500, `subsequent_cents` ≤ 3500; только `method=check`}, `method_discount.legal_review_confirmed_at` |
| costing_settings | json | | `default_markup_pct` (billable), `target_margin_pct`, `default_labor_rate_cents`, `expense_alert_threshold_cents` (PRD 10) |
| scheduling_settings | json | | Окна прибытия, длительности по типам визитов, рабочие часы, «время по бригаде» (PRD 07) |
| subcontractor_settings | json | | `coi_warning_days` (30), `block_on_expired_coi` (выкл.: предупреждение + подтверждение), `form_1099_thresholds` {год: центы} (v0.3.1 вместо `form_1099_threshold_cents`: 2025 — 60000, 2026 — **200000**, 2027+ — индексация IRS), `unlicensed_work_threshold_cents` (v0.3.1: **100000**, AB 2622 — вместо $500), `block_unlicensed_over_threshold` (выкл.), `trade_license_classes` (trade → классы CSLB) (PRD 07, 14) |

### CompanyGroup — объединение компаний одного владельца
| Поле | Тип | Описание |
|---|---|---|
| name | text | «Bonpoc Group» |
| owner_user_id | → User | Только владелец создаёт и меняет группу |
| companies | ← Company[] (через `CompanyGroupMember`) | Компания входит максимум в одну группу |

### CompanyGroupMember
`group_id`, `company_id` (unique — компания максимум в одной группе), `added_by`, `added_at`. Разделение группы данные не перемещает.

### Membership — роль человека в компании
| Поле | Тип | Описание |
|---|---|---|
| user_id, company_id | → | Уникальная пара |
| role | enum: `owner`, `admin`, `office`, `sales`, `tech`, `subcontractor` | **MVP:** owner, admin, office, tech, subcontractor. `sales` есть в enum, UI — позже |
| status | `invited`, `active`, `suspended` | |
| permissions_override | json | Точечные исключения (например, tech может отправлять сметы, office видит ROI) |
| color | text | Цвет человека в календаре |
| invited_by, invite_token_hash, invite_expires_at | → User, text, timestamp | Приглашение (7 дней, одноразовое) |
| suspended_at | timestamp | Отключение: отзыв сессий, стирание кэша на устройстве |
| home_base | Address + geo, nullable | Старт маршрута дня (PRD 08) |
| share_location | bool | Согласие на передачу геопозиции (PRD 08). Для `subcontractor` всегда false. (v0.3.1, LEG-19) Передача только во время выезда (шаги `en_route` / `on_site` / `working` / `signed`, 7б-2); `location_notice_ack_at` — подтверждение уведомления сотрудником; история 30 дней; требования AB 1331 (Ch. 851, 2026) — проверить у адвоката |
| his_registration_number | text | (v0.3.1, LEG-08) Регистрация Home Improvement Salesperson в CSLB; печатается в CA-договоре; пусто у отправителя договора → предупреждение (исключения: officer / qualifier из записи лицензии — `his_exempt_reason`) |
| can_sign_contracts | bool | (v0.3.1, LEG-03) Право `sign_contracts`: countersign договоров от имени компании. По умолчанию true только у owner |
| countersign_signature_file_id | → File | (v0.3.1) Загруженная подпись для автоподписи компании (`Company.contract_settings.auto_countersign`) |

У человека с ролью `subcontractor` есть связанная запись `Subcontractor.user_id` (§5). Субподрядчик без входа в Octo Membership не имеет и работает по защищённой ссылке.

### Матрица прав (кратко)
| Действие | owner | admin | office | sales (позже) | tech | sub |
|---|---|---|---|---|---|---|
| Видеть себестоимость и маржу | ✅ | ✅ | ✅ | настраивается | ❌ | ❌ |
| Создавать и отправлять сметы | ✅ | ✅ | ✅ | ✅ | черновик (⚙ отправка) | ❌ |
| Видеть всех клиентов | ✅ | ✅ | ✅ | ✅ | только свои работы | только адрес и доступ по своим нарядам |
| Видеть цены клиента (сметы, инвойсы, баланс) | ✅ | ✅ | ✅ | ✅ | ✅ (без себестоимости) | ❌ никогда |
| Принимать оплату | ✅ | ✅ | ✅ | ✅ | ✅ на объекте | ❌ |
| Возврат денег, void инвойса | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Назначать субподрядчиков, одобрять наряды к оплате | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Записывать выплаты субподрядчикам, отчёт 1099 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Свои наряды: принять, «готово», фото | — | — | — | — | — | ✅ |
| Настройки, роли, тарифы | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Экспорт всех данных | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Объединённый вид группы | только владелец группы и члены всех её компаний |

Фильтрация полей (себестоимость, цены клиента для `sub`) выполняется **на сервере** (RLS + проекции API) и при синхронизации на устройство, а не только в UI.

---

## 2. CRM: лиды, клиенты, объекты

### Address (встроенный тип)
`line1`, `line2`, `unit` (квартира, ADU), `city`, `state`, `zip`, `country` (US), `normalized` (USPS-формат, для поиска дублей).

### Customer — клиент (человек или организация, которая платит)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| kind | `person` / `business` | да | |
| display_name | text | да | «Yuri Petrov», «Glendale HOA» |
| first_name, last_name, company_name | text | | |
| primary_contact_id | → Contact | | |
| billing_address | Address | нет | |
| lead_source_id | → LeadSource | нет | Первый источник (кто привёл). Ставится один раз, меняет только owner |
| tags | text[] | | |
| status | `active`, `archived`, `do_not_service` | да | |
| do_not_service_reason | text | при `do_not_service` | |
| lifetime_value_cents | int, вычисляемое | | Σ успешных платежей − Σ возвратов |
| notes | text | | Только для импорта; рабочие заметки — `Activity(kind=note)` |
| match_key | text, вычисляемое | | Нормализованный телефон и email для поиска дублей и cross-company совпадений |
| merged_into_customer_id | → Customer | нет | После слияния дублей |
| anonymized_at | timestamp | нет | CCPA-удаление персональных данных |
| referral_code | text, unique в компании | нет | Личная реферальная ссылка `?ref=` (PRD 12, 13) |
| referral_link_clicks | int | | Клики по ссылке |
| review_status | `not_asked`, `asked`, `left`, `do_not_ask` | | (из анализа внешней CRM) `left` — уже оставил отзыв, `do_not_ask` — клиент сам попросил не писать; автоматизация отзывов таких пропускает. Ставится по факту или по просьбе клиента, **никогда** по оценке удовлетворённости (не review gating) |
| review_status_at | timestamp | | Когда изменён `review_status` |

### Contact — контактное лицо
| Поле | Тип | Описание |
|---|---|---|
| customer_id | → Customer | |
| name, phone, email | text | |
| role | `owner`, `tenant`, `property_manager`, `spouse`, `other` | |
| is_primary, is_active | bool | Один primary на клиента |
| preferred_language | `en` / `es` | |
| sms_opt_in, sms_marketing_opt_in | bool + дата согласия | Транзакционные / маркетинговые SMS (TCPA). (v0.3.1) **Вычисляемые** из последней `ConsentRecord` по категории (§8) |
| sms_consent_status | `unknown` / `opted_in` / `opted_out` / `pending_revocation_review` | (v0.3.1) Импорт всегда даёт `unknown` |
| consent_source | `web_form`, `portal`, `estimate_sign`, `verbal_recorded_by_user`, `customer_texted_first`, `paper_form_photo`, `attestation` | (v0.3.1) `import` **удалён**: импорт никогда не создаёт согласие (LEG-10); источник последней записи `ConsentRecord` |
| consent_text_version, consent_ip | text | Доказательство согласия (денормализация последней `ConsentRecord`) |
| is_team_member | bool | (v0.3.1, LEG-12) Член команды или родственник — не получает запрос отзыва |
| sms_opted_out_at, email_unsubscribed_at | timestamp | STOP / отписка (блок на сервере) |
| email_opt_in | bool + дата | |
| sms_undeliverable | bool | Стационарный/неверный номер |
| email_bounced_at, email_bounce_kind | timestamp, `hard` / `soft` / `complaint` | (из анализа внешней CRM) Из вебхуков почтового провайдера. `hard` и `complaint` блокируют email на сервере (защита репутации домена); `soft` — после 3 подряд |

### Property — объект (дом, адрес, где делается работа)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| customer_id | → Customer | да | Владелец-плательщик (может смениться) |
| address | Address | да | Улица, город, ZIP, штат, unit |
| label | text | нет | Человеческое имя объекта: «Дом», «Rental on 5th» (у клиента часто несколько домов) (из анализа внешней CRM) |
| kind | `single_family`, `multi_family`, `commercial`, `hoa_common` | нет | Тип объекта для фильтров и шаблонов смет (из анализа внешней CRM) |
| geo | lat, lng | да (геокодинг) | Для карты и спутника |
| geo_source | `geocoder`, `manual` | | Ручная правка пина не перезаписывается геокодером |
| stories | int | нет | Этажность (влияет на смету) |
| story_heights_override_ft | json | нет | (v0.3) Свои высоты этажей объекта `{этаж: ft}` (дом на склоне, высокие потолки); перекрывает `Company.gutter_settings.story_heights_ft` (PRD 06 §7.4) |
| roof_type | `comp_shingle`, `tile_clay`, `tile_concrete`, `metal`, `flat`, `other` | нет | В LA часто tile |
| fire_zone | `none`, `moderate`, `high`, `very_high` | нет | Из данных CAL FIRE (FHSZ) |
| fire_zone_source, fire_zone_checked_at | `manual`/`calfire`, date | | MVP — вручную |
| gate_code | text, **шифрование поля**, видно только команде | нет | Tech и субподрядчик видят только в день работ и накануне; не уходит в CSV по умолчанию и в AI-контекст |
| access_notes | text, видно только команде | нет | |
| photos | ← File[] | | |
| attributes | json | | Расширяемые поля модулей (например, длина гаттеров текущей системы) |
| offline_imagery_ready_at | timestamp | | Снимок скачан для офлайна (PRD 16) |

**Решение основателя (03.11.2026):** у клиента **часто несколько домов**, а на одном доме бывает **несколько работ одновременно или по очереди** (например, монтаж гаттеров и параллельно ремонт fascia, потом чистка по графику). Поэтому:
- «Объекты» — отдельный раздел меню, а не только вкладка в клиенте;
- у объекта своя лента: все сметы, работы, визиты, фото, гарантии;
- у одного объекта может быть сколько угодно открытых смет и работ, в том числе одновременно; связь Property 1 → N Estimate / Job без ограничений;
- при смене владельца дома история объекта остаётся на объекте, документы с деньгами — у прежнего клиента.

### PropertyContact — контакт на объекте
`property_id`, `contact_id`, `role` (как у Contact), `receives_visit_notifications bool` (напоминания и «в пути» идут им), `is_active`. У объекта несколько контактов (жилец, управляющий).

### Lead — обращение, ещё не ставшее работой
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| status | см. §9 | да | |
| source_id | → LeadSource | да | Откуда пришёл |
| source_ref | text | нет | Внешний id (Thumbtack lead id, Angi id) |
| customer_id, property_id | → | нет | Привязываются при квалификации (лид может быть до клиента). Если у клиента несколько объектов — выбирается по адресу лида или создаётся новый |
| contact_name, phone, email, address_text | text | | Сырые данные из обращения |
| phone_is_relay | bool | | Маскированный номер площадки (Thumbtack relay): не участвует в поиске дублей и `match_key`, маркетинговые SMS на него не идут (из анализа внешней CRM) |
| geo, geo_status | lat/lng, `ok`/`failed`/`manual`/`approx` | | Лид на карте до создания Property. `approx` — известен только ZIP/город, пин в центре зоны, в маршрут не ставится (из анализа внешней CRM) |
| service_requested | text + → ServiceCategory | | «Seamless gutters 2 story» |
| cost_cents | int | нет | Сколько стоил этот лид (Thumbtack списал $45). Сохраняется и у lost/duplicate |
| cost_origin | `provider`, `manual`, `source_default` | | Откуда взята стоимость (из анализа внешней CRM) |
| cost_refunded_cents, cost_refund_status | int, `none`/`requested`/`approved`/`denied` | | Возврат площадки за плохой лид. Чистая стоимость лида в ROI = `cost_cents − cost_refunded_cents` (из анализа внешней CRM) |
| first_response_at | timestamp | | Для метрики скорости ответа |
| first_response_kind | `call`, `sms`, `email`, `marketplace`, `manual` | | |
| last_inbound_at, last_outbound_at | timestamp | | Последнее сообщение/звонок от клиента и от нас. Ставит сервер, значения только растут (защита от гонок вебхуков). «Чей ход»: `last_inbound_at > last_outbound_at` → ждём нашего ответа (из анализа внешней CRM) |
| assigned_to | → User | | |
| lost_reason | enum: `price_too_high`, `no_response`, `chose_competitor`, `not_ready_timing`, `out_of_service_area`, `service_not_offered`, `junk_spam`, `duplicate`, `other` + текст | при `lost` | Для `other` текст обязателен |
| duplicate_of_lead_id | → Lead | нет | Слияние дублей |
| parse_status | `ok`, `needs_review` | | Разбор письма маркетплейса |
| raw_file_id | → File | нет | Исходное письмо |
| inbound_message_id | text | нет | Message-ID письма (дедуп) |
| existing_customer | bool, вычисляемое | | «Уже клиент» при создании |
| referred_from_visit_id | → Visit | нет | Лид от монтажника на объекте («сосед») |
| next_step_due_at | timestamp, вычисляемое | | Из открытой Task / Visit |
| campaign_id | → Campaign | нет | Пришёл из сезонной кампании (Запуск) |
| utm, landing_page, gclid | json | | Атрибуция рекламы |

### LeadSource — канал
| Поле | Тип | Описание |
|---|---|---|
| name | text | Google LSA, Google Ads, Thumbtack, Yelp, Angi, Nextdoor, Сарафан, Сайт, Портал, Повторный клиент, Реферал |
| kind | `paid_per_lead`, `paid_ads`, `organic`, `referral`, `repeat` | |
| is_system | bool | Системные нельзя удалить |
| is_active | bool | Скрыть вместо удаления |
| default_cost_cents | int | Цена лида по умолчанию (`paid_per_lead`) |
| sender_patterns | text[] | Домены/адреса для распознавания писем |
| deep_link_template | text | Открыть лид в площадке |

### MarketingSpend — расходы на канал
`company_id`, `source_id`, `period_start`, `period_end`, `amount_cents` (может быть < 0: возврат площадки), `kind` (`subscription`, `ads`, `per_lead_adjustment`, `other`), `expense_id` (→ Expense, если затрата заведена как расход `category=marketing` — без двойного ввода), `note`, `created_by`. Сумма затрат за период, по которой считается стоимость лида и окупаемость (ROI).

### Activity (лента событий)
Всё, что произошло с клиентом, объектом, лидом или работой: звонок, SMS, письмо, заметка, смена статуса, открытие сметы клиентом, оплата. Поля: `subject_type`, `subject_id`, `kind`, `payload json`, `actor` (user / customer / system / ai / subcontractor). Для `kind=note`: `body`, `file_ids[]`, `pinned bool` (до 3 закреплённых), `visibility` (`team` по умолчанию / `internal_owner`). Лента объекта собирает Activity объекта и всех его смет, работ, визитов.

### Task — задача или напоминание
`title`, `due_at`, `assigned_to`, `subject_type/id`, `status (open/done/cancelled)`, `source (manual/automation/ai)`, `automation_key` (дедуп задач автоматизаций), `completed_at`, `completed_by`.

---

## 3. Каталог, поставщики, движок смет

### ServiceCategory — направление и вид работ (из анализа внешней CRM)
Раньше только упоминалась (Lead, CatalogItem, PublicProfile, PRD 02/12), теперь определена.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «Gutters», «Seamless gutter install», «Gutter cleaning», «Roofing › Repair» |
| parent_id | → ServiceCategory, нет | Два уровня: направление → вид работ. Пусто = направление |
| module | `core`, `gutters`, `roofing`… | Какой модуль создал категорию |
| color | text | Цвет в календаре и отчётах |
| show_on_public_page | bool | Показывать на витрине и в онлайн-записи (PRD 12) |
| price_from_cents | int, нет | Цена «от» на витрине |
| position, is_active | int, bool | Порядок; архив вместо удаления |
| seed_key, is_user_modified | text, bool | Как у CatalogItem |

Категория ставится на Lead и наследуется в Estimate → Job (`service_category_id`), чтобы выручка, маржа и ROI считались по направлениям.

Собрано в волне T1 (`docs/specs/11-trade.md`, миграция `20261105250000`): таблица `service_categories`, пока только верхний уровень (`parent_id` пуст). Отличия от таблицы выше: `is_active` → `archived_at`; `is_user_modified` не нужен (переименование хранится в `name`, у заготовки `name` пуст); `color` не заводим (цвет только для статуса); `module`, `show_on_public_page`, `price_from_cents` — позже. `companies.trades[]` перенесён сюда.

### CatalogItem — позиция каталога
| Поле | Тип | Описание |
|---|---|---|
| kind | `service`, `material`, `labor`, `fee`, `discount` | |
| name, description | text | Как увидит клиент |
| sku | text | Внутренний артикул |
| unit | `LF`, `SF`, `SQ` (кровельный сквер), `ea`, `hr`, `day`, `flat` | |
| pricing_mode | `fixed`, `cost_plus` | |
| markup_bps | int | Для `cost_plus`: цена = round_half_up(cost × (1 + markup)) |
| unit_price_cents | int | Цена клиенту, **без налога** |
| unit_cost_cents | int | Себестоимость, **без налога** (скрыта от tech и sub) |
| unit_material_cost_cents | int | (v0.3) Часть себестоимости, купленная у поставщика (≤ `unit_cost_cents`) — база налога при покупке. По умолчанию: `material` — вся себестоимость, `labor`/`fee` — 0, `service` — задаётся (PRD 19 §7.6) |
| is_placeholder_price | bool | (v0.3) Тестовая цена стартового price book (бейдж «тестовая»); снимается при правке цены/себестоимости, импорте, скане или кнопке «Цена проверена» |
| taxable | bool | Значение по умолчанию для флажка `taxable` строки документа. **Сам по себе налог не включает** — налог считается, только если режим профиля документа его предусматривает и он включён на документе (§6). Для новых позиций ставится по `default_taxable_scope` профиля по умолчанию |
| category_id | → ServiceCategory | |
| supplier_item_id | → SupplierItem | Основной поставщик материала |
| module | `core`, `gutters`, `roofing`… | Какой модуль поставил позицию |
| attributes | json | Стандартные ключи: `profile`, `gauge`, `color`, `coil_width_in`, `ds_size` (`2x3`, `3x4`, `round_3`, `round_4`…), `noncombustible`, `hanger_type`; (v0.3) справочник колен: `component` (`elbow`…), `elbow_style` (`A`, `B`…), `angle_deg` (селекторы сборок, PRD 06). Новые варианты колен добавляются позициями каталога (импорт), без изменения формул |
| is_active | bool | Архив вместо удаления |
| seed_key, seed_version, is_user_modified | text, int, bool | Обновление price book модуля без потери правок пользователя |

### Assembly — сборка (правило расчёта)
Именованный набор формул: из входных параметров получаются позиции.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «Seamless gutter 6″ install» |
| module | text | gutters / roofing / core |
| inputs | json-schema | Какие параметры нужны: `gutter_lf_by_story`, `downspouts[]`, `miters_in`, `miters_out`, `end_caps`, `guards`, `tear_off` |
| constants | json | Имя, значение, мин/макс, единица (шаг hangers, waste %, высота этажа); переопределения компании |
| components | ← AssemblyComponent[] | |
| version | int | Версия формул |
| status | `draft`, `active`, `archived` | |
| test_cases | json | Входы → ожидаемые количества; прогоняются при каждой правке формулы |
| seed_key, seed_version, is_user_modified | | Как у CatalogItem |

### AssemblyComponent
`catalog_item_id` **или** `item_selector json` (выбор по атрибутам: `kind = gutter, profile = $profile, gauge = $gauge`; не нашёл → ошибка расчёта, без подстановки похожего), `quantity_formula` (безопасное выражение, например `ceil(gutter_lf / hanger_spacing_ft)`), `condition` (например `guards == true`), `client_visible` (видна клиенту или только во внутреннем BOM), `group` (раздел сметы), `position`. Формулы вычисляются **детерминированно** (decimal) одним движком на телефоне и на сервере, у движка есть `engine_version`. AI формулы не вычисляет и цены не придумывает.

### Supplier — поставщик
`name`, `contact`, `email_for_orders`, `phone`, `account_number`, `purchase_tax_rate_id` → TaxRate (v0.3: налог при покупке по умолчанию; новая запись — из `Company.tax_settings.default_purchase_tax_rate_id`, заглушка «LA area 10.25% — проверить»), `branches[]` (структура: `name`, `address`, `phone`, `email`, `purchase_tax_rate_id?` — своя ставка филиала, например Santa Monica), `delivery_notes`, `payment_terms` (`cod`, `prepaid`, `net_15`, `net_30`, `net_60`, `custom`; печатается в PO) (из анализа внешней CRM), `is_active`.

### SupplierItem — позиция в прайсе поставщика
`supplier_id`, `supplier_sku` (уникален в рамках поставщика), `name`, `unit` (текст поставщика: roll, box, lb, stick), `cost_cents` (**без налога**, v0.3), `pack_size` (сколько **единиц каталога** в одной единице поставщика: коробка 50 hangers → 50), `valid_from`, `valid_to` (текущая = `valid_to IS NULL`; смена цены = новая запись), `price_source` (v0.3: `manual`, `import_file`, `ai_scan`, `shelf_tag`, `rfq_quote`, `ai_command`), `import_job_id` → ImportJob (v0.3, вместо `source_import_id`).

### ImportJob — массовый импорт и обновление цен (v0.3, вместо PriceListImport)
Один конвейер для всех источников: файл, AI-скан прайса, ценник, команда помощника, ответ поставщика на RFQ (PRD 04 §7.6–7.7).
| Поле | Тип | Описание |
|---|---|---|
| target | `supplier_prices`, `catalog`, `customers`, `estimate_lines`, `estimates_archive` | Что импортируется |
| source_kind | `csv`, `xlsx`, `xml`, `json`, `photo`, `pdf`, `screenshot`, `shelf_tag`, `rfq_quote`, `ai_command` | Откуда |
| supplier_id | → Supplier, нет | Для `supplier_prices` |
| estimate_version_id | → EstimateVersion, нет | Для `estimate_lines` (только черновик) |
| file_id, file_sha256 | → File, text | Исходный файл; хэш — повторная загрузка того же файла |
| mapping_id | → ImportMapping, нет | Шаблон сопоставления |
| supplier_quote_id | → SupplierQuote, нет | Для `rfq_quote` |
| status | §9 | |
| counts | json | По классам: new / changed / unchanged / unmatched / error (для клиентов: new / update / duplicate / error) |
| detected_tax | json | Итоги документа (`subtotal`, `tax`, `rate_bps`) и сравнение со ставкой поставщика (PRD 19 §7.10) |
| summary | json | N обновлено, M новых, cost-plus с новой ценой, позиции ниже порога маржи, черновики с изменённой себестоимостью |
| ai_action_id | → AiAction, нет | Если распознавал AI или запустил помощник |
| applied_at, applied_by, undone_at, undone_by, undo_until | | Применение и отмена всего импорта (30 дней) |
| idempotency_key | text | Применение идемпотентно по `id` |
Лимиты: до 5,000 строк (`estimate_lines` — 500), 10 МБ для файлов данных, 25 МБ / 50 страниц для фото/PDF; один активный `applying` на компанию и цель.

### ImportRow — строка импорта (v0.3)
`job_id`, `row_no`, `raw json` (исходные ячейки / распознанный фрагмент: `page`, `bbox`), `parsed json` (по схеме цели; для прайса: `supplier_sku, name, unit_text, pack_size, cost_cents (без налога), price_includes_tax, confidence по полям`), `class` (`new` / `price_up` / `price_down` / `unchanged` / `unmatched` / `low_confidence` / `error`; для клиентов `update` / `duplicate`), `confidence`, `match_entity`, `match_id`, `selected bool`, `error`, `before json`, `after json` (что изменено при применении — для отмены).

### ImportMapping — шаблон сопоставления колонок (v0.3)
`company_id`, `supplier_id?` (шаблон поставщика; пусто — шаблон компании), `target`, `format`, `header_signature` (узнавание файла), `sheet` / `record_path` (лист XLSX / путь к повторяющемуся элементу XML/JSON), `columns json` (колонка → поле), `units json` (единица поставщика → `unit` + `pack_size`), `prices_include_tax bool`, `decimal_format`, `defaults json`, `sku_aliases json` (их SKU → наша позиция, копятся от ручных сопоставлений), `last_used_at`.

---

## 4. Замеры и сметы

### Drawing — чертёж на объекте (модуль Gutters, позже Roofing)
| Поле | Тип | Описание |
|---|---|---|
| property_id | → Property | Чертёж живёт на объекте и переиспользуется |
| base_image | → File | Спутниковый снимок или своё фото |
| image_source | `upload`, `esri`, `nearmap`, `eagleview_report`, `hover_report` | (v0.3.1, ADR-004, LEG-18) `satellite_google` и `satellite_mapbox` **удалены** — их условия запрещают обводку. MVP — `upload` (своё фото + калибровка); срез 3–4 — импорт отчётов EagleView/Hover по аккаунту подрядчика (`imagery_ref` {provider, report_id, capture_date, attribution}); `esri` — только после письменного подтверждения Esri; `nearmap` — позже |
| scale_ft_per_px | numeric | Из спутника автоматически или по калибровке «эта линия = 20 ft» |
| calibration | json: p1, p2, known_ft | Ручная калибровка |
| zoom, image_w_px, image_h_px | int | |
| imagery_date, provider_attribution | date, text | Атрибуция провайдера снимков |
| building_center | x, y | Эвристика inside/outside углов |
| geo_bounds | json | Привязка снимка к координатам |
| version | int | Чертёж версионируется вместе со сметой |

### DrawingRun — линия гаттера
`drawing_id`, `label`, `points[] (x,y)`, `closed bool`, `length_ft` (вычисленная, можно переопределить рулеткой: `length_override_ft`), `segment_overrides json` (override длины по сегментам), `story` (int ≥ 1; этажи вне таблицы высот — только со своей высотой downspout), `roof_side` (`left`/`right`), `profile` (K5, K6, HR5, HR6, box7), `material`, `gauge`, `color`, `hanger_type` (`hidden`/`strap_tile`/`spike`), `guards bool`, `tear_off bool`, `locked_attrs text[]` (атрибуты, которые пресеты G/B/B не меняют).

### DrawingPoint — точка на чертеже
`drawing_id`, `kind` (`downspout`, `end_cap_left`, `end_cap_right`, `outlet`, `miter_inside`, `miter_outside`, `fascia_repair`, `tile_hanger_zone`, `note`), `x, y`, `run_id`, `segment_index`, `angle_deg`, `is_auto bool`, `user_overridden bool`, `attributes` (для downspout: `size` 2×3/3×4/round, высота, `length_override_ft`, `elbows`, `extension`; v0.3: `height_mode` (`story` / `custom`), `custom_height_ft`, `elbows` = список `[{style, qty}]`, по умолчанию `[{A, 3}]`; длина = `length_override_ft ?? (custom_height_ft | высота этажа) + ds_extension_ft`, PRD 06 §7.4).
Углы вычисляются автоматически по поворотам линий, пользователь может их поправить.

### Estimate — смета (контейнер)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| number | text | да | EST-0148 |
| customer_id, property_id | → | да | Смета без объекта невозможна. На одном объекте может быть несколько открытых смет одновременно |
| lead_id | → Lead | нет | Для воронки и ROI |
| service_category_id | → ServiceCategory | нет | Направление (из лида или выбирается); переходит в Job (из анализа внешней CRM) |
| status | см. §9 | да | (v0.3.1) + `awaiting_countersign`, `cancelled_by_customer` |
| current_version_id | → EstimateVersion | да | |
| sent_version_id | → EstimateVersion | нет | Что видит клиент |
| expires_at | date | нет | |
| owner_user_id | → User | | Продавец (для комиссии) |
| viewed_count, last_viewed_at | вычисляемые | | «Открыл 3 раза» (открытия сотрудниками не считаются) |
| declined_reason | enum (`price`, `chose_competitor`, `postponed`, `other`) + текст | при `declined` | |
| created_via | `manual`, `template`, `drawing`, `copy`, `ai`, `map_nearby`, `portal`, `import` | | Атрибуция (например, деньги из режима карты «Рядом», PRD 08). `import` (v0.3) — архив смет из файла: одна заблокированная версия, только чтение, без портала, не входит в выручку |

### EstimateVersion — версия сметы
Отправленная версия **не редактируется**. Любое изменение создаёт новую версию.
| Поле | Тип | Описание |
|---|---|---|
| estimate_id | → Estimate | |
| version_no | int | 1, 2, 3 |
| drawing_id + drawing_version | → | Из какого чертежа посчитано |
| intro_text, scope_text, terms_text, exclusions_text | text | |
| deposit_rule | json | % или сумма, когда вносится; CA-лимит (для `ca_service_repair` всегда 0) |
| contract_type | `ca_home_improvement` / `ca_service_repair` / `non_hic` | (v0.3.1, LEG-01) Тип договора; определяет депозит, срок отказа, countersign, шаблон (PRD 05 §7.7.1) |
| contract_template_id, contract_template_version | → ContractTemplate, text (снимок) | (v0.3.1, LEG-02) |
| contract_rule_set_version | text (снимок) | (v0.3.1) Версия `ContractRuleSet` на дату версии |
| payment_schedule | json[]: `label`, `amount_cents`, `work_milestone` (`materials_delivered` / `install_complete` / `final_walkthrough` / `custom`) | (v0.3.1, LEG-06) График прогресс-платежей CA HIC; deposit + Σ = total |
| bond_attestation | json: тип, номер, файл, кто, когда | (v0.3.1) Снятие лимита депозита (B&P §7159.5(a)(8)) |
| disaster_emergency_repair, emergency_declaration_ref | bool, text | (v0.3.1, LEG-04) Ремонт после объявленной ЧС → 7 рабочих дней отказа + предупреждение о price gouging |
| negotiated_at_contractor_office | bool | (v0.3.1) Договор обсуждён и подписан в офисе подрядчика (attestation) |
| customer_initiated, service_request_scope | bool, text | (v0.3.1) Условия Service & Repair: клиент сам обратился; исходный запрос |
| start_date_approx, completion_date_approx, substantial_commencement_text | date, date, text | (v0.3.1) Обязательные поля CA-договора |
| tax_enabled | bool | Налог вкл/выкл на документе (по умолчанию из `Company.tax_settings.default_enabled`) |
| tax_rate_id, tax_rate_bps | → TaxRate, int (снимок) | Выбранная ставка; снимок ставки, чтобы изменение TaxRate не меняло отправленные сметы |
| tax_profile_id, tax_mode, include_purchase_tax_in_cost | → TaxProfile, enum (снимок), bool (снимок) | (v0.3) Налоговый профиль документа; по умолчанию профиль компании, меняется на черновике (PRD 19) |
| totals | json, вычисляемое | По каждому варианту: subtotal, discount, tax, total, cost, margin |
| locked_at, sent_at | timestamp | Блокировка при отправке (проверка в API и триггер БД) |
| content_hash | text | SHA-256 канонического JSON видимой клиенту части + PDF |
| pdf_file_id | → File | |
| engine_version | text | Версия движка расчёта |
| calc_inputs, calc_outputs | json | Входы сборок (v0.3: + `constants_override` сметы и итоговые значения констант — высоты этажей, отходы, колена); выходы: BOM, cut list, coil по цветам (вид для бригады) |
| source | `scratch`, `template`, `drawing`, `ai`, `copy`, `import` | Происхождение версии |
| template_id, copied_from_version_id | → EstimateTemplate, → EstimateVersion | |
| created_by_ai_action_id | → AiAction | нет | Если создана помощником |

### EstimateOption — вариант (Good / Better / Best)
`version_id`, `name`, `position`, `is_recommended` (не больше одного), `description`, `discount_mode` (`pct`/`fixed`/null), `discount_value` (bps или центы), `tax_enabled?`, `tax_rate_id?` (переопределение налога версии для этого варианта; пусто = как у версии), `financing_monthly_cents` (**позже, не MVP**: заполняется только из ответа лендера с его раскрытиями TILA/Reg Z; сами «от $X/мес» не считаем). Смета может иметь один вариант (без G/B/B), максимум 3 в MVP.

### EstimateLineItem — позиция сметы
| Поле | Тип | Описание |
|---|---|---|
| option_id | → EstimateOption | |
| position | int | Порядок (drag & drop) |
| group | text | Раздел: Removal, Gutters, Downspouts, Guards… |
| catalog_item_id | → CatalogItem | нет (можно свободную строку) |
| assembly_id | → Assembly | Если строка пришла из сборки |
| origin | `assembly`, `catalog`, `manual`, `ai` | |
| name, description | text | |
| quantity | numeric | |
| calc_quantity | numeric | Количество, посчитанное сборкой (видно при override) |
| is_override | bool | Количество/позиция изменены вручную или AI поверх сборки |
| is_assumption | bool | Значение предположено AI (подсветка до ручной проверки) |
| unit | enum | |
| unit_price_cents, unit_cost_cents | int | Цена копируется в момент добавления (снимок), чтобы изменение каталога не меняло старые сметы. Без налога; в режиме `tax_inclusive_display` `unit_price_cents` строки — цена **с налогом**, как видит клиент (PRD 19 §7.5) |
| unit_material_cost_cents, purchase_tax_bps | int, int (снимки) | (v0.3) Материальная часть себестоимости и ставка налога при покупке поставщика на дату версии |
| taxable | bool | Облагается ли строка, **если** налог включён на документе. По умолчанию из `CatalogItem.taxable` |
| is_optional | bool | Клиент может отметить сам (add-on) |
| client_visible | bool | Внутренние строки (BOM) не видны клиенту и всегда с ценой 0 |
| line_total_cents | int, вычисляемое | `round(quantity × unit_price)` |
| line_cost_cents | int, вычисляемое | `round(quantity × (unit_cost + [include_purchase_tax_in_cost] × unit_material_cost × purchase_tax_bps / 10000))` (v0.3, PRD 19 §7.6) |

### EstimateTemplate — шаблон сметы (новая)
`company_id` (null = системный шаблон модуля), `name` («Чистка гаттеров», «Guards only», «Gutters G/B/B»), `module`, `options[]` (`name`, `is_recommended`, `input_overrides json` — пресеты G/B/B для движка, `lines`), `intro/scope/terms/exclusions`, `deposit_rule`, `is_system`. Цены при создании сметы берутся из **текущего** каталога.

### EstimateApproval — решение клиента
`version_id`, `option_id` (выбранный вариант), `selected_optional_items[]`, `signer_name`, `signer_email`, `signature_file_id`, `signed_at`, `ip`, `user_agent`, `locale`, `channel (portal / in_person / ai_recorded / office_recorded)` (`office_recorded` — одобрение со слов клиента, без подписи: обязательна `office_note`, при сумме выше порога CA для home improvement — предупреждение «нужна подпись» (из анализа внешней CRM)), `signature_method (draw / type)` (из анализа внешней CRM), `document_hash` (= `content_hash` версии), `consent_text_version` (ESIGN/UETA), `rescission_ends_at` (CA: право отказа 3/5/7 рабочих дней; v0.3.1 — **от `executed_copy_delivered_at`**, а не от подписи клиента), `deposit_payment_id`, `offline bool` (подпись на устройстве без сети — приходит как заявка), `server_decision` (`accepted`/`rejected`), `rejection_reason`.
(v0.3.1, LEG-03…LEG-05) `esign_consent_id` → ESignConsent; `owner_65_plus` (`yes` / `no` / `unknown` — без ответа считается как 65+); `rescission_initials_file_id`; countersign: `countersigned_by` → Membership, `countersigned_at`, `countersign_method` (`manual` / `auto_company`), `countersign_signature_file_id`; исполненный договор: `executed_pdf_file_id`, `executed_copy_delivered_at`, `executed_copy_delivery` (`email` / `portal` / `paper` / `device`); срок отказа: `rescission_days` (3/5/7), `rescission_rule_version`; бумажная Notice of Cancellation: `paper_notice_delivered_at`, `paper_notice_photo_file_id`, `paper_notice_delivered_by`; отказ клиента: `cancellation_received_at`, `cancellation_method` (`portal` / `email` / `mail` / `fax` / `in_person`), `cancellation_file_id`. Хранение — 10 лет после завершения работы (LEG-21).

### ESignConsent — согласие потребителя на электронные документы (v0.3.1, LEG-05)
`company_id`, `contact_id`, `text_version`, `locale` (`en`/`es`), `scope` (договор + change orders + уведомления по нему), раскрытия E-SIGN §7001(c) (снимок текста: право на бумагу, отзыв, требования к устройству, обновление email), `consented_at`, `ip`, `user_agent`, `access_check` (`test_pdf_opened` + время), `declined_at` (выбрал бумагу), `withdrawn_at`, `withdrawal_method`. Хранение — как у договора (10 лет).

### ContractRuleSet — правила договоров по юрисдикции (v0.3.1, LEG-04; платформенные данные Octo, вне RLS компании)
`jurisdiction` (`US-CA`), `version` (`US-CA 2026.1`), `effective_from`, `effective_to`, `base_rescission_days` (3), `senior_rescission_days` (5), `emergency_rescission_days` (7), `unknown_senior_policy` (`senior`), `saturday_is_business_day` (true), `holidays` {год: [даты]} (9 праздников Civ. §1689.5), `refund_days` (10), `hic_min_cents` (50000), `service_repair_max_cents` (75000), `deposit_cap` {pct_bps 1000, max_cents 100000}, `source_note`, `approved_by_attorney_at`. Изменение = новая версия; на договоре — снимок версии. Нет праздников на год → CA-договоры не отправляются.

### ContractTemplate — шаблон договора (v0.3.1, LEG-02)
`company_id` (null = системный), `jurisdiction`, `contract_type`, `locale`, `version`, `blocks[]` (`key`, `locked bool`, `text`, `font` 10/12 pt, `bold`), `editable_fields[]`, `required_fields[]` (`field`, `severity` `block`/`warn`), `based_on` («CSLB Sample HIC 2025»), `attorney_reviewed_by`, `attorney_reviewed_at`, `is_active`. Статутные блоки системного шаблона компания не правит; свои условия — отдельные незаблокированные блоки.

### ChangeOrder — доп. работы во время выполнения
`job_id`, `number` (CO-0004), `reason`, `lines[]` (как LineItem, тот же движок), `tax_enabled`, `tax_rate_id`, `tax_rate_bps`, `tax_profile_id`, `tax_mode`, `include_purchase_tax_in_cost` (по умолчанию как в одобренной версии сметы), `status (draft → sent → approved / declined)`, `approval` (как EstimateApproval), `amount_cents` (может быть < 0), `cost_cents` (→ плановая себестоимость работы), `invoice_id` (в какой инвойс вошёл). После одобрения добавляется к финальному инвойсу работы.

---

## 5. Работы и расписание

### Job — работа (что делаем на объекте)
| Поле | Тип | Описание |
|---|---|---|
| number | text | JOB-0210 |
| customer_id, property_id | → | На одном объекте может быть несколько работ одновременно |
| estimate_id, approved_version_id, option_id | → | Из какой сметы (создаётся без повторного ввода). **Уникальный индекс `estimate_id`** — идемпотентная конверсия |
| status | см. §9 | |
| type | `install`, `repair`, `cleaning`, `inspection`, `warranty` | |
| service_category_id | → ServiceCategory | Из сметы; для отчётов по направлениям (из анализа внешней CRM) |
| recurring_plan_id, occurrence_date | → RecurringPlan, date | unique(`recurring_plan_id`, `occurrence_date`) — без дублей генерации |
| estimated_duration_min | int | Длительность по умолчанию для новых визитов |
| planned_cost_cents, actual_cost_cents | int, вычисляемые | Job costing (PRD 10) |
| committed_cost_cents | int, вычисляемое | Обязательства: PO `sent…received` без счёта + наряды субподрядчиков, ещё не одобренные к оплате |
| cost_breakdown | json, вычисляемое | План / факт по категориям: материалы, труд, субподряд, прочее, комиссии платежей |
| attributed_source_id | → LeadSource, денормализация | Для быстрых отчётов ROI (пересчитывается при смене источника лида) |
| completed_at, closed_at | timestamp | Метрики «до инвойса» |
| cancel_reason, cancelled_at | text, timestamp | Отмена работы клиентом (PRD 18); (v0.3.1) `cancel_reason = rescission` — отказ в срок отказа |
| requires_permit, permit_number | bool, text | (v0.3.1, LEG-15) Работа с permit → лицензия субподрядчика обязательна при любой сумме |
| checklist_template_id | → | |

### Visit — выезд (конкретное время в календаре)
Работа может требовать нескольких выездов (осмотр, монтаж, доделка).
`job_id` (или `lead_id` для осмотра), `kind` (`inspection`, `install`, `service`, `follow_up`), `starts_at`, `ends_at`, `schedule_mode` (`exact` / `flex_week`), `flex_week_start` (сгенерированные вхождения без точного времени), `assigned_users[]`, `crew_id`, `subcontractor_assignment_id?` (визит отдан субподрядчику), `status (scheduled → en_route → on_site → completed / cancelled / no_show)`, `arrival_window`, `sequence_in_route` (порядок в дне, PRD 07/08), `eta_at`, `notify_customer bool`, `customer_notified_at`, `created_via` (как у Estimate), `notes`.

### RecurringPlan — повторяющиеся работы
`customer_id`, `property_id`, `template_lines json` (снимок позиций), `price_cents`, `visit_duration_min`, `rrule` (RFC 5545: «раз в 6 месяцев, в октябре и апреле»), `starts_on`, `ends_on`, `generate_ahead_days` (по умолчанию 45, 7–120), `fixed_time` (nullable; пусто = flex-week), `checklist_template_id`, `assigned_crew_id`, `auto_invoice bool`, `billing (per_visit / prepaid / membership)` (MVP — `per_visit`), `status (active / paused / ended)`.

### Crew — бригада
`name`, `members[] → User`, `color`.

### ChecklistTemplate / ChecklistResponse
Шаблоны («Перед монтажом», «Сдача работы», «Чистка») с `items[]`: `label_en`, `label_es`, `kind` (`check`/`photo`/`text`/`number`), `required`. Ответы на объекте с фото; обязательные пункты блокируют «Завершить».

### Warranty — гарантия (новая)
`job_id`, `property_id`, `kind` (`workmanship` / `manufacturer`), `term_months`, `starts_on`, `ends_on`, `terms_text`, `file_id`. Показывается в ленте объекта и в портале («Мой дом»).

### Subcontractor — субподрядчик (обязателен в MVP)
**Решение основателя:** субподрядчики нужны обязательно.
| Поле | Тип | Описание |
|---|---|---|
| kind | `company` / `individual` | |
| name, contact_name, phone, email | text | |
| preferred_language | `en` / `es` | Язык наряда и сообщений |
| trades | text[] | gutters, roofing, electrical, painting… |
| license_number, license_expires_on | text, date | CSLB. Пусто или истекла → предупреждение при назначении; (v0.3.1) обязательна, если наряд ≥ `unlicensed_work_threshold_cents` ($1,000, AB 2622) или `Job.requires_permit` |
| license_class, license_status, license_checked_at, license_lookup_url | text[], `active`/`expired`/`suspended`/`unknown`, timestamp, text | (v0.3.1) Проверка по CSLB License Lookup |
| wc_status, wc_policy_file_id, wc_expires_on | `policy`/`exemption`/`unknown`, → File, date | (v0.3.1) Workers' comp; для C-39 — полис обязателен всегда |
| business_license_number, place_of_business | text, Address | (v0.3.1) Условия Labor Code §2781 (c), (d) |
| subcontract_agreement_file_id | → File | (v0.3.1) Письменный договор субподряда (§2781 (a)); шаблон — позже |
| ab5_checklist, ab5_status, ab5_checked_by/at | json (a–g: `met`, `evidence_file_id`, `note`), `all_met`/`incomplete`/`not_checked`, → User, timestamp | (v0.3.1, LEG-15) Чек-лист §2781 — не юридический вывод |
| sms_consent_record_id | → ConsentRecord | (v0.3.1) Согласие на служебные SMS по нарядам |
| insurance_coi_file_id, insurance_expires_on | → File, date | Сертификат страховки (COI). Предупреждение за `coi_warning_days` и при истечении |
| w9_file_id | → File | Для 1099 в конце года |
| tax_classification | `individual`, `sole_prop`, `llc`, `partnership`, `s_corp`, `c_corp` | Из W-9: корпорации обычно не получают 1099-NEC (уточнить у бухгалтера) |
| tin_encrypted | text, зашифровано | TIN/EIN из W-9; на экране только последние 4 |
| default_pay_type | `fixed_per_job`, `per_unit` (за LF), `hourly`, `percent_of_job` | |
| default_rate | int (центы или bp) | |
| user_id | → User, нет | Если у субподрядчика есть вход в Octo (роль `subcontractor`, видит только свои наряды, без цен клиента) |
| status | `active`, `inactive`, `blocked` | |
| compliance_status | вычисляемое: `ok`, `expiring`, `expired`, `missing` | По лицензии, COI, W-9 |

### SubcontractorAssignment — наряд субподрядчику на работу или визит
| Поле | Тип | Описание |
|---|---|---|
| job_id, visit_id? | → | Назначение на всю работу или на конкретный визит |
| subcontractor_id | → Subcontractor | |
| number | text | `WO-0012` (наряд) |
| scope_text | text | Объём работ для субподрядчика (без цен клиента) |
| pay_type | как `default_pay_type` | |
| pay_quantity | numeric | Например, LF для `per_unit` (по умолчанию из одобренной сметы) |
| agreed_amount_cents | int | Согласованная сумма (или вычисленная из ставки × количество / % от работы) |
| approved_amount_cents | int | Сумма, одобренная к оплате (может отличаться: доп. работы, вычеты) |
| status | см. §9 | |
| offered_at, accepted_at, declined_reason, completed_at | | |
| approved_by, approved_at | → User, timestamp | Только owner/admin/office |
| compliance_override_reason | text | Если назначили при истёкшем COI/лицензии (пишется в AuditLog) |
| work_order_file_id | → File | PDF наряда **без цен клиента**: адрес, окно, доступ, объём, чертёж, BOM/cut list (количества) |
| photos | ← File[] | Фото «готово» |

- Субподрядчику без входа в Octo наряд уходит по защищённой ссылке (`PortalAccess` с `audience = subcontractor`, §7): принять/отклонить, отметить «готово», загрузить фото.
- Сумма наряда попадает в **себестоимость работы** (job costing) как прямые затраты «Субподряд»: план и обязательства = `agreed_amount_cents`, факт = `approved_amount_cents` с момента `approved_for_payment`. Выплата (SubcontractorPayment) — движение денег, повторно в себестоимость не входит.
- Субподрядчику никогда не уходят цены клиента, баланс, маржа (фильтр на сервере и в шаблонах сообщений).

### SubcontractorPayment
`subcontractor_id`, `assignment_ids[]`, `amount_cents`, `method (check / ach / zelle / cash / other / card / payment_network)` (v0.3.1: `card`, `payment_network` — Stripe, PayPal и т.п.), `reference` (номер чека), `paid_at`, `note`, `recorded_by`, `w9_missing_override_reason` (v0.3.1). Итог за календарный год нужен для 1099-NEC: `counts_for_1099_nec` (вычисляемое) = false для `card` и `payment_network` (они в 1099-K у процессора); порог — `Company.subcontractor_settings.form_1099_thresholds[год]` ($2,000 за 2026, подтвердить у CPA).

### TimeEntry
`user_id`, `job_id`, `visit_id`, `started_at`, `ended_at`, `kind (travel / work)`, `source` (`status_auto` / `manual` / `ai`), `edited_by`. Для фактических трудозатрат своих сотрудников (у субподрядчиков время не учитываем — они работают за сумму наряда).

### LaborRate — стоимость часа сотрудника (новая)
`membership_id`, `cost_rate_cents_per_hour` (ставка «с нагрузкой»), `valid_from`. Видно только owner/admin. Изменение задним числом не пересчитывается без явного «пересчитать».

---

## 6. Деньги

### Invoice — счёт
| Поле | Тип | Описание |
|---|---|---|
| number | text | INV-0093 |
| customer_id, job_id | → | job_id пуст у `standalone` |
| kind | `deposit`, `progress`, `final`, `standalone`, `recurring` | На Job ≤ 1 не-void `deposit` и ≤ 1 не-void `final` |
| status | см. §9 (статус документа) | |
| payment_status | `unpaid`, `partially_paid`, `paid`, `refunded` (вычисляемый из платежей) | Отдельно от статуса документа; `overdue` — вычисляемый флаг |
| due_date | date | |
| lines | ← InvoiceLineItem[] | Как LineItem сметы |
| tax_enabled, tax_rate_id, tax_rate_bps | bool, → TaxRate, int (снимок) | Налог вручную на документе; для deposit/final — по умолчанию из одобренной версии сметы, для standalone/recurring — из профиля компании по умолчанию |
| tax_profile_id, tax_mode, include_purchase_tax_in_cost | → TaxProfile, enum, bool (снимки) | (v0.3) Режим налога документа (PRD 19) |
| totals | subtotal, tax, total, paid, balance; `net_ex_tax` (v0.3, для `tax_inclusive_display`) | |
| revision | int | Правка отправленного неоплаченного инвойса = новая ревизия (старый PDF сохраняется) |
| sent_at, viewed_at | timestamp | |
| reminders_paused, reminder_state | bool, json | Напоминания о просрочке |
| source_estimate_version_id | → EstimateVersion | |
| credits[] | → Invoice[] | Deposit/progress, зачтённые в финальном строками-кредитами |
| void_reason, voided_by, voided_at | text, → User, timestamp | Void только при `paid_net = 0` (иначе сначала refund или перенос в кредит клиента) |
| customer_payment_claim | json, нет | «Я оплатил» от клиента в портале (из анализа внешней CRM): `method` (zelle/check/cash/bank_transfer/other), `amount_cents`, `claimed_at`, `note`, `status (open / recorded / rejected)`. **Не платёж**: создаёт Task офису «проверить и записать», ставит напоминания о просрочке на паузу до решения; запись Payment закрывает заявление |

### InvoiceLineItem
Как EstimateLineItem (снимок цены, `taxable`), плюс `source_type/source_id` (`estimate_line` / `change_order` / `expense` / `recurring_plan` / `credit`) — трассировка и защита от двойного выставления. BOM-строки в инвойс не попадают. (v0.3.1) `kind` + `returned_check_fee` (≤ $25 / $35, только после `Payment.returned` с `method=check`). У Invoice (v0.3.1): `payment_schedule_item_id` (progress по этапу), `work_performed_attestation` (кто, когда — если этап не отмечен выполненным); для `contract_type = ca_service_repair` deposit/progress запрещены.

### Payment — платёж
| Поле | Тип | Описание |
|---|---|---|
| invoice_id | → Invoice | В MVP депозит всегда через deposit-инвойс (пусто только во время оформления) |
| customer_id | → | |
| method | `card`, `ach`, `tap_to_pay`, `cash`, `check`, `zelle`, `financing` (позже), `other` | |
| amount_cents | int | |
| fee_cents | int | Комиссия процессора (из balance transaction Stripe) |
| platform_fee_cents | int | Наша прозрачная наценка (`application_fee_amount`) |
| status | см. §9 | |
| stripe_payment_intent_id, stripe_charge_id, payout_id | text | Сверка с выплатами |
| idempotency_key | text, unique | Защита от двойного списания |
| received_by, received_at | → User, timestamp | Для наличных и чеков |
| reference | text | Номер чека, Zelle confirmation |
| proof_file_id | → File | Фото чека/конверта |
| needs_review | bool | Переплата после офлайн-синхронизации |
| dispute_status | `none`, `open`, `won`, `lost` | Chargeback |
| offline_created | bool | Записан без сети (PRD 09, 16) |
| return_reason | text | Причина ACH return / возврата чека банком (PRD 18) |
| receipt_number, receipt_file_id, receipt_sent_at | text, → File, timestamp | Квитанция об оплате: номер `RCT-0001` присваивает сервер при `succeeded`, PDF — неизменяемый снимок; email-квитанция клиенту (PRD 09) (из анализа внешней CRM) |

### PaymentAttempt — попытка оплаты (новая)
`invoice_id`, `idempotency_key` (`hash(invoice_id, amount, attempt_no)`), `amount_cents`, `stripe_payment_intent_id`, `expires_at`. Создаётся при открытии экрана оплаты, до появления Payment; повтор возвращает тот же PaymentIntent.

### Refund
`payment_id`, `amount_cents`, `reason`, `reason_kind` (v0.3.1: `rescission` / `cancellation` / `goodwill` / `other`), `due_by` (v0.3.1, LEG-09: при отказе = `cancellation_received_at` + `ContractRuleSet.refund_days`), `status`, `approved_by` (только owner/admin), `refund_application_fee bool`, `platform_fee_refunded_cents`, `allocation` (налог / без налога; v0.3: `method` `proportional` / `by_line` / `manual`, `tax_cents`, `net_cents`; по умолчанию — по режиму документа: пропорционально для `added_on_top` и `tax_inclusive_display`, налоговая часть 0 для `included_in_price` и `exempt`; PRD 18 §K, PRD 19 §7.9).

### CustomerCredit / CreditApplication — кредит клиента (PRD 18)
`CustomerCredit`: `customer_id`, `amount_cents` (> 0; долг всегда живёт в инвойсе), `source` (`overpayment` / `void_transfer` / `refund_alternative`), `source_payment_id`, `status (open / applied / refunded)`.
`CreditApplication`: `credit_id`, `invoice_id`, `amount_cents`, `applied_at`. Зачёт уменьшает `balance` инвойса (`credits_applied`).

### Expense — расход
| Поле | Тип | Описание |
|---|---|---|
| date | date | |
| vendor | text | Home Depot, ABC Supply |
| document_number | text | Номер чека/счёта поставщика: поиск дублей и сверка с PO (из анализа внешней CRM) |
| supplier_id | → Supplier, нет | Если это счёт известного поставщика |
| amount_cents, tax_cents | int | `amount` включает налог чека; может быть < 0 (возврат в магазин). `tax_cents` хранится всегда отдельно: при `include_purchase_tax_in_cost = false` факт материалов = `amount − tax_cents` (PRD 10, 19) |
| category | `materials`, `fuel`, `tools`, `dump_fee`, `subcontractor`, `marketing`, `other` | `subcontractor` — только для разового исполнителя **без** наряда (иначе затраты берутся из SubcontractorAssignment, без двойного счёта) |
| job_id, customer_id | → | нет | «Это на Петра Ивановича» |
| purchase_order_id | → PurchaseOrder | нет | Счёт поставщика по PO: PO уходит из обязательств в факт (PRD 10, 11) |
| lead_source_id | → LeadSource | при `marketing` | Сохранение создаёт связанный MarketingSpend |
| receipt_file_id | → File | |
| image_hash | text | Поиск дублей чеков |
| ocr_status, ocr_confidence | `none/pending/done/failed`, json | Офлайн — распознаётся при появлении сети |
| ocr_data, line_items | json | Что распознал AI (магазин, сумма, позиции) |
| ai_action_id | → AiAction | Аудит распознавания |
| billable | bool + markup_pct | Перевыставить клиенту с наценкой |
| billed_invoice_line_id | → InvoiceLineItem | Уже выставлен — не добавляется второй раз |
| paid_by | `company_card`, `cash`, `employee_reimburse` | |
| reimbursed_at, reimbursed_by | timestamp, → User | Возмещение сотруднику |
| idempotency_key, created_offline | text, bool | |
| transferred_from_job_id | → Job | Перенос расхода с другой работы (PRD 18) |

### TaxProfile — налоговый профиль (v0.3, PRD 19)
**Решение основателя:** налог **не считается автоматически** и не определяется по адресу. Профиль — набор настроек, который пользователь выбирает для компании (один по умолчанию) и при необходимости меняет на документе.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «California contractor (lump sum)», «Retail materials sale» |
| mode | `included_in_price`, `added_on_top`, `tax_inclusive_display`, `exempt` | Как налог клиенту появляется на документе (PRD 19 §7.2) |
| default_sales_rate_id | → TaxRate | Ставка продаж по умолчанию (для `added_on_top`, `tax_inclusive_display`) |
| default_enabled | bool | Включать налог на новых документах; по умолчанию **false**, меняет только пользователь |
| default_taxable_scope | `all` / `materials_only` / `none` | Флажок `taxable` новых позиций каталога |
| deposit_tax_mode | `in_final` (по умолчанию) / `proportional` | Налог в депозите (PRD 19 §7.8) |
| include_purchase_tax_in_cost | bool | «Учитывать налог при покупке в себестоимости», по умолчанию **true** |
| is_default, is_active | bool | Ровно один `is_default` на компанию (частичный уникальный индекс); архив вместо удаления |
| preset_key | text, нет | `ca_contractor_lump_sum`, `retail_materials`, `texas`, `mexico_iva_incl`, `no_tax` |

### TaxRate — ставка налога (настраивается вручную; расширена в v0.3)
| Поле | Тип | Описание |
|---|---|---|
| name | text | «LA County 9.75%», «LA area 10.25% (purchase)», «IVA 16%» |
| rate_bps | int | Ставка в базисных пунктах (950 = 9.50%). В v0.2 называлось `rate_bp` |
| kind | `sales` / `purchase` / `both` | Для налога клиенту, для налога при покупке или для обоих |
| country, state, county, city, district_note | text | Регион — справочно; ставку по адресу Octo не подбирает |
| effective_from, effective_to | date | Даты действия; изменение ставки = новая запись |
| is_placeholder | bool | Тестовая ставка «проверить» (все ставки пресетов) |
| source_note | text | Откуда ставка (ссылка, «от CPA») |
| is_default, active | bool | `is_default` v0.2 заменён на `TaxProfile.default_sales_rate_id`; `active` — архив |

Как применяется (PRD 19 §7):
- на уровне **документа** (версия сметы и при необходимости вариант, инвойс, change order): профиль `tax_profile_id` (снимок `tax_mode`), переключатель «Налог вкл/выкл» (`tax_enabled`, только для режимов с налогом клиенту) и выбор ставки `tax_rate_id`; ставка копируется снимком `tax_rate_bps`;
- на уровне **позиции**: флажок `taxable` (например, облагать только материалы, не работу); хранится всегда, даже когда режим его не использует;
- налог: `added_on_top` — `round((Σ taxable − доля скидки) × rate)`; `tax_inclusive_display` — `round((Σ taxable − доля скидки) × rate / (1 + rate))` из цены с налогом; `included_in_price`, `exempt` — 0; считается **только если налог включён на документе**; округление — один раз на вариант;
- **налог при покупке**: ставка филиала / поставщика (`Supplier.purchase_tax_rate_id`) → `Company.tax_settings.default_purchase_tax_rate_id`; входит в `line_cost` по `unit_material_cost_cents`, если `include_purchase_tax_in_cost`;
- в инвойсе налог можно изменить, пока он `draft`; после отправки — только новой ревизией (пока нет оплат) или void;
- смена профиля компании не меняет отправленные документы; черновики — по кнопке с diff;
- что именно облагается для монтажа в CA, решает пользователь со своим CPA (исследование — `docs/legal/`); Octo не даёт налоговых советов. (v0.3.1, LEG-16) Рекомендованный пресет CA — `included_in_price`; включение налога клиенту на CA lump-sum документе — с предупреждением об excess tax reimbursement; ставки LA с 01.10.2026 (County & City of LA 10.25%, Santa Monica 11.25%) — датированные заглушки (`effective_from`, `is_placeholder`, `source_note = "CDTFA L-1037"`).

### PurchaseOrder — заказ поставщику
`number (PO-0031)`, `supplier_id`, `job_id` (nullable: заказ на склад), `lines` (← PurchaseOrderLine[]), `status` (§9), `revision int`, `sent_via (email / pdf)`, `sent_at`, `sent_to_email`, `pdf_file_id`, `confirmed_at`, `delivery_date`, `fulfillment` (`delivery` / `pickup`), `branch`, `delivery_address`, `driver_notes`, `source_version_id` (→ EstimateVersion), `source_change_order_id`, `total_cost_cents` (без налога), `tax_cents` и `delivery_fee_cents` (налог и доставка поставщика — часть себестоимости работы; v0.3: `tax_cents` по умолчанию = `round(total × purchase_tax_bps)` филиала/поставщика, правится по счёту; в обязательства — если `include_purchase_tax_in_cost`) (из анализа внешней CRM), `supplier_reference` (номер заказа у поставщика, спрашивают при самовывозе) (из анализа внешней CRM), `idempotency_key`, `option_id` (→ EstimateOption), `origin` (`draft_estimate` / `approved_estimate` / `manual`), `is_outdated bool`, `sent_before_approval bool`, `rfq_token`. Автоматически генерируется из BOM одобренной сметы (уникальность автосозданных: `job_id + supplier_id + source_version_id`); **вручную может создаваться из черновика сметы** (решение основателя 03.11, PRD 11 PO-US-20…25). До одобрения сметы не входит в committed cost.

### SupplierQuote — ответ поставщика на запрос цены (RFQ), MVP
`purchase_order_id`, `supplier_id`, `received_at`, `channel (email / upload)`, `raw_file_ids[]`, `status (received → parsed → needs_review → applied / rejected)`, `valid_until`, `delivery_fee_cents`, `total_cents`, `confidence`. Разбирается AI, числа проверяются детерминированно, применяется только по кнопке (PRD 11 PO-US-26…30).

### SupplierQuoteLine
`quote_id`, `po_line_id?`, `supplier_sku`, `name`, `unit`, `unit_cost_cents`, `qty_available`, `availability (in_stock / backorder / unavailable)`, `available_on`, `is_substitute`, `substitute_for_line_id`, `match_confidence`.

`Supplier.verified_emails[]`: адреса, с которых принимаются ответы поставщика.

### PurchaseOrderLine — строка заказа (новая, вместо `lines[]` json)
`po_id`, `supplier_item_id`, `catalog_item_id`, `description`, `attributes` (цвет, gauge, ширина), `bom_qty` (из BOM в единицах каталога), `qty` (в единицах поставщика = `ceil(bom_qty / pack_size)`), `unit`, `unit_cost_cents`, `line_cost_cents`, `received_qty`, `position`.

---

## 7. Клиентский портал и публичная страница

### PublicProfile — витрина компании (SEO-страница)
`company_id`, `headline`, `about`, `services[]` (из ServiceCategory, `price_from_cents` nullable), `service_areas[]` (города и ZIP LA), `gallery[] → File`, `testimonials[]` (текст, имя/инициалы, дата, `consent bool`), `google_review_url` (или GBP place id — используется и для ReviewRequest), `reviews_display`, `license_badge`, `hide_street_address bool` (service-area business), `cta_settings`, `translations json` (статус утверждения EN/ES), `seo (title, description, schema.org LocalBusiness)`.

### PortalAccess — защищённая ссылка (клиент или субподрядчик)
`audience` (`customer` / `subcontractor`), `customer_id` или `subcontractor_id`, `contact_id`, `token_hash` (сам токен в базе не хранится, ≥ 128 бит), `scope` (`document` — один документ, `customer` — все документы клиента и «Мои объекты», `work_order` — один наряд субподрядчика), `document_type/document_id`, `expires_at`, `last_opened_at`, `open_count`, `locale`, `revoked_at`. Ссылка клиента открывает смету, инвойс, оплату, историю объектов и запись; ссылка субподрядчика — только наряд (без цен клиента): принять/отклонить, «готово», фото.

### AvailabilityRule / BookingRequest — онлайн-запись
`AvailabilityRule`: дни недели, часы, длительность осмотра, буфер, `service_zip_zones[]`, `user_ids[]` (какие сотрудники), `min_notice_hours` (12), `max_days_ahead`, `hold_minutes` (10), `auto_confirm` (вкл.).
`BookingRequest`: `kind` (`inspection` / `service_request`), `service`, `slot`, `preferred_week`, `contact`, `address`, `customer_id` (nullable), `property_id` (nullable — «Записаться снова» на конкретный объект), `lead_id`, `visit_id`, `referral_code`, `locale`, `hold_expires_at`, `status (requested → confirmed / declined)`. Создаёт Lead с источником «Портал» или «Сайт».

### ReviewRequest и Referral
`ReviewRequest`: `job_id`, `invoice_id`, `channel`, `sent_at`, `reminder_sent_at`, `clicked_at`, `platform` (MVP только `google`; Yelp не запрашиваем). Запрос уходит **всем** клиентам, без фильтра недовольных (правила FTC и Google); (v0.3.1, LEG-12) без реферального предложения и промо в том же сообщении, не уходит контактам с `is_team_member`. Реферальное предложение — отдельная автоматизация `referral_offer` (маркетинг, `sms_marketing_opt_in`).
`Referral` — одна запись на каждого приведённого: `referrer_customer_id`, `code` (= `Customer.referral_code` реферера), `new_lead_id`, `status` (§9), `reward` (cents / gift), `reward_due_cents`, `reward_paid_at`, `reward_method` (скидка на следующую работу / gift card / наличные). Ссылка и клики живут на клиенте (`Customer.referral_code`, `referral_link_clicks`).

---

## 8. Коммуникации, AI, платформа

### MessageThread / Message
Переписка с клиентом (и субподрядчиком по наряду): `channel (sms / email / portal)`, `direction`, `body`, `status (queued → sent → delivered / failed)`, `provider_id`, `segments`, `cost_cents`, `template_key`, `automation_key`, `idempotency_key`, `sent_via` (`octo` / `own_phone` — «с моего телефона», не подтверждено). Без сети сообщение ставится в очередь (outbox) с TTL. (v0.3.1, LEG-11) `category` (`transactional` / `marketing` / `conversational`), `recipient_timezone`, `tz_source` (`property` / `customer_address` / `area_code` / `fallback`) — quiet hours по времени получателя (8–21 информационные, 9–20 маркетинг).

### ConsentRecord — журнал SMS/email-согласий (v0.3.1, LEG-10; PRD 13 COMM-US-04)
Только добавление (append-only); флаги `Contact.sms_opt_in` / `sms_marketing_opt_in` вычисляются из последней записи по категории.
| Поле | Тип | Описание |
|---|---|---|
| company_id, contact_id | → | Согласие — на компанию-отправителя (10DLC brand подрядчика) |
| subcontractor_id | → Subcontractor, нет | Для служебных SMS по нарядам |
| phone_e164 / email | text | Номер или адрес, на который дано согласие |
| channel | `sms` / `email` | |
| category | `transactional` / `marketing` | Отзыв маркетинга прекращает весь маркетинг; отзыв ключевым словом — все категории |
| action | `grant` / `revoke` | |
| consent_text_id, text_version, locale | → ConsentText, text, `en`/`es` | **Точный текст**, который видел клиент |
| source | `web_form` / `portal` / `estimate_sign` / `verbal_recorded_by_user` / `customer_texted_first` / `paper_form_photo` / `attestation` | `import` не бывает |
| form_url, form_screenshot_file_id | text, → File | Версия формы (для 10DLC vetting) |
| ip, user_agent | text | |
| recorded_by | → User, нет | Для устного согласия и attestation (+ AuditLog) |
| confirmation_message_sid | text | Подтверждающее SMS (текст C/D) |
| revocation_method, revocation_raw_text | `keyword` / `free_text` / `phone` / `email` / `portal` / `unsubscribe_link`, text | Для `revoke` |
| revocation_received_at, revocation_honored_at | timestamp | Исполнение: сразу (закон — ≤ 10 рабочих дней) |
| created_at | timestamp (UTC) | |
Хранение — 5 лет после последнего сообщения или отзыва (TCPA, 4 года + запас).

### ConsentText — версии текстов согласий и служебных ответов (v0.3.1, LEG-10)
`company_id` (null = системный), `key` (`sms_transactional_checkbox`, `sms_marketing_checkbox`, `optin_confirm`, `marketing_confirm`, `help`, `stop`, `verbal_script`), `locale`, `version`, `body`, `required_elements[]` (проверка при правке), `attorney_approved_by`, `attorney_approved_at`, `is_active`. Системные тексты — `legal/legal-research.md` §3.6 (черновики для адвоката).

### MessageTemplate (новая)
`company_id` (null = системный), `key` (`estimate.followup.1`, `work_order.offer`…), `audience` (`customer` / `subcontractor`), `channel (sms/email)`, `locale (en/es)`, `subject`, `body`, `is_system`, `updated_by`. В шаблонах для субподрядчика переменные с ценами клиента (`{total}`, `{balance}`, `{invoice_link}`) запрещены.

### AutomationSetting (новая)
`company_id`, `automation_key` (`lead_instant_reply`, `estimate_followup`, `visit_reminders`, `invoice_reminders`, `review_referral` (v0.3.1: только запрос отзыва), `referral_offer` (v0.3.1: отдельное маркетинговое сообщение, выкл. по умолчанию), `subcontractor_work_order`), `enabled`, `params json` (тайминги, каналы, N минут; `review_request_sms`).

### ScheduledMessage (новая)
`company_id`, `automation_key`, `subject_type/id`, `step`, `scheduled_at`, `status` (§9), `cancel_reason`, `message_id`; unique(`automation_key`, `subject_id`, `step`) — один шаг не уходит дважды.

### Notification — уведомление сотруднику (из анализа внешней CRM)
`company_id`, `user_id`, `kind` (`lead.new`, `lead.unanswered`, `estimate.hot`, `message.inbound`, `work_order.accepted`, `coi.expiring`…), `title`, `body`, `subject_type/id`, `route` (deep link), `dedup_key` (unique в окне: «горячая смета» не чаще 1 раза в 24 ч, PRD 13 COMM-US-08), `push_status` (`pending` / `sent` / `suppressed_quiet_hours` / `failed`), `pushed_at`, `read_at`, `archived_at`. Лента «Уведомления» в приложении и источник push; отметка `dedup_key` ставится **до** отправки, повтор cron дубль не шлёт.

### NotificationPreference (из анализа внешней CRM)
`membership_id` (unique), `channels json` (по `kind`: push / email / in_app вкл/выкл), `quiet_hours` (начало, конец; по умолчанию из `Company.business_hours`), `critical_bypass bool` (новый лид пробивает quiet hours, по умолчанию вкл). Субподрядчику — только уведомления по своим нарядам.

### Campaign (новая, Запуск)
`company_id`, `name`, `segment json`, `channels`, `template_keys`, `status (draft → sending → sent)`, `recipients_count`, `sent_at`.

### AiAction — действие помощника (сердце безопасного AI)
| Поле | Тип | Описание |
|---|---|---|
| user_id | → User | Кто дал команду |
| input | text / audio / image ref | «Удали позицию 4…» |
| channel, locale, transcript | `text`/`voice`/`photo`, en/es/ru, text | |
| context | json | Экран, entity_type/id, company_id |
| intent | text | `estimate.update_lines`, `expense.create_from_receipt`… |
| tier | `T0` / `T1` / `T2` | Чтение / черновики / деньги-отправка-удаление |
| plan | json | Операции из whitelist intent'а |
| resolved_entities, assumptions | json | Найденные сущности; вход → источник («сказано», «объект», «по 7 похожим») |
| proposed_changes | json (diff) | Что изменится: было → стало |
| status | `proposed → confirmed → applied` / `cancelled` / `failed` / `undone` | |
| requires_confirmation | bool | Деньги, отправка клиенту и удаление всегда требуют подтверждения кнопкой |
| entity_row_versions | json | Проверка при apply и undo |
| parent_action_id | → AiAction | Уточнения внутри одного действия |
| idempotency_key | text | |
| undo_payload, undone_at, undo_available_until | json, timestamp | Как откатить; не дольше 7 дней и пока сущность не менялась |
| error_code | text | |
| counted | bool | Списано ли с лимита |
| pending_offline | bool | Команда сохранена офлайн, ждёт повторного подтверждения |
| tokens_in, tokens_out, cost_cents, model | | Учёт расходов и лимитов |

Помощник вызывает те же операции API с правами пользователя. Тексты из документов и сообщений клиентов для него только данные, а не команды. Навигация по словарю на устройстве AiAction не создаёт.

### Entitlement / UsageCounter — тарифы и лимиты
`Entitlement`: `company_id`, `plan (starter / pro)`, `modules[] (gutters, roofing)`, `seats`, `limits` (`ai_actions`, `ai_daily_cap` = 200, `sms_segments`), `status` (§9), `trial_ends_at`, `paused_until`, `pause_count_year`, `packs[]` (тип, объём, период), `is_group_discount bool` (2-я компания $30), `billing_source (stripe / app_store / manual_beta)`, `stripe_customer_id`, `stripe_subscription_id`. Логины субподрядчиков (`subcontractor`) — см. `00-decisions-for-founder.md` (рекомендация: не занимают платное место).
`UsageCounter`: `company_id`, `period`, `ai_actions_used`, `ai_actions_today` + `ai_day` (суточный потолок), `sms_segments_used`, `sms_segments_inbound` (себестоимость), `emails_sent`, `ai_cost_cents`.

### DataExport (новая)
`company_id`, `requested_by`, `scope` (сущности), `format` (v0.3: `csv` / `xlsx` / `pdf_zip` / `zip`), `filter json` (v0.3), `status (queued → building → ready / failed / expired)`, `file_id`, `expires_at` (7 дней; после отмены подписки экспорт доступен 90 дней). До 5,000 строк / 500 PDF — сразу, больше — фоновой задачей (PRD 04 §7.7.6).

### File
`storage_key`, `mime`, `size`, `kind (photo / receipt / signature / drawing / document)`, `subject_type/id`, `job_id`, `visit_id`, `stage` (`before` / `during` / `after` / `other`), `client_visible bool` (по умолчанию true для before/after), `public_gallery bool` (публикация в витрине разрешена владельцем), `taken_at`, `geo`, `uploaded_offline bool`, `upload_status` (`local` / `uploading` / `uploaded` / `failed`).

### AuditLog
`actor_type (user / ai / system / customer / subcontractor / support)`, `actor_id`, `on_behalf_of_user_id` (для AI), `entity_type`, `entity_id`, `action`, `before json`, `after json`, `ip`, `at`.

### StatusEvent
`entity_type`, `entity_id`, `from_status`, `to_status`, `actor`, `reason`, `at` (= время действия на устройстве для офлайн), `synced_at`.

### ExternalRef / Integration / WebhookEvent
Связь с внешними системами: `provider (thumbtack, angi, google_lsa, stripe, twilio, quickbooks)`, `external_id`, `entity`. Ключи интеграций хранятся в менеджере секретов, а не в базе в открытом виде.
`WebhookEvent` (новая): `provider`, `event_id` (unique), `type`, `received_at`, `processed_at`, `status` — каждое событие Stripe/Twilio обрабатывается ровно один раз.

### UserLocation — последняя известная позиция (новая)
`user_id`, `company_id`, `lat`, `lng`, `accuracy_m`, `visit_id`, `recorded_at`, `source` (`status_change` / `foreground`). Только при `Membership.share_location = true` и во время выезда, при открытом приложении (фон — 7б-3); хранение 30 дней (TTL); видят owner/admin (30 дней) и office (открытый выезд, только назначенные) (7б-2, миграция 210000). У субподрядчиков не собирается.

### Device, SyncOperation, SyncConflict — офлайн-синхронизация (новые)
`Device`: `user_id`, `platform`, `app_version`, `push_token`, `last_sync_at`, `revoked_at` (удалённое стирание).
`SyncOperation` (серверный журнал outbox): `op_id` (unique), `device_id`, `user_id`, `company_id`, `entity`, `entity_id`, `idempotency_key`, `base_row_version`, `result` (`applied` / `merged` / `conflict` / `rejected`), `error`, `received_at`.
`SyncConflict`: `entity`, `entity_id`, `device_version json`, `server_version json`, `status` (`open` / `resolved`), `resolved_by`, `resolution`.

## 8a. Платформа Octo (вне RLS компании)
Сущности поддержки и сотрудников Octo; доступ — только сотрудникам Octo (с обязательной 2FA) и автору обращения.
- `PlatformRole`: `user_id`, `role` (`support_agent`, `platform_admin`) — отдельно от `Membership`.
- `KbArticle`: `slug`, `locale (en/es/ru)`, `title`, `body_md`, `deep_link`, `tags[]`, `app_min_version`, `status (draft/published/archived)`, `reviewed_at`, `embedding`.
- `SupportTicket`: `number`, `user_id`, `company_id` (nullable), `channel (in_app/email)`, `kind (question/bug/billing/feature_request)`, `priority (urgent/high/normal/low)`, `status` (§9), `locale`, `subject`, `assigned_agent_id`, `first_response_at`, `resolved_at`, `device_info json`, `ai_conversation json`.
- `SupportMessage`: `ticket_id`, `direction`, `author (user/agent/ai_draft)`, `body`, `attachments[] → File`, `draft_used (as_is/edited/rejected)`, `sent_at`.
- `SupportAccessGrant`: `company_id`, `granted_by`, `scope (read_only)`, `expires_at` (24/72 ч), `revoked_at`. Каждое открытие данных — `AuditLog(actor_type=support)`.

---

## 9. Статусы и переходы (state machines)

### Lead
```
new → contacted → qualified → inspection_scheduled → estimate_sent → won
  ↘ lost (из любого, с причиной)        ↘ archived
```
- `won` ставится автоматически, когда смета по лиду одобрена (вручную не ставится).
- `first_response_at` фиксируется на первом исходящем контакте или «Я ответил».
- `lost → contacted` разрешён («клиент вернулся»), `lost_reason` очищается.

### Estimate
```
draft → sent → viewed → [awaiting_countersign] → approved → [cancelled_by_customer]
          ↘ declined   ↘ expired
draft/sent/viewed → revised (новая версия, снова draft)
```
- (v0.3.1, LEG-03) `awaiting_countersign` — клиент подписал, ждём подпись подрядчика (при автоподписи проходится мгновенно); `approved` = договор исполнен обеими сторонами; Job и депозитный инвойс создаются только после `approved`.
- (v0.3.1, LEG-04) `approved → cancelled_by_customer` — только до `EstimateApproval.rescission_ends_at` (CA HIC) или до начала работы (S&R); Job → `cancelled` (`cancel_reason = rescission`), возврат ≤ 10 дней (`Refund.due_by`).
- `revised` — событие, а не конечное состояние.
- `approved` → **идемпотентно** создаётся Job (+ депозитный инвойс, если есть правило депозита), PO-черновики из BOM, задача «запланировать».
- После `approved` смета не редактируется. Изменения оформляются через ChangeOrder.
- `expired` → продление срока возвращает `sent`/`viewed` без новой версии.
- Офлайн-подпись (`EstimateApproval.offline`) — заявка: сервер принимает (`accepted`) или отклоняет (`rejected`, Task владельцу).

### Job
```
draft → scheduled → in_progress → completed → closed
            ↘ on_hold ↗        ↘ cancelled
```
- `completed` → предложить финальный инвойс, запрос отзыва после оплаты. Только явным действием.
- `closed` = финальный инвойс оплачен и обязательные пункты чек-листа закрыты.

### Visit
`scheduled → en_route → on_site → completed` / `cancelled` / `no_show`
- `en_route` → клиенту SMS «мы в пути» (если включено). Пропуск `en_route` допустим.

### SubcontractorAssignment
```
offered → accepted → in_progress → completed → approved_for_payment → paid
   ↘ declined                                      (paid — когда выплаты покрыли approved_amount)
offered/accepted/in_progress → cancelled (owner/admin/office, с причиной)
```
- `completed` ставит субподрядчик (в приложении или по ссылке) или офис; `approved_for_payment` — только owner/admin/office: с этого момента сумма — факт себестоимости работы.

### Invoice (статус документа)
`draft → sent → void`. Правка `sent` без оплат = новая ревизия (`revision + 1`). Оплата ведётся отдельно в `payment_status`: `unpaid → partially_paid → paid`, а также `overdue` (вычисляемый по `due_date`) и `refunded`.

### Payment
`pending → succeeded` / `failed`; `succeeded → partially_refunded → refunded`; `succeeded → returned` (ACH return после зачисления); ручные платежи: `succeeded → voided` (ошибка ввода, только owner/admin, с причиной).

### PurchaseOrder
```
draft → rfq_sent → draft (ответ получен) → sent → confirmed → partially_received → received
draft → sent → confirmed → partially_received → received
  ↘ cancelled (из draft / sent / confirmed / partially_received)
```
- Ревизия (`revision + 1`) не меняет статус; `confirmed` после ревизии возвращается в `sent`. `received` отменить нельзя.

### ImportJob (v0.3, вместо PriceListImport)
`uploaded → parsing → mapping → review → applying → applied → undone` / `failed` / `cancelled`.
- Файлы данных (CSV/XLSX/XML/JSON) — без AI: `uploaded → mapping` (шаблон узнан → сразу `review`); фото/PDF/скриншот/ценник/RFQ — через `parsing` (AI).
- `applied → undone` — отмена всего импорта (≤ 30 дней; записи, изменённые после импорта, — по выбору пользователя). Документы со снимками цен не меняются.

### Referral
`lead_created → reward_due → reward_paid` / `void` (лид lost, дубль, уже был клиентом).

### ScheduledMessage
`scheduled → sent` / `skipped` (нет канала) / `cancelled` (событие-стоп).

### Entitlement (подписка)
`trialing → active ⇄ past_due → cancelled`; `active → paused → active`. `past_due`: 7 дней полного доступа, затем только чтение (оплаты клиентов по порталу работают всегда).

### SupportTicket
`new → open → waiting_on_customer → resolved → closed`; `resolved` 7 дней без ответа → `closed`; ответ клиента ≤ 30 дней → `open`.

### AiAction
`proposed → confirmed → applied → (undone)`; `proposed → cancelled`; любой → `failed`.

---

## 10. Связи (ERD)

```mermaid
erDiagram
  User ||--o{ Membership : has
  Company ||--o{ Membership : has
  CompanyGroup ||--o{ CompanyGroupMember : groups
  CompanyGroupMember }o--|| Company : member
  Company ||--o{ Customer : owns
  Company ||--o{ TaxRate : defines
  Company ||--o{ TaxProfile : defines
  TaxProfile }o--o| TaxRate : default_rate
  Supplier }o--o| TaxRate : purchase_tax
  Company ||--o{ ImportJob : imports
  ImportJob ||--o{ ImportRow : rows
  ImportJob }o--o| ImportMapping : mapped_by
  Supplier ||--o{ ImportMapping : templates
  Customer ||--o{ Contact : has
  Customer ||--o{ Property : owns
  Property ||--o{ PropertyContact : has
  Lead }o--|| LeadSource : from
  Lead }o--o| Customer : becomes
  Lead }o--o| Property : at
  Property ||--o{ Drawing : has
  Drawing ||--o{ DrawingRun : has
  Drawing ||--o{ DrawingPoint : has
  Estimate }o--|| Customer : for
  Property ||--o{ Estimate : "N смет"
  Estimate ||--o{ EstimateVersion : versions
  EstimateVersion }o--o| TaxRate : taxed_by
  EstimateVersion }o--o| TaxProfile : tax_profile
  Invoice }o--o| TaxProfile : tax_profile
  EstimateVersion ||--o{ EstimateOption : options
  EstimateOption ||--o{ EstimateLineItem : lines
  EstimateVersion ||--o| EstimateApproval : approved_by
  EstimateTemplate ||--o{ EstimateVersion : seeds
  Estimate ||--o| Job : creates
  Property ||--o{ Job : "N работ"
  Job ||--o{ Visit : scheduled_as
  Job ||--o{ ChangeOrder : has
  Job ||--o{ Warranty : gives
  Job ||--o{ SubcontractorAssignment : outsourced
  Subcontractor ||--o{ SubcontractorAssignment : performs
  Subcontractor ||--o{ SubcontractorPayment : paid
  Job ||--o{ Invoice : billed_by
  Invoice ||--o{ InvoiceLineItem : lines
  Invoice }o--o| TaxRate : taxed_by
  Invoice ||--o{ Payment : paid_by
  Invoice ||--o{ PaymentAttempt : attempts
  Job ||--o{ Expense : costs
  Job ||--o{ TimeEntry : labor
  Job ||--o{ PurchaseOrder : orders
  PurchaseOrder ||--o{ PurchaseOrderLine : lines
  PurchaseOrder }o--|| Supplier : to
  Expense }o--o| PurchaseOrder : bills
  Supplier ||--o{ SupplierItem : sells
  CatalogItem }o--o| SupplierItem : sourced_from
  Assembly ||--o{ AssemblyComponent : has
  AssemblyComponent }o--o| CatalogItem : uses
  RecurringPlan ||--o{ Job : generates
  Customer ||--o{ PortalAccess : opens
  Subcontractor ||--o{ PortalAccess : work_order_link
  User ||--o{ AiAction : commands
  User ||--o{ Device : uses
  User ||--o{ Notification : receives
  ServiceCategory ||--o{ Lead : categorizes
  ServiceCategory ||--o{ Estimate : categorizes
  ServiceCategory ||--o{ Job : categorizes
```

---

## 11. Офлайн: что хранится на телефоне

| Данные | Офлайн |
|---|---|
| Клиенты, объекты, контакты (компании пользователя) | чтение и правка |
| Работы и визиты на 14 дней вперёд (−7 дней назад) | чтение и правка статусов |
| Наряды субподрядчиков | owner/office — по кэшированным работам; `subcontractor` с входом — только свои наряды, без цен клиента |
| Каталог, сборки, формулы | чтение (движок смет работает на телефоне) |
| Чертежи и сметы | создание и правка черновиков |
| Фото, подписи, чеки | создание, загрузка при появлении сети |
| Навигация по приложению (текстом и тапом, словарь команд) | ✅ на устройстве, без сети и без лимита |
| Голосовая навигация | MVP в сети; офлайн — только где iOS распознаёт речь на устройстве для языка, иначе позже |
| Отправка клиенту, оплата картой, сложные команды AI | требуют сети (ставятся в очередь или недоступны) |
| Налоговые профили, ставки, ставки поставщиков | чтение (движок считает налог и себестоимость офлайн) |
| Импорт/экспорт, AI-скан прайса и ценника | только онлайн; фото прайса/ценника без сети сохраняется и распознаётся при появлении сети |
| Ссылка наряда для субподрядчика без входа | только онлайн (веб) |

Конфликты: поля без конфликта сливаются автоматически. Документы с деньгами (отправленные сметы, инвойсы, платежи) меняются только на сервере. При конфликте в черновике показываем обе версии и предлагаем выбрать (`SyncConflict`).

---

## 12. Открытые вопросы
1. ✅ Налог: ручной, настраиваемый (TaxRate + переключатель на документе + `taxable` на позиции). v0.3: налоговые профили с 4 режимами, налог при покупке в себестоимости, цены без налога (PRD 19). Какой профиль, ставку и базу использовать, решает пользователь со своим CPA (исследование — `docs/legal/`).
2. ✅ Субподрядчики: нужны в MVP (Subcontractor, SubcontractorAssignment, SubcontractorPayment, ссылка наряда через PortalAccess).
3. ✅ Несколько объектов у клиента и несколько работ на объекте: часто. «Объекты» — отдельный раздел.
4. ✅ Финансирование: **не в MVP**. Когда появится — у нас храним только статус заявки, сумму, id лендера и показанные раскрытия (снимок), без кредитных данных клиента; «от $X/мес» — только из ответа лендера.
5. Остальные решения для основателя — `03-prd/00-decisions-for-founder.md`.

---

## 13. Журнал изменений

### 13.3 v0.3.1 — юридическое исследование 03.11.2026 (`legal/legal-research.md`, LEG-01…LEG-22)
| Требование / PRD | Внесено | Не внесено / как решено |
|---|---|---|
| LEG-01 тип договора (PRD 05) | `EstimateVersion.contract_type`, `customer_initiated`, `service_request_scope`, `negotiated_at_contractor_office`; запрет deposit/progress для `ca_service_repair` | Определение «чистка — не HIC» — подсказка, не автоматический вывод (адвокат §11.1 п. 6) |
| LEG-02 CA-шаблон (PRD 05) | **ContractTemplate** (заблокированные блоки, `required_fields`, проверка юристом); `EstimateVersion.contract_template_id/version`, `start/completion_date_approx`, `substantial_commencement_text` | ES-шаблон — после перевода и утверждения (Б6) |
| LEG-03 countersign (PRD 05, 07) | `EstimateApproval.countersigned_*`, `countersign_method`, `executed_pdf_file_id`, `executed_copy_delivered_at/_delivery`; статус Estimate `awaiting_countersign`; `Membership.can_sign_contracts`, `countersign_signature_file_id`; `Company.contract_settings.auto_countersign` | Допустимость автоподписи — адвокат (§11.1 п. 3) |
| LEG-04 срок отказа (PRD 05, 07, 18) | **ContractRuleSet** (3/5/7, суббота, праздники, `unknown_senior_policy`, `refund_days`, пороги S&R/HIC, лимит депозита); `EstimateApproval.owner_65_plus`, `rescission_days`, `rescission_rule_version`, `cancellation_*`; `EstimateVersion.disaster_emergency_repair`, `emergency_declaration_ref`; статус `cancelled_by_customer` | Отказ от права отказа (Civ. §1689.15) — не строим |
| LEG-05 E-SIGN и бумажная форма (PRD 05) | **ESignConsent**; `EstimateApproval.esign_consent_id`, `paper_notice_*`; `Company.contract_settings.paper_notice_of_cancellation` (вкл.) | — |
| LEG-06 депозит и этапы (PRD 05, 09) | `EstimateVersion.payment_schedule`, `bond_attestation`; `Invoice.payment_schedule_item_id`, `work_performed_attestation`; `ca_deposit_cap` для всех жилых HIC | Лимит для ≤ $500 — адвокат (§11.1 п. 5) |
| LEG-07, LEG-08 реквизиты (PRD 01, 05) | `Company.license_class`, `license_expires_on`, `contract_settings` (CGL, WC, email/адрес для отказа); `Membership.his_registration_number` | — |
| LEG-09 возврат при отказе (PRD 09, 18) | `Refund.due_by`, `reason_kind`; `Job.cancel_reason = rescission` | — |
| LEG-10…LEG-13 SMS (PRD 13) | **ConsentRecord**, **ConsentText**; `Contact.sms_consent_status`, `is_team_member`, `consent_source` без `import` (флаги — вычисляемые); `Message.category`, `recipient_timezone`, `tz_source`; `AutomationSetting` `referral_offer` | Reassigned Numbers Database — позже |
| LEG-15 субподрядчики (PRD 07) | `Subcontractor.license_class/status/checked_at/lookup_url`, `wc_*`, `business_license_number`, `place_of_business`, `subcontract_agreement_file_id`, `ab5_checklist/status/checked_*`, `sms_consent_record_id`; `SubcontractorPayment.method` + `card`, `payment_network`, `counts_for_1099_nec`, `w9_missing_override_reason`; `subcontractor_settings.form_1099_thresholds` (вместо `form_1099_threshold_cents`), `unlicensed_work_threshold_cents` ($1,000), `trade_license_classes`; `Job.requires_permit`, `permit_number` | AB5 — чек-лист, не вывод; CPA — Zelle и S-corp |
| LEG-16 налоги (PRD 19) | Ставки LA с 01.10.2026 — датированные заглушки; рекомендованный пресет CA `included_in_price` + предупреждение | Новых полей не нужно (`effective_from/to` уже есть с v0.3) |
| LEG-17 платежи (PRD 09) | `Company.payment_settings.returned_check_fee`, `method_discount.legal_review_confirmed_at`; `InvoiceLineItem.kind` `returned_check_fee` | ACH-скидка — за флагом до ответа адвоката |
| LEG-18 снимки (ADR-004) | Флаги провайдера адаптера; `Drawing.imagery_ref.provider` + `eagleview` / `hover`, `report_id` | Esri — после письменного подтверждения |
| LEG-19 геопозиция (PRD 07, 08) | `Membership.location_notice_ack_at`; передача только во время выезда | AB 1331 — проверить у адвоката |
| LEG-21 хранение | Сроки в описаниях `EstimateApproval`, `ESignConsent` (10 лет), `ConsentRecord` (5 лет) | Legal hold и полная таблица — `08-security` (позже) |

### 13.2 v0.3 — решения основателя 03.11.2026 (второй пакет)
| Решение / PRD | Внесено | Не внесено / как решено |
|---|---|---|
| 1. Тестовые цены (PRD 04 §7.5) | `CatalogItem.is_placeholder_price`; предупреждение при отправке сметы с тестовыми ценами (PRD 05) | Реальный прайс основателя (Г1) больше не блокирует MVP |
| 2. Массовый импорт/экспорт — MVP (PRD 04 §7.7) | **ImportJob** (вместо `PriceListImport`: цели `supplier_prices` / `catalog` / `customers` / `estimate_lines` / `estimates_archive`, источники CSV/XLSX/XML/JSON/фото/PDF/скриншот/ценник/RFQ/AI-команда, отмена), **ImportRow** (diff, before/after), **ImportMapping** (шаблоны поставщика, `sku_aliases`); статусы ImportJob §9; `DataExport.format/filter`; `Estimate.created_via` и `EstimateVersion.source` + `import`; `SupplierItem.import_job_id` (вместо `source_import_id`) | Автоимпорт по расписанию, API Jobber/HCP — позже |
| 3. AI-скан прайса и ценника — MVP (PRD 04 §7.6, PRD 15) | `ImportJob.source_kind` (`photo`, `pdf`, `screenshot`, `shelf_tag`, `ai_command`, `rfq_quote`), `ImportJob.ai_action_id`, `SupplierItem.price_source`; ответы RFQ (PRD 11) идут в тот же diff (`ImportJob.supplier_quote_id`) | Batch API — только по выбору для > 20 страниц (интерактивный скан синхронный) |
| 4. Цены без налога, налог при покупке у поставщика (PRD 19 §7.6, §7.10) | §0 правило; `Supplier.purchase_tax_rate_id`, `branches[].purchase_tax_rate_id`; `CatalogItem.unit_material_cost_cents`; `EstimateLineItem.unit_material_cost_cents`, `purchase_tax_bps` (снимки), формула `line_cost`; `ImportJob.detected_tax`; `PurchaseOrder.tax_cents` по ставке поставщика | — |
| 5. Налоговые профили (PRD 19) | **TaxProfile** (4 режима, пресеты, `include_purchase_tax_in_cost`, `deposit_tax_mode`, `default_taxable_scope`, `default_enabled`); TaxRate (+ `kind`, регион, `effective_from/to`, `is_placeholder`, `source_note`; `rate_bp` → `rate_bps`); `Company.tax_settings` → `default_tax_profile_id`, `default_purchase_tax_rate_id`; снимки `tax_profile_id`, `tax_mode`, `include_purchase_tax_in_cost` на EstimateVersion, ChangeOrder, Invoice; `Invoice.totals.net_ex_tax`; `Refund.allocation.method/tax_cents/net_cents` | Несколько ставок на одном документе, валюта MXN, CFDI — позже |
| 6. Стандарты гаттеров (PRD 06 §7.4, §7.6) | `Company.gutter_settings` (высоты этажей 10/20/30/40, удлинение, отходы 5% с диапазоном 0–100%, hangers 2 ft, колена 3 × A); `Property.story_heights_override_ft`; DrawingPoint downspout: `height_mode`, `custom_height_ft`, `elbows[{style, qty}]`; `calc_inputs.constants_override`; ключи `CatalogItem.attributes` `component`, `elbow_style`, `angle_deg`, `ds_size` round | Полный список колен — от основателя (Г8), структура уже принимает любые варианты |
| 7. Письма лидов | Без изменений | Г3 остаётся |

### 13.1 v0.2 (что внесено из PRD)

| PRD | Внесено | Не внесено / как решено |
|---|---|---|
| 01 Аккаунты | Entitlement (status, trial, pause, packs, Stripe ids, group discount), UsageCounter (emails, ai_today/ai_day, sms inbound), Company (phone, email, primary_trade, service_area, onboarding_state), Membership (invite, suspended_at), CompanyGroupMember, DataExport | — |
| 02 Лиды | Lead (parse_status, raw_file_id, inbound_message_id, duplicate_of, existing_customer, first_response_kind, referred_from_visit_id, next_step_due_at), enum lost_reason, LeadSource (default_cost, is_active, sender_patterns, deep_link), Company (inbound address, assignee, alert min, business_hours) | — |
| 03 Клиенты | Customer (merged_into, anonymized_at, dns_reason), Contact (is_primary, is_active), PropertyContact, Property (шифрование gate_code, fire_zone_source/checked_at), Address.unit, Activity (note-поля, pinned, visibility), Task (completed_*, automation_key) | Индексы поиска (trigram, match_key) — архитектура Фазы 3 |
| 04 Каталог | CatalogItem (pricing_mode, markup_bps, is_active, seed_*), Assembly (constants, version, status, test_cases), AssemblyComponent (item_selector, position), SupplierItem (valid_to, unit, pack_size), Supplier (is_active, branches), PriceListImport (file_kind, cancelled, applied_*, ai_action_id, summary) | `min_margin_bps` — в `Company.estimate_settings` (общее с 05) |
| 05 Сметы | EstimateVersion (locked/sent_at, content_hash, pdf, tax, engine, calc_*, source, template, copied_from), EstimateOption (discount), EstimateLineItem (origin, is_override, calc_quantity, is_assumption, line_cost), Estimate.declined_reason, EstimateApproval (document_hash, consent, signer_email, rescission_ends_at), ChangeOrder (invoice_id, cost_cents), unique Job.estimate_id, **EstimateTemplate**, Company.estimate_settings | `tax_rate_bps` дополнен `tax_enabled` + `tax_rate_id` (ручной налог); `synced_from_offline` заменён на `offline` из PRD 16 |
| 06 Gutters | Drawing (calibration, zoom, размеры, imagery_date, attribution, building_center), DrawingRun (label, roof_side, hanger_type, closed, segment_overrides, locked_attrs), DrawingPoint (is_auto, user_overridden, angle, segment_index, атрибуты downspout), ключи CatalogItem.attributes | EstimateTemplate и Assembly.constants — общие с 04/05 |
| 07 Работы | Visit (kind, schedule_mode, flex_week_start, sequence_in_route, eta_at, notify_customer), Job (occurrence_date + unique, estimated_duration, completed/closed_at), RecurringPlan (template_lines, price, duration, fixed_time, checklist, crew), ChecklistTemplate.items, File (stage, client_visible, job/visit), Company.scheduling_settings, TimeEntry (source, edited_by); субподрядчики: Visit.subcontractor_assignment_id, поля наряда, статусы | — |
| 08 Карта | Lead (geo, geo_status), Property.geo_source, Membership (home_base, share_location), **UserLocation** | `origin = map_nearby` → поле `created_via` у Estimate и Visit (вместо Activity) |
| 09 Инвойсы | Payment (reference, received_at, proof, voided, returned, needs_review, dispute, offline_created, charge/payout ids), Invoice (sent/viewed_at, reminders, source version, credits, revision, налог), InvoiceLineItem.source_*, Company.payment_settings, **WebhookEvent**, **PaymentAttempt** (отдельная сущность) | ACH return — статус `returned`, не Refund |
| 10 Расходы | Expense (billed_invoice_line_id, purchase_order_id, supplier_id, reimbursed_*, ocr_*, image_hash, idempotency, created_offline, line_items, amount < 0), **LaborRate**, Job (cost_breakdown, committed_cost), Company.costing_settings | Затраты субподряда по нарядам — из SubcontractorAssignment, а не Expense |
| 11 PO | статус `partially_received`, PO (revision, sent_*, pdf, fulfillment, branch, driver_notes, source_*, total, idempotency, confirmed_at), job_id nullable, **PurchaseOrderLine**, Supplier.branches | `Expense.purchase_order_id` и `Job.committed_cost_cents` — дубли с 10, внесены один раз |
| 12 Портал | PortalAccess (contact, document, open_count, locale), EstimateApproval.locale, **Warranty**, PublicProfile (services price_from, testimonials, google_review_url, hide_street_address, translations), AvailabilityRule, BookingRequest, File.public_gallery | `Referral.code` на клиента → `Customer.referral_code` (+ clicks); Referral — запись на каждого приведённого. PortalAccess расширен `audience = subcontractor` |
| 13 Коммуникации | **MessageTemplate**, **AutomationSetting**, **ScheduledMessage**, **Campaign** (Запуск) + Lead.campaign_id, Contact (consent-поля), Company (sms_number, a2p, referral_reward), Message (segments, cost, template/automation key, idempotency, sent_via), ReviewRequest (invoice_id, reminder), Referral (status, reward_*) | `Company.google_review_url` → только в PublicProfile (дубль с 12) |
| 14 Отчёты | MarketingSpend (company_id, kind, expense_id, created_by), Expense.lead_source_id, Job.attributed_source_id | Job.completed_at — дубль с 07; дневные агрегаты — архитектура Фазы 3 |
| 15 AI | AiAction (channel, locale, transcript, context, tier, plan, resolved_entities, assumptions, parent, idempotency, row_versions, undo_*, error_code, counted, pending_offline), Entitlement.limits.ai_daily_cap, Expense.ai_action_id | UsageCounter ai_today/ai_day — дубль с 01; EstimateLineItem — дубль с 05 |
| 16 Офлайн | Поля синхронизации (§0), **SyncOperation**, **Device**, **SyncConflict**, EstimateApproval (offline, server_decision, rejection_reason), File.upload_status, Property.offline_imagery_ready_at | Payment.offline_created — дубль с 09 |
| 17 Поддержка | §8a: PlatformRole, KbArticle, SupportTicket, SupportMessage, SupportAccessGrant; AuditLog.actor_type `support` | — |
| 18 Проверочные примеры денег | CustomerCredit, CreditApplication, Payment.return_reason, Invoice (void_reason/by/at), Refund (allocation, platform_fee_refunded_cents), Job (cancel_reason, cancelled_at), Expense.transferred_from_job_id | Предлагалось в v0.3 — внесено сразу в v0.2. `needs_review` — флаг Payment (как в PRD 09), а не статус; `returned` — уже статус |
| Анализ внешней CRM (`inputs/external-crm-entities-gap-analysis.md`) | **ServiceCategory** (определена) + `service_category_id` у Estimate/Job, **Notification**, **NotificationPreference**, Company (`default_client_locale`, реквизиты ручной оплаты в `payment_settings`), Customer.review_status, Contact.email_bounce_*, Property (label, kind), Lead (cost_origin, cost_refunded_*, last_inbound/outbound_at, phone_is_relay, geo_status `approx`), EstimateApproval (`office_recorded`, signature_method), Invoice.customer_payment_claim, Payment.receipt_* + префикс `RCT`, Expense.document_number, PO (tax, delivery_fee, supplier_reference), Supplier.payment_terms | Отпуска, эскалация лида по ступеням, Credential, write-off, подпись подрядчика, coil-склад и др. — «позже» в файле анализа |
| Решения основателя | TaxRate на документах (tax_enabled/tax_rate_id/снимок), Company.tax_settings; Subcontractor (tax_classification, tin, compliance), SubcontractorAssignment (полная структура), PortalAccess `audience = subcontractor`, Company.subcontractor_settings, роль `subcontractor` в MVP | — |
