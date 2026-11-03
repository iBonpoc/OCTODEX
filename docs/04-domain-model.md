# 04. Словарь сущностей (Domain Model)

> Статус: черновик v0.1, ноябрь 2026. Источник правды для базы данных, API, типов приложения и инструментов AI-помощника.
> Продукт: **Octo** (рабочее название). Кода пока нет, всё проектируется с нуля.
> Термины: **сущность** — объект (Клиент, Смета); **поле** — его характеристика (имя, номер, сумма).

---

## 0. Общие правила для всех сущностей

| Правило | Как |
|---|---|
| Идентификатор | `id` UUID v7 (сортируется по времени, можно создавать офлайн на телефоне) |
| Принадлежность | Каждая бизнес-запись имеет `company_id`. Изоляция компаний на уровне базы (RLS) |
| Служебные поля | `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (мягкое удаление), `row_version` (для синхронизации и конфликтов) |
| Деньги | Целые **центы** (`amount_cents: int`) + `currency` (по умолчанию `USD`). Никаких float |
| Длины | Десятичные **футы** с точностью до 1/8″ (`length_ft: numeric(10,3)`). Отображение: 148′ 6″ |
| Время | Хранится в UTC. У компании `timezone` (по умолчанию `America/Los_Angeles`) |
| Номера документов | Человеческий номер на уровне компании: `EST-0148`, `INV-0093`, `JOB-0210`, `PO-0031` |
| Статусы | Только через разрешённые переходы (state machine, §9). Каждый переход пишется в `StatusEvent` |
| Идемпотентность | Операции «создать платёж», «смета → работа», «отправить клиенту» принимают `idempotency_key`. Повтор не создаёт дубль |
| Аудит | Значимые изменения пишутся в `AuditLog`: кто (человек или AI по команде человека), что, когда, было → стало |
| Удаление | Документы с деньгами (инвойс, платёж) не удаляются, только `void` или refund |

---

## 1. Аккаунты, компании, доступ

### User — человек, который входит в Octo
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| email | text, unique | да | Логин |
| full_name | text | да | |
| phone | text | нет | |
| locale | enum `en`/`es`/`ru` | да | Язык интерфейса |
| avatar_file_id | → File | нет | |
| last_active_company_id | → Company | нет | Для открытия последнего контекста |

### Company — юридическое лицо (бизнес подрядчика)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| name, legal_name | text | да | |
| license_number | text | нет | Лицензия CSLB (CA) |
| ein | text, зашифровано | нет | |
| timezone, currency | text | да | |
| address | Address (встроенный) | да | |
| brand | json: logo, цвета, подпись | нет | Для документов и портала |
| public_slug | text, unique | да | Адрес публичной страницы `octo.app/p/bonpoc-gutters` |
| trade_modules | ← Entitlement | | Включённые модули |
| stripe_account_id | text | нет | Stripe Connect |
| numbering | json | да | Префиксы и счётчики документов |
| tax_settings | json | да | Ставки, что облагается |

### CompanyGroup — объединение компаний одного владельца
| Поле | Тип | Описание |
|---|---|---|
| name | text | «Bonpoc Group» |
| owner_user_id | → User | Только владелец создаёт и меняет группу |
| companies | ← Company[] (через `CompanyGroupMember`) | Компания входит максимум в одну группу |

### Membership — роль человека в компании
| Поле | Тип | Описание |
|---|---|---|
| user_id, company_id | → | Уникальная пара |
| role | enum: `owner`, `admin`, `office`, `sales`, `tech`, `subcontractor` | |
| status | `invited`, `active`, `suspended` | |
| permissions_override | json | Точечные исключения |
| color | text | Цвет человека в календаре |

### Матрица прав (кратко)
| Действие | owner | admin | office | sales | tech | sub |
|---|---|---|---|---|---|---|
| Видеть себестоимость и маржу | ✅ | ✅ | ✅ | настраивается | ❌ | ❌ |
| Создавать и отправлять сметы | ✅ | ✅ | ✅ | ✅ | черновик | ❌ |
| Видеть всех клиентов | ✅ | ✅ | ✅ | ✅ | только свои работы | только свои работы |
| Принимать оплату | ✅ | ✅ | ✅ | ✅ | ✅ на объекте | ❌ |
| Возврат денег, void инвойса | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Настройки, роли, тарифы | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Объединённый вид группы | только владелец группы и члены всех её компаний |

---

## 2. CRM: лиды, клиенты, объекты

### Customer — клиент (человек или организация, которая платит)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| kind | `person` / `business` | да | |
| display_name | text | да | «Yuri Petrov», «Glendale HOA» |
| first_name, last_name, company_name | text | | |
| primary_contact_id | → Contact | | |
| billing_address | Address | нет | |
| lead_source_id | → LeadSource | нет | Первый источник (кто привёл) |
| tags | text[] | | |
| status | `active`, `archived`, `do_not_service` | да | |
| lifetime_value_cents | int, вычисляемое | | Сумма оплат |
| notes | text | | |
| match_key | text, вычисляемое | | Нормализованный телефон и email для поиска дублей и cross-company совпадений |

### Contact — контактное лицо
| Поле | Тип | Описание |
|---|---|---|
| customer_id | → Customer | |
| name, phone, email | text | |
| role | `owner`, `tenant`, `property_manager`, `spouse`, `other` | |
| sms_opt_in, email_opt_in | bool + дата согласия | Нужно для SMS (TCPA) |
| preferred_language | `en` / `es` | |

### Property — объект (дом, адрес, где делается работа)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| customer_id | → Customer | да | Владелец-плательщик (может смениться) |
| address | Address | да | Улица, город, ZIP, штат |
| geo | lat, lng | да (геокодинг) | Для карты и спутника |
| stories | int | нет | Этажность (влияет на смету) |
| roof_type | `comp_shingle`, `tile_clay`, `tile_concrete`, `metal`, `flat`, `other` | нет | В LA часто tile |
| fire_zone | `none`, `moderate`, `high`, `very_high` | нет | Из данных CAL FIRE (FHSZ) |
| gate_code, access_notes | text, видно только команде | нет | |
| photos | ← File[] | | |
| attributes | json | | Расширяемые поля модулей (например, длина гаттеров текущей системы) |

Связь `PropertyContact`: у объекта несколько контактов (жилец, управляющий).

**Решение основателя (03.11.2026):** у клиента **часто несколько домов**, а на одном доме бывает **несколько работ одновременно или по очереди** (например, монтаж гаттеров и параллельно ремонт fascia, потом чистка по графику). Поэтому:
- «Объекты» — отдельный раздел меню, а не только вкладка в клиенте;
- у объекта своя лента: все сметы, работы, визиты, фото, гарантии;
- у одного объекта может быть сколько угодно открытых смет и работ, в том числе одновременно; связь Property 1 → N Estimate / Job без ограничений.

### Lead — обращение, ещё не ставшее работой
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| status | см. §9 | да | |
| source_id | → LeadSource | да | Откуда пришёл |
| source_ref | text | нет | Внешний id (Thumbtack lead id, Angi id) |
| customer_id, property_id | → | нет | Привязываются при квалификации (лид может быть до клиента) |
| contact_name, phone, email, address_text | text | | Сырые данные из обращения |
| service_requested | text + → ServiceCategory | | «Seamless gutters 2 story» |
| cost_cents | int | нет | Сколько стоил этот лид (Thumbtack списал $45) |
| first_response_at | timestamp | | Для метрики скорости ответа |
| assigned_to | → User | | |
| lost_reason | enum + текст | при `lost` | Цена, не дозвонились, выбрал другого… |
| utm, landing_page, gclid | json | | Атрибуция рекламы |

### LeadSource — канал
| Поле | Тип | Описание |
|---|---|---|
| name | text | Google LSA, Google Ads, Thumbtack, Yelp, Angi, Nextdoor, Сарафан, Сайт, Портал, Повторный клиент, Реферал |
| kind | `paid_per_lead`, `paid_ads`, `organic`, `referral`, `repeat` | |
| is_system | bool | Системные нельзя удалить |

### MarketingSpend — расходы на канал
`source_id`, `period_start`, `period_end`, `amount_cents`, `note`. Сумма затрат за период, по которой считается стоимость лида и окупаемость (ROI).

### Activity (лента событий)
Всё, что произошло с клиентом, объектом, лидом или работой: звонок, SMS, письмо, заметка, смена статуса, открытие сметы клиентом, оплата. Поля: `subject_type`, `subject_id`, `kind`, `payload json`, `actor` (user / customer / system / ai).

### Task — задача или напоминание
`title`, `due_at`, `assigned_to`, `subject_type/id`, `status (open/done/cancelled)`, `source (manual/automation/ai)`.

---

## 3. Каталог, поставщики, движок смет

### CatalogItem — позиция каталога
| Поле | Тип | Описание |
|---|---|---|
| kind | `service`, `material`, `labor`, `fee`, `discount` | |
| name, description | text | Как увидит клиент |
| sku | text | Внутренний артикул |
| unit | `LF`, `SF`, `SQ` (кровельный сквер), `ea`, `hr`, `day`, `flat` | |
| unit_price_cents | int | Цена клиенту |
| unit_cost_cents | int | Себестоимость (скрыта от tech) |
| taxable | bool | |
| category_id | → ServiceCategory | |
| supplier_item_id | → SupplierItem | Откуда берётся материал |
| module | `core`, `gutters`, `roofing`… | Какой модуль поставил позицию |
| attributes | json | Профиль 5″/6″, толщина .027/.032, цвет |

### Assembly — сборка (правило расчёта)
Именованный набор формул: из входных параметров получаются позиции.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «Seamless gutter 6″ install» |
| module | text | gutters / roofing / core |
| inputs | json-schema | Какие параметры нужны: `gutter_lf_by_story`, `downspouts[]`, `miters_in`, `miters_out`, `end_caps`, `guards`, `tear_off` |
| components | ← AssemblyComponent[] | |

### AssemblyComponent
`catalog_item_id`, `quantity_formula` (безопасное выражение, например `ceil(gutter_lf / hanger_spacing_ft)`), `condition` (например `guards == true`), `client_visible` (видна клиенту или только во внутреннем BOM), `group` (раздел сметы). Формулы вычисляются **детерминированно** одним движком на телефоне и на сервере. AI формулы не вычисляет и цены не придумывает.

### Supplier — поставщик
`name`, `contact`, `email_for_orders`, `phone`, `account_number`, `branches[]`, `delivery_notes`.

### SupplierItem — позиция в прайсе поставщика
`supplier_id`, `supplier_sku`, `name`, `unit`, `cost_cents`, `pack_size`, `valid_from`, `source_import_id`.

### PriceListImport — загрузка прайса (AI-скан)
`supplier_id`, `file_id`, `status (uploaded → parsing → review → applied / failed)`, `parsed_rows json`, `confidence`. Пользователь проверяет распознанные строки перед применением.

---

## 4. Замеры и сметы

### Drawing — чертёж на объекте (модуль Gutters, позже Roofing)
| Поле | Тип | Описание |
|---|---|---|
| property_id | → Property | Чертёж живёт на объекте и переиспользуется |
| base_image | → File | Спутниковый снимок или своё фото |
| image_source | `satellite_google`, `satellite_mapbox`, `upload` | |
| scale_ft_per_px | numeric | Из спутника автоматически или по калибровке «эта линия = 20 ft» |
| geo_bounds | json | Привязка снимка к координатам |
| version | int | Чертёж версионируется вместе со сметой |

### DrawingRun — линия гаттера
`drawing_id`, `points[] (x,y)`, `length_ft` (вычисленная, можно переопределить рулеткой: `length_override_ft`), `story`, `profile` (K5, K6, HR5, HR6, box7), `material`, `gauge`, `color`, `guards bool`, `tear_off bool`.

### DrawingPoint — точка на чертеже
`drawing_id`, `kind` (`downspout`, `end_cap_left`, `end_cap_right`, `outlet`, `miter_inside`, `miter_outside`, `fascia_repair`, `tile_hanger_zone`, `note`), `x, y`, `run_id`, `attributes` (для downspout: высота, размер 2×3/3×4, отвод).
Углы вычисляются автоматически по поворотам линий, пользователь может их поправить.

### Estimate — смета (контейнер)
| Поле | Тип | Обяз. | Описание |
|---|---|---|---|
| number | text | да | EST-0148 |
| customer_id, property_id | → | да | |
| lead_id | → Lead | нет | Для воронки и ROI |
| status | см. §9 | да | |
| current_version_id | → EstimateVersion | да | |
| sent_version_id | → EstimateVersion | нет | Что видит клиент |
| expires_at | date | нет | |
| owner_user_id | → User | | Продавец (для комиссии) |
| viewed_count, last_viewed_at | вычисляемые | | «Открыл 3 раза» |

### EstimateVersion — версия сметы
Отправленная версия **не редактируется**. Любое изменение создаёт новую версию.
| Поле | Тип | Описание |
|---|---|---|
| estimate_id | → Estimate | |
| version_no | int | 1, 2, 3 |
| drawing_id + drawing_version | → | Из какого чертежа посчитано |
| intro_text, scope_text, terms_text, exclusions_text | text | |
| deposit_rule | json | % или сумма, когда вносится |
| totals | json, вычисляемое | По каждому варианту: subtotal, tax, total, cost, margin |
| created_by_ai_action_id | → AiAction | нет | Если создана помощником |

### EstimateOption — вариант (Good / Better / Best)
`version_id`, `name`, `position`, `is_recommended`, `description`, `financing_monthly_cents` (расчёт «от $X/мес»). Смета может иметь один вариант (без G/B/B).

### EstimateLineItem — позиция сметы
| Поле | Тип | Описание |
|---|---|---|
| option_id | → EstimateOption | |
| position | int | Порядок (drag & drop) |
| group | text | Раздел: Removal, Gutters, Downspouts, Guards… |
| catalog_item_id | → CatalogItem | нет (можно свободную строку) |
| assembly_id | → Assembly | Если строка пришла из сборки |
| name, description | text | |
| quantity | numeric | |
| unit | enum | |
| unit_price_cents, unit_cost_cents | int | Цена копируется в момент добавления (снимок), чтобы изменение каталога не меняло старые сметы |
| taxable | bool | |
| is_optional | bool | Клиент может отметить сам (add-on) |
| client_visible | bool | Внутренние строки (BOM) не видны клиенту |
| line_total_cents | int, вычисляемое | `round(quantity × unit_price)` |

### EstimateApproval — решение клиента
`version_id`, `option_id` (выбранный вариант), `selected_optional_items[]`, `signer_name`, `signature_file_id`, `signed_at`, `ip`, `user_agent`, `channel (portal / in_person / ai_recorded)`, `deposit_payment_id`.

### ChangeOrder — доп. работы во время выполнения
`job_id`, `number`, `reason`, `lines[]` (как LineItem), `status (draft → sent → approved / declined)`, `approval` (как EstimateApproval), `amount_cents`. После одобрения добавляется к инвойсу работы.

---

## 5. Работы и расписание

### Job — работа (что делаем на объекте)
| Поле | Тип | Описание |
|---|---|---|
| number | text | JOB-0210 |
| customer_id, property_id | → | |
| estimate_id, approved_version_id, option_id | → | Из какой сметы (создаётся без повторного ввода) |
| status | см. §9 | |
| type | `install`, `repair`, `cleaning`, `inspection`, `warranty` | |
| recurring_plan_id | → RecurringPlan | Если работа по графику |
| planned_cost_cents, actual_cost_cents | int, вычисляемые | Job costing |
| checklist_template_id | → | |

### Visit — выезд (конкретное время в календаре)
Работа может требовать нескольких выездов (осмотр, монтаж, доделка).
`job_id` (или `lead_id` для осмотра), `starts_at`, `ends_at`, `assigned_users[]`, `crew_id`, `status (scheduled → en_route → on_site → completed / cancelled / no_show)`, `arrival_window`, `customer_notified_at`, `notes`.

### RecurringPlan — повторяющиеся работы
`customer_id`, `property_id`, `service template` (позиции и цена), `rrule` (RFC 5545: «раз в 6 месяцев, в октябре и апреле»), `starts_on`, `ends_on`, `generate_ahead_days` (на сколько вперёд создавать визиты), `auto_invoice bool`, `billing (per_visit / prepaid / membership)`, `status (active / paused / ended)`.

### Crew — бригада
`name`, `members[] → User`, `color`.

### ChecklistTemplate / ChecklistResponse
Шаблоны («Перед монтажом», «Сдача работы») и ответы на объекте с фото.

### Subcontractor — субподрядчик (обязателен в MVP)
**Решение основателя:** субподрядчики нужны обязательно.
| Поле | Тип | Описание |
|---|---|---|
| kind | `company` / `individual` | |
| name, contact_name, phone, email | text | |
| trades | text[] | gutters, roofing, electrical, painting… |
| license_number, license_expires_on | text, date | |
| insurance_coi_file_id, insurance_expires_on | → File, date | Сертификат страховки (COI). Предупреждение, если истекает |
| w9_file_id | → File | Для 1099 в конце года |
| default_pay_type | `fixed_per_job`, `per_unit` (за LF), `hourly`, `percent_of_job` | |
| default_rate | int (центы или bp) | |
| user_id | → User, нет | Если у субподрядчика есть вход в Octo (роль `subcontractor`, видит только свои работы, без цен клиента) |
| status | `active`, `inactive`, `blocked` | |

### SubcontractorAssignment — назначение субподрядчика на работу или визит
`job_id`, `visit_id?`, `subcontractor_id`, `scope_text`, `pay_type`, `agreed_amount_cents` (или формула от LF), `status (offered → accepted / declined → in_progress → completed → approved_for_payment → paid)`, `work_order_file_id` (PDF наряда без цен клиента), `photos`, `completed_at`.
- Субподрядчику без входа в Octo наряд уходит по защищённой ссылке: принять, отметить «готово», загрузить фото.
- Сумма назначения попадает в **себестоимость работы** (job costing) как прямые затраты.

### SubcontractorPayment
`subcontractor_id`, `assignment_ids[]`, `amount_cents`, `method (check / ach / zelle / cash)`, `paid_at`, `note`. Итог за год нужен для 1099-NEC.

### TimeEntry
`user_id`, `job_id`, `visit_id`, `started_at`, `ended_at`, `kind (travel / work)`. Для фактических трудозатрат.

---

## 6. Деньги

### Invoice — счёт
| Поле | Тип | Описание |
|---|---|---|
| number | text | INV-0093 |
| customer_id, job_id | → | |
| kind | `deposit`, `progress`, `final`, `standalone`, `recurring` | |
| status | см. §9 (статус документа) | |
| payment_status | `unpaid`, `partially_paid`, `paid`, `refunded` (вычисляемый из платежей) | Отдельно от статуса документа |
| due_date | date | |
| lines | ← InvoiceLineItem[] | Как LineItem сметы |
| totals | subtotal, tax, total, paid, balance | |

### Payment — платёж
| Поле | Тип | Описание |
|---|---|---|
| invoice_id | → Invoice | нет (может быть депозит до инвойса) |
| customer_id | → | |
| method | `card`, `ach`, `tap_to_pay`, `cash`, `check`, `zelle`, `financing`, `other` | |
| amount_cents | int | |
| fee_cents | int | Комиссия процессора |
| platform_fee_cents | int | Наша прозрачная наценка |
| status | см. §9 | |
| stripe_payment_intent_id | text | |
| idempotency_key | text, unique | Защита от двойного списания |
| received_by | → User | Для наличных и чеков |

### Refund
`payment_id`, `amount_cents`, `reason`, `status`, `approved_by` (только owner/admin).

### Expense — расход
| Поле | Тип | Описание |
|---|---|---|
| date | date | |
| vendor | text | Home Depot, ABC Supply |
| amount_cents, tax_cents | int | |
| category | `materials`, `fuel`, `tools`, `dump_fee`, `subcontractor`, `marketing`, `other` | |
| job_id, customer_id | → | нет | «Это на Петра Ивановича» |
| receipt_file_id | → File | |
| ocr_data | json | Что распознал AI (магазин, сумма, позиции) |
| billable | bool + markup_pct | Перевыставить клиенту с наценкой |
| paid_by | `company_card`, `cash`, `employee_reimburse` | |

### TaxRate — ставка налога (настраивается вручную)
**Решение основателя:** налог **не считается автоматически**. Это настраиваемое поле, которое пользователь сам применяет или убирает.
| Поле | Тип | Описание |
|---|---|---|
| name | text | «LA County 9.5%», «Materials only» |
| rate_bp | int | Ставка в базисных пунктах (950 = 9.50%) |
| is_default | bool | Подставляется в новые документы, если в настройках включено «налог по умолчанию» |
| active | bool | |

Как применяется:
- на уровне **документа** (смета, вариант, инвойс, change order): переключатель «Налог вкл/выкл» и выбор ставки `tax_rate_id`;
- на уровне **позиции**: флажок `taxable` (например, облагать только материалы, не работу);
- `tax_cents = round(Σ line_total(taxable) × rate)`, считается только если налог включён на документе;
- в инвойсе налог можно изменить, пока он `draft`; после отправки только через новую версию или void;
- в настройках компании: «налог по умолчанию: выкл / вкл со ставкой X» и «что облагается по умолчанию: всё / только материалы».

### PurchaseOrder — заказ поставщику
`number (PO-0031)`, `supplier_id`, `job_id`, `lines[]` (supplier_sku, qty, unit, cost), `status (draft → sent → confirmed → received / cancelled)`, `sent_via (email / pdf)`, `delivery_date`, `delivery_address`. Генерируется из BOM одобренной сметы.

---

## 7. Клиентский портал и публичная страница

### PublicProfile — витрина компании (SEO-страница)
`company_id`, `headline`, `about`, `services[]`, `service_areas[]` (города и ZIP LA), `gallery[] → File`, `reviews_display`, `license_badge`, `cta_settings`, `seo (title, description, schema.org LocalBusiness)`.

### PortalAccess — защищённая ссылка клиента
`customer_id`, `token_hash` (сам токен в базе не хранится), `scope` (все документы клиента или один документ), `expires_at`, `last_opened_at`, `revoked_at`. Ссылка открывает смету, инвойс, оплату, историю и запись.

### AvailabilityRule / BookingRequest — онлайн-запись
`AvailabilityRule`: дни недели, часы, длительность осмотра, буфер, зоны (ZIP), какие сотрудники.
`BookingRequest`: `service`, `slot`, `contact`, `address`, `status (requested → confirmed / declined)`. Создаёт Lead с источником «Портал» или «Сайт».

### ReviewRequest и Referral
`ReviewRequest`: `job_id`, `channel`, `sent_at`, `clicked_at`, `platform (google / yelp)`. Запрос уходит **всем** клиентам, без фильтра недовольных (правила FTC и Google).
`Referral`: `referrer_customer_id`, `code`, `new_lead_id`, `reward (cents / gift)`, `status`.

---

## 8. Коммуникации, AI, платформа

### MessageThread / Message
Переписка с клиентом: `channel (sms / email / portal)`, `direction`, `body`, `status (queued → sent → delivered / failed)`, `provider_id`. Без сети сообщение ставится в очередь (outbox).

### AiAction — действие помощника (сердце безопасного AI)
| Поле | Тип | Описание |
|---|---|---|
| user_id | → User | Кто дал команду |
| input | text / audio / image ref | «Удали позицию 4…» |
| intent | text | `estimate.update_lines`, `expense.create`… |
| proposed_changes | json (diff) | Что изменится: было → стало |
| status | `proposed → confirmed → applied` / `cancelled` / `failed` / `undone` | |
| requires_confirmation | bool | Деньги, отправка клиенту и удаление всегда требуют подтверждения |
| undo_payload | json | Как откатить |
| tokens_in, tokens_out, cost_cents, model | | Учёт расходов и лимитов |

Помощник вызывает те же операции API с правами пользователя. Тексты из документов и сообщений клиентов для него только данные, а не команды.

### Entitlement / UsageCounter — тарифы и лимиты
`Entitlement`: `company_id`, `plan (starter / pro)`, `modules[] (gutters, roofing)`, `seats`, `limits (ai_actions, sms_segments)`, `billing_source (stripe / app_store)`.
`UsageCounter`: `company_id`, `period`, `ai_actions_used`, `sms_segments_used`, `ai_cost_cents`.

### File
`storage_key`, `mime`, `size`, `kind (photo / receipt / signature / drawing / document)`, `subject_type/id`, `taken_at`, `geo`, `uploaded_offline bool`.

### AuditLog
`actor_type (user / ai / system / customer)`, `actor_id`, `on_behalf_of_user_id` (для AI), `entity_type`, `entity_id`, `action`, `before json`, `after json`, `ip`, `at`.

### StatusEvent
`entity_type`, `entity_id`, `from_status`, `to_status`, `actor`, `reason`, `at`.

### ExternalRef / Integration
Связь с внешними системами: `provider (thumbtack, angi, google_lsa, stripe, quickbooks)`, `external_id`, `entity`. Ключи интеграций хранятся в менеджере секретов, а не в базе в открытом виде.

---

## 9. Статусы и переходы (state machines)

### Lead
```
new → contacted → qualified → inspection_scheduled → estimate_sent → won
  ↘ lost (из любого, с причиной)        ↘ archived
```
- `won` ставится автоматически, когда смета по лиду одобрена.
- `first_response_at` фиксируется на первом исходящем контакте.

### Estimate
```
draft → sent → viewed → approved
          ↘ declined   ↘ expired
draft/sent/viewed → revised (новая версия, снова draft)
```
- `approved` → **идемпотентно** создаётся Job (+ депозитный инвойс, если есть правило депозита), PO-черновики из BOM, задача «запланировать».
- После `approved` смета не редактируется. Изменения оформляются через ChangeOrder.

### Job
```
draft → scheduled → in_progress → completed → closed
            ↘ on_hold ↗        ↘ cancelled
```
- `completed` → предложить финальный инвойс, запрос отзыва после оплаты.
- `closed` = инвойс оплачен и всё задокументировано.

### Visit
`scheduled → en_route → on_site → completed` / `cancelled` / `no_show`
- `en_route` → клиенту SMS «мы в пути» (если включено).

### Invoice (статус документа)
`draft → sent → void`. Оплата ведётся отдельно в `payment_status`: `unpaid → partially_paid → paid`, а также `overdue` (вычисляемый по `due_date`) и `refunded`.

### Payment
`pending → succeeded` / `failed`; `succeeded → partially_refunded → refunded`.

### PurchaseOrder
`draft → sent → confirmed → received` / `cancelled`.

### AiAction
`proposed → confirmed → applied → (undone)`; `proposed → cancelled`; любой → `failed`.

---

## 10. Связи (ERD)

```mermaid
erDiagram
  User ||--o{ Membership : has
  Company ||--o{ Membership : has
  CompanyGroup ||--o{ Company : groups
  Company ||--o{ Customer : owns
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
  Estimate }o--|| Property : at
  Estimate ||--o{ EstimateVersion : versions
  EstimateVersion ||--o{ EstimateOption : options
  EstimateOption ||--o{ EstimateLineItem : lines
  EstimateVersion ||--o| EstimateApproval : approved_by
  Estimate ||--o| Job : creates
  Job ||--o{ Visit : scheduled_as
  Job ||--o{ ChangeOrder : has
  Job ||--o{ Invoice : billed_by
  Invoice ||--o{ Payment : paid_by
  Job ||--o{ Expense : costs
  Job ||--o{ PurchaseOrder : orders
  PurchaseOrder }o--|| Supplier : to
  Supplier ||--o{ SupplierItem : sells
  CatalogItem }o--o| SupplierItem : sourced_from
  Assembly ||--o{ AssemblyComponent : has
  AssemblyComponent }o--|| CatalogItem : uses
  RecurringPlan ||--o{ Job : generates
  User ||--o{ AiAction : commands
```

---

## 11. Офлайн: что хранится на телефоне

| Данные | Офлайн |
|---|---|
| Клиенты, объекты, контакты (компании пользователя) | чтение и правка |
| Работы и визиты на 14 дней вперёд | чтение и правка статусов |
| Каталог, сборки, формулы | чтение (движок смет работает на телефоне) |
| Чертежи и сметы | создание и правка черновиков |
| Фото, подписи, чеки | создание, загрузка при появлении сети |
| Отправка клиенту, оплата картой, AI-помощник | требуют сети (ставятся в очередь или недоступны) |

Конфликты: поля без конфликта сливаются автоматически. Документы с деньгами (отправленные сметы, инвойсы, платежи) меняются только на сервере. При конфликте в черновике показываем обе версии и предлагаем выбрать.

---

## 12. Открытые вопросы
1. ✅ Налог: ручной, настраиваемый (TaxRate + переключатель на документе + `taxable` на позиции). Какую ставку и базу использовать, решает пользователь со своим бухгалтером.
2. ✅ Субподрядчики: нужны в MVP (Subcontractor, SubcontractorAssignment, SubcontractorPayment).
3. ✅ Несколько объектов у клиента и несколько работ на объекте: часто. «Объекты» — отдельный раздел.
4. Финансирование: какие данные хранить у нас, а какие только у Wisetack.
