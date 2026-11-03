# 04. Словарь сущностей (Domain Model)

> Статус: черновик **v0.2**, ноябрь 2026. Источник правды для базы данных, API, типов приложения и инструментов AI-помощника.
> v0.2: внесены предложения «Изменения модели данных» (раздел 14) из всех 17 PRD (`03-prd/01…17`), дубли сведены, решения основателя от 03.11.2026 отражены везде. Журнал изменений — §13. Открытые решения для основателя — `03-prd/00-decisions-for-founder.md`.
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
| Длины | Десятичные **футы** с точностью до 1/8″ (`length_ft: numeric(10,3)`). Отображение: 148′ 6″ |
| Время | Хранится в UTC. У компании `timezone` (по умолчанию `America/Los_Angeles`) |
| Номера документов | Человеческий номер на уровне компании: `EST-0148`, `INV-0093`, `JOB-0210`, `PO-0031`, `CO-0004`. Присваивает **только сервер** (офлайн — «черновик» без номера) |
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
| license_number | text | нет | Лицензия CSLB (CA). Пустая → предупреждение при отправке сметы |
| ein | text, зашифровано | нет | |
| timezone, currency | text | да | |
| address | Address (встроенный) | да | |
| primary_trade | `gutters`, `roofing`, `other` | да | Из онбординга |
| service_area | json: города, ZIP[] | нет | Зона работ (онбординг, онлайн-запись, SEO) |
| onboarding_state | json | | Шаги онбординга и чек-лист «Настройка» |
| brand | json: logo, цвета, подпись | нет | Для документов и портала |
| public_slug | text, unique | да | Адрес публичной страницы `octo.app/p/bonpoc-gutters` |
| trade_modules | ← Entitlement | | Включённые модули |
| stripe_account_id | text | нет | Stripe Connect |
| numbering | json | да | Префиксы и счётчики документов |
| tax_settings | json | да | Налог по умолчанию (см. TaxRate, §6): `default_enabled` (выкл по умолчанию), `default_tax_rate_id`, `default_taxable_scope` (`all` / `materials_only` / `none` — какие новые позиции каталога помечаются `taxable`), `deposit_tax_mode` (`in_final` по умолчанию / `proportional`) |
| inbound_lead_address | text, unique | да | `leads-<slug>@in.octo.app` (пересылка писем маркетплейсов, PRD 02) |
| lead_default_assignee_id | → User | нет | Кому назначать новые лиды (по умолчанию owner) |
| lead_response_alert_min | int | | Порог «таймер красный», по умолчанию 5 |
| business_hours | json | | Рабочие часы (повторные push, quiet hours) |
| sms_number | text | нет | Номер Twilio (PRD 13) |
| a2p_brand_status, a2p_campaign_status | `not_started`/`pending`/`approved`/`rejected` | | 10DLC |
| referral_reward | json | | Награда рефереру / скидка новому (по умолчанию $50 / $25) |
| estimate_settings | json | | `default_expiry_days` (30), `min_margin_bps` (3500), `margin_override_role`, `ca_deposit_cap` (вкл. для CA), `followup_days[]` (PRD 04, 05) |
| payment_settings | json | | `deposit_default_pct`, `terms_days`, `ach_recommend_threshold_cents` ($1,000), напоминания, `method_discount` (флаг, выкл.) (PRD 09) |
| costing_settings | json | | `default_markup_pct` (billable), `target_margin_pct`, `default_labor_rate_cents`, `expense_alert_threshold_cents` (PRD 10) |
| scheduling_settings | json | | Окна прибытия, длительности по типам визитов, рабочие часы, «время по бригаде» (PRD 07) |
| subcontractor_settings | json | | `coi_warning_days` (30), `block_on_expired_coi` (выкл.: предупреждение + подтверждение), `form_1099_threshold_cents` (PRD 07, 14) |

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
| share_location | bool | Согласие на передачу геопозиции (PRD 08). Для `subcontractor` всегда false |

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

### Contact — контактное лицо
| Поле | Тип | Описание |
|---|---|---|
| customer_id | → Customer | |
| name, phone, email | text | |
| role | `owner`, `tenant`, `property_manager`, `spouse`, `other` | |
| is_primary, is_active | bool | Один primary на клиента |
| preferred_language | `en` / `es` | |
| sms_opt_in, sms_marketing_opt_in | bool + дата согласия | Транзакционные / маркетинговые SMS (TCPA) |
| consent_source | `web_form`, `portal`, `verbal_recorded_by_user`, `customer_texted_first`, `import` | |
| consent_text_version, consent_ip | text | Доказательство согласия |
| sms_opted_out_at, email_unsubscribed_at | timestamp | STOP / отписка (блок на сервере) |
| email_opt_in | bool + дата | |
| sms_undeliverable | bool | Стационарный/неверный номер |

### Property — объект (дом, адрес, где делается работа)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| customer_id | → Customer | да | Владелец-плательщик (может смениться) |
| address | Address | да | Улица, город, ZIP, штат, unit |
| geo | lat, lng | да (геокодинг) | Для карты и спутника |
| geo_source | `geocoder`, `manual` | | Ручная правка пина не перезаписывается геокодером |
| stories | int | нет | Этажность (влияет на смету) |
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
| geo, geo_status | lat/lng, `ok`/`failed`/`manual` | | Лид на карте до создания Property |
| service_requested | text + → ServiceCategory | | «Seamless gutters 2 story» |
| cost_cents | int | нет | Сколько стоил этот лид (Thumbtack списал $45). Сохраняется и у lost/duplicate |
| first_response_at | timestamp | | Для метрики скорости ответа |
| first_response_kind | `call`, `sms`, `email`, `marketplace`, `manual` | | |
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

### CatalogItem — позиция каталога
| Поле | Тип | Описание |
|---|---|---|
| kind | `service`, `material`, `labor`, `fee`, `discount` | |
| name, description | text | Как увидит клиент |
| sku | text | Внутренний артикул |
| unit | `LF`, `SF`, `SQ` (кровельный сквер), `ea`, `hr`, `day`, `flat` | |
| pricing_mode | `fixed`, `cost_plus` | |
| markup_bps | int | Для `cost_plus`: цена = round_half_up(cost × (1 + markup)) |
| unit_price_cents | int | Цена клиенту |
| unit_cost_cents | int | Себестоимость (скрыта от tech и sub) |
| taxable | bool | Значение по умолчанию для флажка `taxable` строки документа. **Сам по себе налог не включает** — налог считается, только если он включён на документе (§6 TaxRate). Для новых позиций ставится по `Company.tax_settings.default_taxable_scope` |
| category_id | → ServiceCategory | |
| supplier_item_id | → SupplierItem | Основной поставщик материала |
| module | `core`, `gutters`, `roofing`… | Какой модуль поставил позицию |
| attributes | json | Стандартные ключи: `profile`, `gauge`, `color`, `coil_width_in`, `ds_size`, `noncombustible`, `hanger_type` (селекторы сборок, PRD 06) |
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
`name`, `contact`, `email_for_orders`, `phone`, `account_number`, `branches[]` (структура: `name`, `address`, `phone`, `email`), `delivery_notes`, `is_active`.

### SupplierItem — позиция в прайсе поставщика
`supplier_id`, `supplier_sku` (уникален в рамках поставщика), `name`, `unit` (текст поставщика: roll, box, lb, stick), `cost_cents`, `pack_size` (сколько **единиц каталога** в одной единице поставщика: коробка 50 hangers → 50), `valid_from`, `valid_to` (текущая = `valid_to IS NULL`; смена цены = новая запись), `source_import_id`.

### PriceListImport — загрузка прайса (CSV/XLSX; AI-скан фото/PDF — после MVP)
`supplier_id`, `file_id`, `file_kind` (`photo`/`pdf`/`csv`/`xlsx`), `status` (§9), `parsed_rows json` (по схеме: `supplier_sku, name, unit_text, cost, pack_size, confidence по полям, page, bbox, класс строки new/price_up/price_down/unchanged/unmatched/low_confidence`), `confidence`, `summary json` (N обновлено, M новых, позиции ниже порога маржи), `ai_action_id`, `applied_at`, `applied_by`. Пользователь проверяет распознанные строки перед применением; применение идемпотентно по `id`.

---

## 4. Замеры и сметы

### Drawing — чертёж на объекте (модуль Gutters, позже Roofing)
| Поле | Тип | Описание |
|---|---|---|
| property_id | → Property | Чертёж живёт на объекте и переиспользуется |
| base_image | → File | Спутниковый снимок или своё фото |
| image_source | `satellite_google`, `satellite_mapbox`, `upload` | Провайдер — решение ADR Фазы 3 (лицензия) |
| scale_ft_per_px | numeric | Из спутника автоматически или по калибровке «эта линия = 20 ft» |
| calibration | json: p1, p2, known_ft | Ручная калибровка |
| zoom, image_w_px, image_h_px | int | |
| imagery_date, provider_attribution | date, text | Атрибуция провайдера снимков |
| building_center | x, y | Эвристика inside/outside углов |
| geo_bounds | json | Привязка снимка к координатам |
| version | int | Чертёж версионируется вместе со сметой |

### DrawingRun — линия гаттера
`drawing_id`, `label`, `points[] (x,y)`, `closed bool`, `length_ft` (вычисленная, можно переопределить рулеткой: `length_override_ft`), `segment_overrides json` (override длины по сегментам), `story`, `roof_side` (`left`/`right`), `profile` (K5, K6, HR5, HR6, box7), `material`, `gauge`, `color`, `hanger_type` (`hidden`/`strap_tile`/`spike`), `guards bool`, `tear_off bool`, `locked_attrs text[]` (атрибуты, которые пресеты G/B/B не меняют).

### DrawingPoint — точка на чертеже
`drawing_id`, `kind` (`downspout`, `end_cap_left`, `end_cap_right`, `outlet`, `miter_inside`, `miter_outside`, `fascia_repair`, `tile_hanger_zone`, `note`), `x, y`, `run_id`, `segment_index`, `angle_deg`, `is_auto bool`, `user_overridden bool`, `attributes` (для downspout: `size` 2×3/3×4, высота, `length_override_ft`, `elbows`, `extension`).
Углы вычисляются автоматически по поворотам линий, пользователь может их поправить.

### Estimate — смета (контейнер)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| number | text | да | EST-0148 |
| customer_id, property_id | → | да | Смета без объекта невозможна. На одном объекте может быть несколько открытых смет одновременно |
| lead_id | → Lead | нет | Для воронки и ROI |
| status | см. §9 | да | |
| current_version_id | → EstimateVersion | да | |
| sent_version_id | → EstimateVersion | нет | Что видит клиент |
| expires_at | date | нет | |
| owner_user_id | → User | | Продавец (для комиссии) |
| viewed_count, last_viewed_at | вычисляемые | | «Открыл 3 раза» (открытия сотрудниками не считаются) |
| declined_reason | enum (`price`, `chose_competitor`, `postponed`, `other`) + текст | при `declined` | |
| created_via | `manual`, `template`, `drawing`, `copy`, `ai`, `map_nearby`, `portal` | | Атрибуция (например, деньги из режима карты «Рядом», PRD 08) |

### EstimateVersion — версия сметы
Отправленная версия **не редактируется**. Любое изменение создаёт новую версию.
| Поле | Тип | Описание |
|---|---|---|
| estimate_id | → Estimate | |
| version_no | int | 1, 2, 3 |
| drawing_id + drawing_version | → | Из какого чертежа посчитано |
| intro_text, scope_text, terms_text, exclusions_text | text | |
| deposit_rule | json | % или сумма, когда вносится; CA-лимит |
| tax_enabled | bool | Налог вкл/выкл на документе (по умолчанию из `Company.tax_settings.default_enabled`) |
| tax_rate_id, tax_rate_bps | → TaxRate, int (снимок) | Выбранная ставка; снимок ставки, чтобы изменение TaxRate не меняло отправленные сметы |
| totals | json, вычисляемое | По каждому варианту: subtotal, discount, tax, total, cost, margin |
| locked_at, sent_at | timestamp | Блокировка при отправке (проверка в API и триггер БД) |
| content_hash | text | SHA-256 канонического JSON видимой клиенту части + PDF |
| pdf_file_id | → File | |
| engine_version | text | Версия движка расчёта |
| calc_inputs, calc_outputs | json | Входы сборок; выходы: BOM, cut list, coil по цветам (вид для бригады) |
| source | `scratch`, `template`, `drawing`, `ai`, `copy` | Происхождение версии |
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
| unit_price_cents, unit_cost_cents | int | Цена копируется в момент добавления (снимок), чтобы изменение каталога не меняло старые сметы |
| taxable | bool | Облагается ли строка, **если** налог включён на документе. По умолчанию из `CatalogItem.taxable` |
| is_optional | bool | Клиент может отметить сам (add-on) |
| client_visible | bool | Внутренние строки (BOM) не видны клиенту и всегда с ценой 0 |
| line_total_cents | int, вычисляемое | `round(quantity × unit_price)` |
| line_cost_cents | int, вычисляемое | `round(quantity × unit_cost)` |

### EstimateTemplate — шаблон сметы (новая)
`company_id` (null = системный шаблон модуля), `name` («Чистка гаттеров», «Guards only», «Gutters G/B/B»), `module`, `options[]` (`name`, `is_recommended`, `input_overrides json` — пресеты G/B/B для движка, `lines`), `intro/scope/terms/exclusions`, `deposit_rule`, `is_system`. Цены при создании сметы берутся из **текущего** каталога.

### EstimateApproval — решение клиента
`version_id`, `option_id` (выбранный вариант), `selected_optional_items[]`, `signer_name`, `signer_email`, `signature_file_id`, `signed_at`, `ip`, `user_agent`, `locale`, `channel (portal / in_person / ai_recorded)`, `document_hash` (= `content_hash` версии), `consent_text_version` (ESIGN/UETA), `rescission_ends_at` (CA: право отказа 3/5 рабочих дней), `deposit_payment_id`, `offline bool` (подпись на устройстве без сети — приходит как заявка), `server_decision` (`accepted`/`rejected`), `rejection_reason`.

### ChangeOrder — доп. работы во время выполнения
`job_id`, `number` (CO-0004), `reason`, `lines[]` (как LineItem, тот же движок), `tax_enabled`, `tax_rate_id`, `tax_rate_bps` (по умолчанию как в одобренной версии сметы), `status (draft → sent → approved / declined)`, `approval` (как EstimateApproval), `amount_cents` (может быть < 0), `cost_cents` (→ плановая себестоимость работы), `invoice_id` (в какой инвойс вошёл). После одобрения добавляется к финальному инвойсу работы.

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
| recurring_plan_id, occurrence_date | → RecurringPlan, date | unique(`recurring_plan_id`, `occurrence_date`) — без дублей генерации |
| estimated_duration_min | int | Длительность по умолчанию для новых визитов |
| planned_cost_cents, actual_cost_cents | int, вычисляемые | Job costing (PRD 10) |
| committed_cost_cents | int, вычисляемое | Обязательства: PO `sent…received` без счёта + наряды субподрядчиков, ещё не одобренные к оплате |
| cost_breakdown | json, вычисляемое | План / факт по категориям: материалы, труд, субподряд, прочее, комиссии платежей |
| attributed_source_id | → LeadSource, денормализация | Для быстрых отчётов ROI (пересчитывается при смене источника лида) |
| completed_at, closed_at | timestamp | Метрики «до инвойса» |
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
| license_number, license_expires_on | text, date | CSLB. Пусто или истекла → предупреждение при назначении |
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
`subcontractor_id`, `assignment_ids[]`, `amount_cents`, `method (check / ach / zelle / cash / other)`, `reference` (номер чека), `paid_at`, `note`, `recorded_by`. Итог за календарный год нужен для 1099-NEC (порог — `Company.subcontractor_settings.form_1099_threshold_cents`, подтвердить у бухгалтера).

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
| tax_enabled, tax_rate_id, tax_rate_bps | bool, → TaxRate, int (снимок) | Налог вручную на документе; для deposit/final — по умолчанию из одобренной версии сметы, для standalone/recurring — из настроек компании |
| totals | subtotal, tax, total, paid, balance | |
| revision | int | Правка отправленного неоплаченного инвойса = новая ревизия (старый PDF сохраняется) |
| sent_at, viewed_at | timestamp | |
| reminders_paused, reminder_state | bool, json | Напоминания о просрочке |
| source_estimate_version_id | → EstimateVersion | |
| credits[] | → Invoice[] | Deposit/progress, зачтённые в финальном строками-кредитами |

### InvoiceLineItem
Как EstimateLineItem (снимок цены, `taxable`), плюс `source_type/source_id` (`estimate_line` / `change_order` / `expense` / `recurring_plan` / `credit`) — трассировка и защита от двойного выставления. BOM-строки в инвойс не попадают.

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

### PaymentAttempt — попытка оплаты (новая)
`invoice_id`, `idempotency_key` (`hash(invoice_id, amount, attempt_no)`), `amount_cents`, `stripe_payment_intent_id`, `expires_at`. Создаётся при открытии экрана оплаты, до появления Payment; повтор возвращает тот же PaymentIntent.

### Refund
`payment_id`, `amount_cents`, `reason`, `status`, `approved_by` (только owner/admin), `refund_application_fee bool`.

### Expense — расход
| Поле | Тип | Описание |
|---|---|---|
| date | date | |
| vendor | text | Home Depot, ABC Supply |
| supplier_id | → Supplier, нет | Если это счёт известного поставщика |
| amount_cents, tax_cents | int | `amount` включает sales tax чека; может быть < 0 (возврат в магазин) |
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

### TaxRate — ставка налога (настраивается вручную)
**Решение основателя:** налог **не считается автоматически**. Это настраиваемое поле, которое пользователь сам применяет или убирает. Никакого определения ставки по ZIP/адресу.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «LA County 9.5%», «Materials only» |
| rate_bp | int | Ставка в базисных пунктах (950 = 9.50%) |
| is_default | bool | Подставляется в новые документы, если в настройках включено «налог по умолчанию» |
| active | bool | |

Как применяется:
- на уровне **документа** (версия сметы и при необходимости отдельный вариант, инвойс, change order): переключатель «Налог вкл/выкл» (`tax_enabled`) и выбор ставки `tax_rate_id`; ставка копируется снимком `tax_rate_bps`;
- на уровне **позиции**: флажок `taxable` (например, облагать только материалы, не работу);
- `tax_cents = round((Σ line_total(taxable) − доля скидки на облагаемую часть) × rate)`, считается **только если налог включён на документе**; иначе 0, даже если строки помечены `taxable`;
- в инвойсе налог можно изменить, пока он `draft`; после отправки — только новой ревизией (пока нет оплат) или void;
- в настройках компании (`Company.tax_settings`): «налог по умолчанию: выкл / вкл со ставкой X» и «что облагается по умолчанию: всё / только материалы / ничего»;
- что именно облагается для монтажа в CA, решает пользователь со своим бухгалтером; Octo не даёт налоговых советов.

### PurchaseOrder — заказ поставщику
`number (PO-0031)`, `supplier_id`, `job_id` (nullable: заказ на склад), `lines` (← PurchaseOrderLine[]), `status` (§9), `revision int`, `sent_via (email / pdf)`, `sent_at`, `sent_to_email`, `pdf_file_id`, `confirmed_at`, `delivery_date`, `fulfillment` (`delivery` / `pickup`), `branch`, `delivery_address`, `driver_notes`, `source_version_id` (→ EstimateVersion), `source_change_order_id`, `total_cost_cents`, `idempotency_key`. Генерируется из BOM одобренной сметы (уникальность автосозданных: `job_id + supplier_id + source_version_id`).

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
`ReviewRequest`: `job_id`, `invoice_id`, `channel`, `sent_at`, `reminder_sent_at`, `clicked_at`, `platform` (MVP только `google`; Yelp не запрашиваем). Запрос уходит **всем** клиентам, без фильтра недовольных (правила FTC и Google).
`Referral` — одна запись на каждого приведённого: `referrer_customer_id`, `code` (= `Customer.referral_code` реферера), `new_lead_id`, `status` (§9), `reward` (cents / gift), `reward_due_cents`, `reward_paid_at`, `reward_method` (скидка на следующую работу / gift card / наличные). Ссылка и клики живут на клиенте (`Customer.referral_code`, `referral_link_clicks`).

---

## 8. Коммуникации, AI, платформа

### MessageThread / Message
Переписка с клиентом (и субподрядчиком по наряду): `channel (sms / email / portal)`, `direction`, `body`, `status (queued → sent → delivered / failed)`, `provider_id`, `segments`, `cost_cents`, `template_key`, `automation_key`, `idempotency_key`, `sent_via` (`octo` / `own_phone` — «с моего телефона», не подтверждено). Без сети сообщение ставится в очередь (outbox) с TTL.

### MessageTemplate (новая)
`company_id` (null = системный), `key` (`estimate.followup.1`, `work_order.offer`…), `audience` (`customer` / `subcontractor`), `channel (sms/email)`, `locale (en/es)`, `subject`, `body`, `is_system`, `updated_by`. В шаблонах для субподрядчика переменные с ценами клиента (`{total}`, `{balance}`, `{invoice_link}`) запрещены.

### AutomationSetting (новая)
`company_id`, `automation_key` (`lead_instant_reply`, `estimate_followup`, `visit_reminders`, `invoice_reminders`, `review_referral`, `subcontractor_work_order`), `enabled`, `params json` (тайминги, каналы, N минут).

### ScheduledMessage (новая)
`company_id`, `automation_key`, `subject_type/id`, `step`, `scheduled_at`, `status` (§9), `cancel_reason`, `message_id`; unique(`automation_key`, `subject_id`, `step`) — один шаг не уходит дважды.

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
`company_id`, `requested_by`, `scope` (сущности), `status (queued → building → ready / failed / expired)`, `file_id`, `expires_at` (7 дней; после отмены подписки экспорт доступен 90 дней).

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
`user_id`, `company_id`, `lat`, `lng`, `accuracy_m`, `recorded_at`, `source` (`status_change` / `foreground` / `manual`). Только при `Membership.share_location = true` и в рабочие часы; хранение 30 дней (TTL); видят owner/admin/office. У субподрядчиков не собирается.

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
draft → sent → viewed → approved
          ↘ declined   ↘ expired
draft/sent/viewed → revised (новая версия, снова draft)
```
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
draft → sent → confirmed → partially_received → received
  ↘ cancelled (из draft / sent / confirmed / partially_received)
```
- Ревизия (`revision + 1`) не меняет статус; `confirmed` после ревизии возвращается в `sent`. `received` отменить нельзя.

### PriceListImport
`uploaded → parsing → review → applied` / `failed` / `cancelled` (CSV/XLSX сразу в `review`).

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
| Ссылка наряда для субподрядчика без входа | только онлайн (веб) |

Конфликты: поля без конфликта сливаются автоматически. Документы с деньгами (отправленные сметы, инвойсы, платежи) меняются только на сервере. При конфликте в черновике показываем обе версии и предлагаем выбрать (`SyncConflict`).

---

## 12. Открытые вопросы
1. ✅ Налог: ручной, настраиваемый (TaxRate + переключатель на документе + `taxable` на позиции). Какую ставку и базу использовать, решает пользователь со своим бухгалтером.
2. ✅ Субподрядчики: нужны в MVP (Subcontractor, SubcontractorAssignment, SubcontractorPayment, ссылка наряда через PortalAccess).
3. ✅ Несколько объектов у клиента и несколько работ на объекте: часто. «Объекты» — отдельный раздел.
4. ✅ Финансирование: **не в MVP**. Когда появится — у нас храним только статус заявки, сумму, id лендера и показанные раскрытия (снимок), без кредитных данных клиента; «от $X/мес» — только из ответа лендера.
5. Остальные решения для основателя — `03-prd/00-decisions-for-founder.md`.

---

## 13. Журнал изменений v0.2 (что внесено из PRD)

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
| Решения основателя | TaxRate на документах (tax_enabled/tax_rate_id/снимок), Company.tax_settings; Subcontractor (tax_classification, tin, compliance), SubcontractorAssignment (полная структура), PortalAccess `audience = subcontractor`, Company.subcontractor_settings, роль `subcontractor` в MVP | — |
