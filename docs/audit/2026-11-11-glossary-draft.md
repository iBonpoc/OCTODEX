# Словарь OCTODEX / GoRix — ЧЕРНОВИК (11.11.2026)

Статус: черновик редактора для основателя. Ничего в репозитории не менялось. Числа «вхождений» — число ключей i18n, где слово встречается в значении (RU `ru.ts`, EN `en.ts`, ES `es.ts`, ≈3356 ключей), по скрипту `scratchpad/glossary/d.pkl`; «≈» — грубый подсчёт регулярным выражением (в нём могут быть ложные совпадения). Метка **[решено]** — решение основателя, не менять. Метка **[?]** — не уверен в ходовом слове, проверит основатель. Метка **[Q#]** — вопрос из конца файла.

12.11.2026: добавлены термины редактора сметы и карточки позиции каталога (спецификация docs/audit/2026-11-12-estimate-editor-spec.md, DESIGN-SYSTEM 1.4.0): 1.61–1.75, 3.64–3.80, 6.37–6.48, 10.18–10.19, 12.16–12.33; вопросы Q26–Q34. Уже были и не дублируются: Поставщик (1.39), Направление работ (1.51), Позиция сметы / Позиция каталога (1.13, 1.14), Налог (6.3), Подытог (6.1), Цена (6.31), Выручка (6.27), Показать/Скрыть (3.32), История (13.20).

## 0. Принципы (коротко)

1. Одно понятие = одно слово на языке. Синонимы запрещены, даже «красивые».
2. Кнопка = глагол + объект («Создать смету»). Одиночный глагол — только когда объект очевиден из экрана («Сохранить»).
3. Глагол кнопки — из раздела 3. Существительные и статусы — из разделов 1–2. Строки в базовой форме; род и падеж подставляет строка.
4. RU — «вы», нет «ты»; ES — «usted» (сейчас ≈14 строк в «tú»: `acct.gone.*`, `vf.techsHint`, `pref7b.*`…); EN — «you», без «please» кроме клиентских текстов.
5. Язык интерфейса ≠ язык клиента (правило 7 CLAUDE.md). Раздел 14 — отдельно.
6. Рынок США: ES — американский испанский (мексиканский/центральноамериканский узус), не кастильский («ordenador», «móvil», «vale» — нельзя).
7. Цвет слов: статус — всегда значок + слово; слово статуса одно и то же в карточке, фильтре и истории (раздел 2).

---

## 1. Объекты

Колонки: № | Понятие | RU | EN | ES | Нельзя (вхождения) | Примеры ключей

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 1.1 | Обращение, ещё не клиент | Лид **[решено]** | Lead | Prospecto | RU: «заявка» там, где это лид (≈30 ключей; оставить «Заявка» только в форме клиента); ES: «lead» (23), «cliente potencial» (9), «Nuevo prospecto» OK | `nav.leads`, `lead.card`, `link.new` |
| 1.2 | То же, как его видит клиент в форме | Заявка **[решено]** | Request | Solicitud | EN «quote» (2: `intake.title`) | `intake.title` |
| 1.3 | Тот, кто платит | Клиент **[решено]** | Client **[решено]** | Cliente | EN «Customer» (12: `visit.signHere`, `visit.signConsent`, `visit.completedHint`, `visit.etaSent`, `help.inbox`, `lead.message`, `est.pdf.customer`, `legal.*`), RU «заказчик» (0) | `client.card`, `visit.signHere` |
| 1.4 | Потенциальный клиент (статус клиента) | Потенциальный | Prospect | Potencial | RU «Лид» для статуса клиента | `client.st.prospect`, `clients.f.prospect` |
| 1.5 | Человек при клиенте (супруг, арендатор…) | Контакт **[решено: «Контакты клиента»]** | Contact | Contacto | RU «Люди», «человек» (≈29 ключей: `person.saved` «Люди сохранены», `co.addPerson`, `prop.people`, `src.kind.person`) | `person.*`, `co.step.contacts` |
| 1.6 | Адрес, где делается работа | Объект | Property | Propiedad | RU «Адрес» как имя сущности; ES «Inmueble» | `prop.card`, `nav.search.g.properties` |
| 1.7 | Выезд (любой визит мастера) | Выезд | Visit | Visita | RU «визит» (9: `prop.h.visit`, `prop.nextVisit`), «осмотр» как общее слово | `visits.title`, `prop.row.visits` |
| 1.8 | Выезд на оценку **[решено]** | Выезд на оценку | Estimate visit | Visita de presupuesto | RU «Осмотр» (≈32 ключа; `st.inspection`, `vf.addInspection`, `visitP2.*`, `plan.kind.inspection`), RU «Оценка» (`st.booked`), EN «Inspection» (5), ES «Evaluación» (15), ES «visita de estimado» | `st.inspection`, `st.booked`, `vf.msg.inspection` |
| 1.9 | Работа (проект у клиента на объекте) | Работа | Job | Trabajo | RU «Проект» (1), «Заказ» (18 — это заказ поставщику, не путать); EN «Work» как сущность (49 вхождений слова, часть — глагол); ES «Obra» (22) | `job.card`, `nav.jobs` |
| 1.10 | Смета **[решено]** | Смета | Estimate | Presupuesto | EN «Quote»/«Proposal»; ES «Estimado» (16), «Cotización»; RU «Оценка» вместо сметы | `nav.estimates`, `portal.estimate` |
| 1.11 | Вариант сметы (Good/Better/Best) | Вариант | Option | Opción | RU «Пакет», «Тариф» | `portal.choose`, `EstimateOption` |
| 1.12 | Необязательное в смете | Доп. опция | Optional extra | Extra opcional | EN «Add-on» (в `att.rejected.module` путано с модулем); RU «Дополнительно» без объекта | `portal.addons` |
| 1.13 | Строка сметы **[решено]** | Позиция сметы | Line item | Partida | RU «Строка» (`photo.delete`/`ue.lines…`, `job5.lines`), «Пункт» (чек-лист — другое), EN «Item»/«Line»/«Position» (≈81 вхождение слов), ES «Artículo», «Renglón» | `job5.lines.*`, `est.line*` |
| 1.14 | Позиция каталога | Позиция каталога | Catalog item | Artículo del catálogo | RU «Товар» | `cat.item`, `cat.new` |
| 1.15 | Счёт клиенту | Счёт | Invoice | Factura | ES «Cuenta» (путает с account, 37 вхождений слова «cuenta» в основном «аккаунт»); RU «Инвойс» | `nav.invoices`, `inv.title` |
| 1.16 | Выставленный на этап | Счёт на этап | Progress invoice | Factura por etapa | RU «Оплата этапа» (`inv.kind.progress`) — смешивает счёт и оплату | `inv.kind.*` |
| 1.17 | Оплата (деньги получены) | Оплата | Payment | Pago | RU «Платёж» (6; оставить только «Платёж без счёта» — решить [Q9]) | `nav.search.g.payments`, `pay.*` |
| 1.18 | Документ об оплате **[решено]** | Квитанция | Receipt | Recibo | RU «Чек» для квитанции (путает с check); EN «Check» для квитанции | `rcpt.title` |
| 1.19 | Бумажный чек (способ оплаты) **[решено]** | Чек | Check | Cheque | RU «Чек» для расхода («Расход по чеку» — переименовать) | `pay.check`, `visit.payCheck` |
| 1.20 | Возврат денег клиенту | Возврат | Refund | Reembolso | RU «Вернуть» глаголом тоже OK («Вернуть деньги»); ES «Devolución» | `mny.refund.*` |
| 1.21 | Трата компании | Расход | Expense | Gasto | RU «Трата» (6), «Расход по чеку» → «Расход с чеком» [Q10]; EN «Receipt expense» | `exp.*`, `money.expenses` |
| 1.22 | Задача/напоминание | Задача | Task | Tarea | RU «Дело», «Напоминание» как сущность (но `task.when` — срок) | `task.title` |
| 1.23 | Звонок | Звонок | Call | Llamada | — | `nav.calls` |
| 1.24 | SMS или письмо | Сообщение | Message | Mensaje | RU «Чат» (`tab.messages.short` «Чаты» — 1 ключ), ES «Chat» **[решено: Сообщения]** | `nav.messages`, `tab.messages.short` |
| 1.25 | SMS | SMS | Text message (в UI «SMS») | SMS | EN «Text» без «message»; ES «mensaje de texto» длинно | `nav.comms.sms` |
| 1.26 | Электронное письмо | Письмо | Email | Correo | RU «Почта» для письма; ES «Email» (сейчас смесь: `person.email` «Email») [Q18] | `nav.comms.email` |
| 1.27 | Заметка | Заметка | Note | Nota | RU «Примечание» (`po.pdf.note`) | `notes.*`, `src.note` |
| 1.28 | Вложенный файл/документ | Файл | File | Archivo | RU «Документ» для файла (документ = смета/счёт/договор) | `client.tab.files` |
| 1.29 | Фото | Фото | Photo | Foto | — | `toast.photo` |
| 1.30 | Фото до/после | Фото до / Фото после | Before / After photos | Antes / Después | RU «До работы» → «Фото до» | `visit.photosBefore` |
| 1.31 | Шаблон (сметы, чек-листа) | Шаблон | Template | Plantilla | RU «Образец» | `chk2.*`, `est.tpl.*` |
| 1.32 | Список пунктов для мастера | Чек-лист **[решено: чек ≠ check]** | Checklist | Lista de control | ES «Checklist», «Lista de verificación» — выбрать одно [Q11] | `visit.checklist` |
| 1.33 | Пункт чек-листа | Пункт | Checklist item | Punto | EN «Item» без уточнения | `check.add` |
| 1.34 | Каталог цен компании | Каталог | Catalog | Catálogo | RU «Прайс» для своего каталога; «Прайс» только для поставщика | `nav.catalog` |
| 1.35 | Услуга (вид позиции) | Услуга | Service | Servicio | — | `cat.kind.service` |
| 1.36 | Работа руками (вид позиции) | Работа (в каталоге: «Труд») [?] | Labor | Mano de obra | RU «Работа» путает с сущностью «Работа» — `cat.kind.labor` | `cat.kind.labor` [Q12] |
| 1.37 | Материал | Материал | Material | Material | — | `cat.kind.material` |
| 1.38 | Комплект позиций | Комплект | Kit | Kit | RU «Набор», «Сборка» | `cat.kind.kit` |
| 1.39 | Поставщик | Поставщик | Supplier | Proveedor | EN «Vendor» (`exp.vendor`, `card.filter.searchExpenses`); RU «Продавец» (4: `cat.vendor`), «Где купили» | `sup.*`, `exp.vendor` |
| 1.40 | Заказ поставщику | Заказ поставщику | Purchase order (PO) | Orden de compra | RU «Заказ» без «поставщику» в заголовках | `po.*` |
| 1.41 | Замер (модуль Gutters) | Замер | Measurement | Medición | EN «Measure» (`list.tab`, `measure`), ES «Medidas», «Medida» | `mod.gutters.list.*` |
| 1.42 | Чертёж на холсте | Чертёж | Drawing | Dibujo | RU «Рисунок» (`draw.notSaved`, `draw.fit`), ES «Plano» (`pdf.title`) | `mod.gutters.draw.*` |
| 1.43 | Отчёт | Отчёт | Report | Informe | — | `rpt.title` |
| 1.44 | Уведомление в приложении | Уведомление | Notification | Notificación | EN «Notice» | `notice.title`, `nav.bell` |
| 1.45 | Push на телефон | Пуш-уведомление [?] | Push notification | Notificación push | RU «пуш» (сейчас нет) | `push.*` |
| 1.46 | Компания подрядчика | Компания | Company | Empresa | ES «Compañía» | `nav.companySettings` |
| 1.47 | Сотрудники компании | Команда | Team | Equipo | RU «Сотрудники» как раздел (7), «Бригада» (5) | `nav.team` |
| 1.48 | Бригада на объекте | Бригада | Crew | Cuadrilla [?] (сейчас «equipo») | — | `today.crew` |
| 1.49 | Роль | Роль | Role | Rol | — | `team.role` |
| 1.50 | Модуль (платное расширение направления) | Модуль | Module | Módulo | EN «Add-on» (в `att.rejected.module` — «Add-on changes»), RU «Дополнение» | `mod.*` |
| 1.51 | Направление работ **[решено]** | Направление работ | Trade | Especialidad | EN «Direction» (`rpt.cat.dir`), ES «Línea de trabajo» (`rpt.cat.*`), RU «Направление» без «работ» (3) | `trade.*`, `rpt.cat.title` |
| 1.52 | Метка | Метка | Tag | Etiqueta | — | `tag.*` |
| 1.53 | Источник лида | Источник | Source | Fuente | ES «Origen» (`card.filter.sources`) | `src.*` |
| 1.54 | Лицензия подрядчика | Лицензия | License | Licencia | — | `co.lic*` |
| 1.55 | Страховка | Страховка | Insurance | Seguro | — | `co.ins*` |
| 1.56 | Договор | Договор | Contract | Contrato | — | `inv.contract` |
| 1.57 | Допработы по ходу (change order) | Доп. работы [?] | Change order | Orden de cambio | — | `ChangeOrder` (этап 4) |
| 1.58 | Гарантия | Гарантия | Warranty | Garantía | — | модель данных |
| 1.59 | Дубль клиента, слияние | Дубль / Слить | Duplicate / Merge | Duplicado / Combinar | — | `clientDup.*` |
| 1.60 | Импорт клиентов из CSV | Импорт | Import | Importación | — | `client.import.*` |
| 1.61 | Раздел сметы (12.11) | Раздел | Section | Sección | RU «Группа», «Блок»; EN «Group» (кроме «Group by type»); не путать с «разделом» навигации (раздел 4) | `est.section.*` (спека редактора сметы Р4) |
| 1.62 | Подраздел сметы (один уровень) | Подраздел | Subsection | Subsección | — | `est.section.*` |
| 1.63 | Позиции вне разделов (в конце сметы; заголовок виден, если разделы есть) | Без раздела | Other items | Otras partidas | RU «Прочее», «Остальное» | `est.section.none` |
| 1.64 | Вид позиции (материал / работа / услуга) | Вид | Type | Tipo | RU «Категория» (это направление), «Тип» | `est.line.kind` [Q27] |
| 1.65 | Блок кнопок под списком позиций (термин документации, в интерфейсе слова нет) | Блок добавления | Add bar | Barra de agregar | — | DS §8.4 |
| 1.66 | Позиция, раскрытая в списке (термин документации) | Раскрытая позиция | Expanded line item | Partida expandida | — | DS §8.3 |
| 1.67 | Артикул поставщика | Артикул поставщика | Supplier SKU | SKU del proveedor | RU «Код поставщика», «Номер» | `cat.supplierSku` |
| 1.68 | Свой артикул компании | Свой артикул | Item code | Código propio | EN «SKU» без уточнения (SKU — у поставщика) [Q33] | `catalog_items.sku` |
| 1.69 | Штрих-код | Штрих-код | Barcode | Código de barras | RU «Баркод» | `cat.barcode` |
| 1.70 | Ссылка на страницу товара | Ссылка на товар | Product link | Enlace del producto | RU «URL», «Сайт» | `cat.productUrl` |
| 1.71 | Блок «Использование» карточки позиции | Использование | Usage | Uso | RU «Статистика» | `cat.usage` |
| 1.72 | Сколько раз позиция есть в сметах | В сметах | In estimates | En presupuestos | — | `cat.usage.estimates` |
| 1.73 | Продано штук | Продано | Sold | Vendido | — | `cat.usage.sold` |
| 1.74 | Закуплено штук | Куплено | Purchased | Comprado | RU «Закуплено» | `cat.usage.bought` |
| 1.75 | Скрытая от клиента позиция (метка) | Скрыта | Hidden | Oculta | — | `est.line.hidden` |

---

## 2. Статусы

Правило: статус = существительное/причастие в роде сущности. Слово в карточке = слово в фильтре (фильтр во множественном числе: «Отправленные»).

### 2.1 Лид

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.1 | new | Новый | New | Nuevo | — | `st.new` |
| 2.2 | replied | На связи | In touch | En contacto | — | `st.replied` |
| 2.3 | booked | Выезд на оценку | Estimate visit | Visita de presupuesto | RU «Оценка» (`st.booked`), ES «Visita» голое | `st.booked`, `st.inspection` |
| 2.4 | estimate_sent | Смета отправлена | Estimate sent | Presupuesto enviado | — | `lead.st.estimate` |
| 2.5 | won | Клиент | Client | Cliente | EN «Won» в фильтре (`lead.f.won`) при статусе «Client» — выбрать одно [Q15] | `lead.st.won`, `lead.f.won` |
| 2.6 | lost | Потерян | Lost | Perdido | — | `lead.st.lost` |
| 2.7 | declined | Отказ (мы отказались) [?] | Declined | Rechazado | RU «Отклонён» vs «Отказ» — два слова (`st.declined` «Отказ», `lead.st.declined` «Отклонён») | `lead.st.declined` |
| 2.8 | filter: открытые | В работе | Open | Abiertos | EN «Open» vs RU «В работе» (у работы это отдельный статус) — разное слово | `lead.f.open` |
| 2.9 | filter: без ответа | Без ответа | No reply | Sin respuesta | — | `lead.f.waiting`, `att.noReplyDays` |
| 2.10 | filter: закрытые | Закрытые | Closed | Cerrados | — | `lead.f.closed` |
| 2.11 | отложен | Отложен | Snoozed | Pospuesto | RU «Позже» кнопкой | `lead.f.snoozed`, `toast.later` |
| 2.12 | в архиве | В архиве | Archived | Archivado | — | `client.st.archived` |

### 2.2 Смета

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.13 | draft | Черновик | Draft | Borrador | — (везде одинаково — образец) | `st.draft`, `po.status.draft` |
| 2.14 | sent | Отправлена | Sent | Enviado/Enviada (по роду) | RU «Выслана» | `st.sent` |
| 2.15 | awaiting_countersign | Ждёт подписи компании [?] | Awaiting our signature | Pendiente de nuestra firma | EN «Awaiting signature» (`est.pdf.awaitingSignature`) без «чьей» | `est.pdf.awaitingSignature` [Q14] |
| 2.16 | approved | Подписана (клиентом) | Signed | Firmado/Firmada | RU «Одобрена» (`st.approved`) и «Подписано» (`st.signed`) — два слова на одно; EN «Approved» | `st.approved`, `st.signed`, `portal.approved` [Q14] |
| 2.17 | declined | Отклонена | Declined | Rechazada | RU «Отказ» | `st.declined` |
| 2.18 | expired | Просрочена [?] «Срок истёк» | Expired | Vencida | — | `est.portal.expired` |
| 2.19 | viewed (клиент открыл) | Открыта | Opened | Abierta | EN «Viewed» | `notice.viewedChip` |

### 2.3 Работа (Job)

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.20 | unscheduled | Ждёт даты **[решено: стиль «Ждёт…»]** | To schedule | Por programar | RU «Не запланирована» | `st.toSchedule` |
| 2.21 | scheduled | Запланирована | Scheduled | Programada | ES «Agendada» (`vf.inspectionSaved`) | `st.scheduled` |
| 2.22 | in_progress | Идёт работа | In progress | En curso | EN «Working» (`st.working` — это статус выезда, не работы) | `st.working` |
| 2.23 | done | Готово → «Выполнена» [?] | Done | Hecha/Completada | «Готово» одновременно кнопка и статус (15 ключей) | `st.done` [Q13] |
| 2.24 | on_hold | На паузе | On hold | En pausa | — | база |
| 2.25 | closed (закрыта, счета выставлены) | Закрыта | Closed | Cerrada | — | база |
| 2.26 | cancelled | Отменена | Cancelled | Cancelada | EN «Canceled» (1) vs «Cancelled» (20) — писать «Cancelled» [Q16]; ES «Cancelada»/«Cancelado» по роду | `st.cancelled` |

### 2.4 Выезд (Visit)

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.27 | scheduled | Запланирован | Scheduled | Programada | — | `st.scheduled` |
| 2.28 | en_route | В пути | On the way | En camino | EN «En route» (`st.en_route`) vs «On my way» (`step.en_route` — это кнопка мастера) | `st.en_route` |
| 2.29 | on_site | На месте | On site | En el lugar | — | `st.on_site` |
| 2.30 | working | Идёт работа | Working | Trabajando | — | `st.working` |
| 2.31 | signed | Подписано | Signed | Firmado | — | `st.signed` |
| 2.32 | paid | Оплачено | Paid | Pagado | — | `st.paid` |
| 2.33 | done | Выезд закрыт | Visit closed | Visita cerrada | RU «Готово» | `visit.completed` |
| 2.34 | cancelled | Отменён | Cancelled | Cancelada | — | `vc.done` |
| 2.35 | no_show | Клиента не было дома | Client not home | Cliente ausente | — | `vc.r.no_show` |
| 2.36 | unassigned | Не назначен | Unassigned | Sin asignar | EN «Not assigned» (`card.filter.nobody`) | `st.unassigned` |
| 2.37 | late | Опаздывает | Running late | Con retraso | — | `st.late`, `late.*` |

### 2.5 Счёт

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.38 | sent, нет оплат | Ждёт оплаты | Awaiting payment | Pendiente de pago | ES «Pendiente» голое (`money.awaiting`) | `st.awaiting`, `money.awaiting` |
| 2.39 | partially_paid | Оплачен частично | Partly paid | Pagada en parte | EN «Partial», RU «Частично» (`inv.partial`) | `card.st.partial`, `inv.partial` |
| 2.40 | paid | Оплачен | Paid | Pagada | — | `mny.f.paid` |
| 2.41 | overdue | Просрочен | Overdue | Vencida | ES «Atrasado» (`rpt.age`) | `st.overdue`, `money.overdue` |
| 2.42 | void | Аннулирован [?] | Void | Anulada | — | база |
| 2.43 | refunded | Возвращён | Refunded | Reembolsada | — | `mny.refund.*` |

### 2.6 Оплата

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.44 | succeeded | Получена | Received | Recibido | «Оплата получена» (`rcpt.received`) — единая фраза | `rcpt.received` |
| 2.45 | pending (ACH в пути) | В пути | In transit | En tránsito | RU «В обработке» (`pay.online.processing`) — выбрать одно [?] | `pay.online.processing` |
| 2.46 | failed | Не прошла | Failed | Fallida | — | `mny.*` |
| 2.47 | partially refunded | Частичный возврат | Partly refunded | Reembolso parcial | — | `card.refund*` |

### 2.7 Заказ поставщику

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.48 | draft | Черновик | Draft | Borrador | — | `po.status.draft` |
| 2.49 | sent | Отправлен | Sent | Enviado | — | `po.status.sent` |
| 2.50 | partially_received | Получен частично | Partly received | Recibido en parte | — | `po.status.partially_received` |
| 2.51 | received | Получен | Received | Recibido | — | `po.status.received` |
| 2.52 | cancelled | Отменён | Cancelled | Cancelado | — | `po.status.cancelled` |

### 2.8 Остальное

| № | Статус | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 2.53 | замер: черновик | Черновик | Draft | Borrador | — | `mod.gutters.list.draft` |
| 2.54 | замер: готов | Готов | Ready | Lista (по роду «Listo») | — | `mod.gutters.list.ready` |
| 2.55 | приглашение: ждёт | Приглашён | Invited | Invitado | EN «Pending» | `team.pending` |
| 2.56 | приглашение: принято | Принято | Accepted | Aceptada | — | база |
| 2.57 | приглашение: отозвано | Отозвано | Revoked | Revocada | RU «Отменить приглашение» (`team.revoke`) → «Отозвать приглашение» **[решено]** | `team.revoke` |
| 2.58 | приглашение: истекло | Ссылка истекла | Link expired | Enlace vencido | — | `team.expired` |
| 2.59 | сотрудник отключён | Отключён | Switched off → «Disabled» | Desactivado | EN «Switched off» (`team.disabled`), «Turned off» (`mod.st.disabled`) — выбрать «Turned off» [?] | `team.disabled`, `mod.st.disabled` |
| 2.60 | модуль: не подключён | Не подключён | Not on | No activado | — | `mod.st.off` |
| 2.61 | модуль: пробный | Пробный · осталось {n} дн. | Trial · {n} days left | Prueba · quedan {n} días | — | `mod.st.trial` |
| 2.62 | модуль: подключён | Подключён | On | Activado | RU «Подключён» vs EN «On» — слово разное по смыслу: [?] «Connected» | `mod.st.paid` |
| 2.63 | задача: открыта | Открыта | Open | Abierta | — | `w6.task.state.open` |
| 2.64 | задача: выполнена | Выполнена | Done | Hecha | RU «Готово» | `w6.task.state.done` |
| 2.65 | импорт | Импортируется / Импортирован / Отменён | Importing / Imported / Undone | Importando / Importado / Deshecho | — | `client.imports.*` |
| 2.66 | клиент: не обслуживаем | Не обслуживаем | Do not service | No atender | — | `client.st.doNotService` |
| 2.67 | синхронизация | Сохранено / Ждёт отправки / Не отправлено | Saved / Waiting to send / Not sent | Guardado / Pendiente de envío / Sin enviar | см. раздел 9 | `card.queued` |

---

## 3. Действия-кнопки

Шаблон: **Глагол + объект**. Подтверждение необратимого — кнопка повторяет глагол («Да, удалить» → «Удалить клиента»). Отмена в диалоге — «Не удалять» / «Назад», не «Отмена» (кроме системного «Отмена» в шторке: 1 ключ `common.cancel`).

| № | Действие | RU | EN | ES | Когда / чем отличается | Нельзя (вхождения) |
|---|---|---|---|---|---|---|
| 3.1 | Создать новую сущность с нуля | Создать | Create | Crear | сущность появляется впервые, открывается форма: «Создать смету», «Создать клиента» | RU «Новый X» заголовком окна — OK, кнопкой нет; EN «New X» кнопкой (32 ключа) |
| 3.2 | Добавить к существующему | Добавить | Add | Agregar | элемент в список внутри объекта: «Добавить позицию», «Добавить фото», «Добавить телефон» | ES «Añadir» (11) vs «Agregar» (18) — оставить «Agregar» [?]; EN «Add» OK (38) |
| 3.3 | Заголовок формы создания | Новый X | New X | Nuevo X | только заголовок экрана, не кнопка | RU «Новый лид» как кнопка (`quick.lead`) |
| 3.4 | Сохранить | Сохранить | Save | Guardar | записать изменения в форме; закрывает форму | RU «Записать» (8: `Записать оплату`, `Записать депозит`, `Записать расход`) — только для оплаты, см. 3.28 |
| 3.5 | Изменить | Изменить | Edit | Editar | открыть форму существующего | RU «Править» (1), «Редактировать» (0); EN «Change» (`sync.kind.other`) |
| 3.6 | Удалить | Удалить | Delete | Eliminar | запись пропадает **навсегда или с тостом «Вернуть»** (правило 5) | ES «Borrar» (3) vs «Eliminar» (17) — оставить «Eliminar»; «Quitar» не для данных |
| 3.7 | Убрать | Убрать | Remove | Quitar | убрать **из списка/связи**, сама запись остаётся: «Убрать телефон», «Убрать из комплекта», «Убрать фильтр» | RU «Удалить из каталога» (`cat.remove`) → «Убрать из каталога», если запись остаётся в архиве [?] |
| 3.8 | Архивировать | В архив | Archive | Archivar | скрыть из активных, можно вернуть; для клиента, лида, поставщика | RU «Закрыть» вместо архива; «Вернуть из архива» — обратное |
| 3.9 | Вернуть из архива | Вернуть из архива | Restore | Restaurar | обратное «в архив» | RU «Включить снова» |
| 3.10 | Вернуть действие **[решено]** | Вернуть | Undo | Deshacer | тост после действия, 5 с | RU «Отменить» для undo (`common.undo`) — переименовать; RU «Назад» в `draw.undo` и «Вперёд» для redo |
| 3.11 | Отменить сущность **[решено]** | Отменить | Cancel | Cancelar | только отмена выезда, заказа, приглашения-работы; сущность получает статус «Отменён/а» | RU «Отменить» для импорта (→ «Вернуть импорт»), для изменения в очереди (→ «Сбросить») |
| 3.12 | Закрыть окно без изменений | Закрыть | Close | Cerrar | шторка, диалог | RU «Отмена» (1), EN «Cancel» для закрытия шторки (`mod.gutters.attr.quickCancel`) |
| 3.13 | Отозвать доступ/ссылку **[решено]** | Отозвать | Revoke | Revocar | ссылку, приглашение, доступ | RU «Отменить приглашение», «Отключить ссылку»; ES «Cancelar invitación» |
| 3.14 | Сбросить **[решено]** | Сбросить | Discard / Reset | Descartar / Restablecer | «Discard»: выбросить несохранённое/неотправленное; «Reset»: вернуть настройки по умолчанию. Два EN слова — два понятия | RU «Очистить» для сброса (4), EN «Clear» (6) — «Clear» только для текстового поля/фильтра |
| 3.15 | Очистить поле/фильтр | Очистить | Clear | Borrar | поле поиска, подпись | см. 3.14 |
| 3.16 | Отправить клиенту | Отправить | Send | Enviar | любое исходящее; объект: «Отправить смету» | RU «Выслать»; «Отправить заявку» (в форме клиента) |
| 3.17 | Отправить снова | Отправить ещё раз | Send again | Enviar de nuevo | нет разницы между «Повторить» и этим: «Повторить» — для сбоя, «Отправить ещё раз» — для приглашения/письма | EN «Resend» |
| 3.18 | Повторить сбой | Повторить | Try again | Reintentar | после ошибки | RU «Попробовать снова»; ES «Inténtelo de nuevo» как кнопка |
| 3.19 | Поделиться | Поделиться | Share | Compartir | системное меню | — |
| 3.20 | Скопировать | Скопировать | Copy | Copiar | RU «Копировать» (2) → «Скопировать» | — |
| 3.21 | Подписать | Подписать | Sign | Firmar | подпись клиента/компании | «Расписаться» |
| 3.22 | Принять оплату | Принять оплату | Take payment | Cobrar | клиент платит сейчас; записывает оплату | RU «Записать оплату» (`visit.recordPayment`) — две кнопки на одно; EN «Record payment» (2); ES «Registrar pago» (2) |
| 3.23 | Выставить счёт | Выставить счёт | Issue invoice | Emitir factura | создаёт и фиксирует счёт | EN «Bill» (`inv.billBalance` «Bill the balance») |
| 3.24 | Напомнить об оплате | Напомнить | Remind | Recordar | клиенту; «Напомнить себе» — задача | — |
| 3.25 | Назначить | Назначить | Assign | Asignar | мастера на выезд | EN «Give» (`help.plan`) |
| 3.26 | Назначить выезд на оценку **[решено]** | Назначить выезд на оценку | Schedule an estimate visit | Programar visita de presupuesto | RU «Записать на оценку» (2 + `inbox.book` + `lead.next.book`), «Записать осмотр», EN «Book» (`inbox.book`, `plan.emptyBook`), ES «Agendar» | см. 1.8 |
| 3.27 | Запланировать работу | Запланировать | Schedule | Programar | выбрать дату/время | EN «Book» |
| 3.28 | Перенести | Перенести | Reschedule | Reprogramar | меняет дату/время того же выезда | RU «Перенести изменения в смету» (`est.update`) — другой смысл: → «Обновить смету» |
| 3.29 | Завершить выезд | Закрыть выезд | Close the visit | Cerrar la visita | после подписи и оплаты | RU «Завершить», «Готово» |
| 3.30 | Закрыть лид/работу | Закрыть лид | Close the lead | Cerrar el prospecto | = исход «потерян/отказ» | «Закрыть как потерянный» оставить |
| 3.31 | Открыть | Открыть | Open | Abrir | перейти к объекту | RU «Перейти» (`nav.goTo`) |
| 3.32 | Показать/Скрыть | Показать / Скрыть | Show / Hide | Mostrar / Ocultar | видимость списка/блока | RU «Показывать» (3) — для переключателей OK |
| 3.33 | Готово | Готово | Done | Listo | закрыть шторку-выбор, где изменения уже сохранены (фильтры) | не использовать как статус (2.23) и не вместо «Сохранить» (15 ключей; в фильтрах `fix.filters.done` — оставить) |
| 3.34 | Применить | Применить | Apply | Aplicar | подтвердить выбор параметров (фильтры, единицы) | вместо «Сохранить» там, где ничего не пишется в базу |
| 3.35 | Далее | Далее | Next | Siguiente | мастер, шаг вперёд | RU «Дальше: {step}» (visit.next) — оставить для мастера выезда |
| 3.36 | Назад | Назад | Back | Atrás | возврат на предыдущий экран | RU «Назад» как undo (`draw.undo`) |
| 3.37 | Пропустить | Пропустить | Skip | Omitir | шаг мастера | — |
| 3.38 | Не сейчас | Не сейчас | Not now | Ahora no | отложить предложение | RU «Позже» (`triage.later` — «Отложить», snooze) |
| 3.39 | Отложить | Отложить | Snooze | Posponer | лид/пункт на потом | — |
| 3.40 | Обновить | Обновить | Refresh | Actualizar | перечитать с сервера | «Обновить из замера» — оставить |
| 3.41 | Выбрать | Выбрать | Choose | Elegir | EN «Select» (`draw.select`) — «Select» только для выделения на холсте | ES «Seleccionar» |
| 3.42 | Искать | Искать | Search | Buscar | поле поиска | RU «Найти» (2) |
| 3.43 | Фильтры | Фильтры | Filters | Filtros | — | ES «Restablecer» в фильтрах → «Descartar»/«Limpiar» [?] |
| 3.44 | Импорт | Импортировать | Import | Importar | CSV, прайс | — |
| 3.45 | Экспорт | Выгрузить | Export | Exportar | CSV | RU «Скачать» для CSV |
| 3.46 | Скачать | Скачать | Download | Descargar | PDF, файл | — |
| 3.47 | Печать | Распечатать | Print | Imprimir | — | «Печатать в сметах» (флаг) → «Показывать в сметах и счетах» |
| 3.48 | PDF | PDF | PDF | PDF | «Скачать PDF», «PDF клиенту», «PDF бригаде» | — |
| 3.49 | Позвонить | Позвонить | Call | Llamar | — | — |
| 3.50 | Написать | Написать | Message | Escribir | SMS/письмо | EN «Text» |
| 3.51 | Проложить маршрут | Маршрут | Directions | Cómo llegar | EN «Navigate» (`visit.navigate`) | RU «Навигация» |
| 3.52 | Начать | Начать | Start | Iniciar | — | — |
| 3.53 | Продолжить | Продолжить | Continue | Continuar | — | — |
| 3.54 | Войти | Войти | Sign in | Iniciar sesión | ES «Entrar» | RU «Логин» |
| 3.55 | Выйти | Выйти | Sign out | Cerrar sesión | — | EN «Log out» |
| 3.56 | Пригласить | Пригласить | Invite | Invitar | — | — |
| 3.57 | Передать компанию | Передать | Hand over | Traspasar | — | — |
| 3.58 | Подключить модуль | Подключить | Turn on | Activar | EN «Connect» только для Stripe | — |
| 3.59 | Отключить | Отключить | Turn off | Desactivar | EN «Switch off» (`team.disable`) | — |
| 3.60 | Принять/Отклонить | Принять / Отклонить | Accept / Decline | Aceptar / Rechazar | лид из формы, условия | — |
| 3.61 | Сделать основным | Сделать основным | Make primary | Hacer principal | — | — |
| 3.62 | Привязать/Отвязать | Привязать / Отвязать | Link / Unlink | Vincular / Desvincular | замер к клиенту | — |
| 3.63 | Отметить выполненной | Отметить выполненной | Mark done | Marcar hecha | задача | «Выполнена» (статус) |
| 3.64 | Раскрыть / свернуть позицию или раздел | Раскрыть / Свернуть | Expand / Collapse | Expandir / Contraer | на месте, без окна | RU «Открыть» для раскрытия; EN «Open» |
| 3.65 | Добавить пустую позицию в смету | Новая позиция | New line item | Nueva partida | кнопка «Новый X» против 3.1/3.3 [Q31] | RU «Своя позиция» (это другое, см. 3.67) |
| 3.66 | Добавить позицию из каталога | Из каталога | From catalog | Del catálogo | — | RU «Выбрать из каталога» |
| 3.67 | Позиция, которой нет в каталоге (из поиска) | Своя позиция | Custom item | Partida propia | — | RU «Другая», «Ручная» |
| 3.68 | Разложить позиции по разделам-видам | Разложить по видам | Group by type | Agrupar por tipo | — | RU «Сортировать по видам» |
| 3.69 | Добавить раздел | ＋ Раздел | Add section | Agregar sección | ES «Añadir» | — |
| 3.70 | Добавить подраздел | Добавить подраздел | Add subsection | Agregar subsección | — | — |
| 3.71 | Заменить позицию другой из каталога | Заменить | Replace | Reemplazar | RU «Поменять»; ES «Cambiar» | — |
| 3.72 | Очистить позицию (строка пустеет) | Очистить позицию | Clear item | Limpiar partida | — | — |
| 3.73 | Дублировать позицию в смете | Дублировать | Duplicate | Duplicar | отличие от 3.20 «Скопировать» (текст, ссылка) — [Q28] | RU «Клонировать» |
| 3.74 | Переместить позицию или раздел | Переместить… | Move… | Mover… | RU «Перенести» | — |
| 3.75 | Скрыть позицию от клиента (только при цене $0) | Скрыть от клиента | Hide from client | Ocultar al cliente | RU «Спрятать» | — |
| 3.76 | Вернуть скрытую позицию | Показать клиенту | Show to client | Mostrar al cliente | — | — |
| 3.77 | Переименовать раздел | Переименовать | Rename | Cambiar nombre | — | — |
| 3.78 | Позиция сметы → в каталог | Сохранить в каталог | Save to catalog | Guardar en el catálogo | — | — |
| 3.79 | Перейти к позиции каталога | Открыть в каталоге | Open in catalog | Abrir en el catálogo | — | — |
| 3.80 | Подставить ставку из прошлой сметы (подсказка-кнопка) | Как в прошлой смете: {ставка} % | Same as last estimate: {rate}% | Igual que el presupuesto anterior: {tasa} % | — | — |

---

## 4. Разделы и навигация

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 4.1 | Главная | Главная | Home | Inicio | RU «Сегодня» как главная для офиса (`tab.today` — вкладка мастера) | `nav.home` |
| 4.2 | День мастера | Мой день | My day | Mi día | — | `tday.title` |
| 4.3 | Сегодня (обзор) | Сегодня | Today | Hoy | — | `tab.today` |
| 4.4 | Выезды (список) | Выезды | Visits | Visitas | RU «Мои выезды» — оставить только для мастера | `tab.visits` |
| 4.5 | Расписание **[решено?]** | План | Schedule | Agenda | EN «Plan» (`menu.planHint`: «Расписание бригады»), ES «Plan» (≈0) — сейчас RU «План», EN «Schedule», ES «Agenda» — всё же разное | `nav.plan`, `tab.plan` [Q8] |
| 4.6 | Клиенты | Клиенты | Clients | Clientes | — | `nav.clients` |
| 4.7 | Лиды | Лиды | Leads | Prospectos | — | `nav.leads` |
| 4.8 | Работы | Работы | Jobs | Trabajos | — | `nav.jobs` |
| 4.9 | Сметы | Сметы | Estimates | Presupuestos | — | `nav.estimates` |
| 4.10 | Счета | Счета | Invoices | Facturas | — | `nav.invoices` |
| 4.11 | Деньги | Деньги | Money | Dinero | RU «Деньги и счета» (`money.title`) | `nav.money` |
| 4.12 | Расходы | Расходы | Expenses | Gastos | — | `nav.expenses` |
| 4.13 | Каталог | Каталог | Catalog | Catálogo | — | `nav.catalog` |
| 4.14 | Звонки | Звонки | Calls | Llamadas | — | `nav.calls` |
| 4.15 | Сообщения **[решено]** | Сообщения | Messages | Mensajes | RU «Чаты» (`tab.messages.short`) | `nav.messages` |
| 4.16 | Уведомления | Уведомления | Notifications | Notificaciones | — | `nav.bell` |
| 4.17 | Входящие (новые заявки) | Входящие | Inbox | Entrada | ES «Bandeja de entrada» | `tab.inbox` |
| 4.18 | Разбор («требует внимания») | Требует внимания | Needs attention | Requiere atención | RU «Разбор» (`tab.triage`), EN «Triage», ES «Pendientes» | `tab.triage`, `att.*` [Q19] |
| 4.19 | Команда | Команда | Team | Equipo | — | `nav.team` |
| 4.20 | Настройки компании | Настройки компании | Company settings | Ajustes de la empresa | — | `nav.companySettings` |
| 4.21 | Настройки приложения | Настройки приложения | App settings | Ajustes de la app | RU «Настройки» голое (`settings.title`) | `nav.mySettings` |
| 4.22 | Меню / Ещё | Ещё | More | Más | RU «Меню» (1) на кнопке меню + «Ещё» на вкладке — два имени одного [Q20] | `tab.more`, `nav.menu` |
| 4.23 | Отчёты | Отчёты | Reports | Informes | — | `rpt.title` |
| 4.24 | История | История | History | Historial | — | `client.tab.history` |
| 4.25 | Обзор | Обзор | Overview | Resumen | — | `client.tab.overview` |
| 4.26 | Документы | Документы | Documents | Documentos | — | `client.tab.documents` |
| 4.27 | Файлы | Файлы | Files | Archivos | — | `client.tab.files` |
| 4.28 | Объекты клиента | Объекты | Properties | Propiedades | — | `client.tab.properties` |
| 4.29 | Замеры | Замеры | Measurements | Mediciones | EN «Measures» | `mod.gutters.list.tab` |
| 4.30 | Поставщики | Поставщики | Suppliers | Proveedores | — | `sup.*` |
| 4.31 | Заказы поставщикам | Заказы поставщикам | Purchase orders | Órdenes de compra | — | `po.*` |
| 4.32 | Источники лидов | Источники | Sources | Fuentes | — | `src.*` |
| 4.33 | Метки | Метки | Tags | Etiquetas | — | `tag.*` |
| 4.34 | Справка | Справка | Help | Ayuda | — | `common.help` |
| 4.35 | Профиль | Профиль и настройки | Profile and settings | Perfil y ajustes | — | `nav.profile` |
| 4.36 | Поиск | Искать везде | Search everything | Buscar en todo | — | `nav.search` |
| 4.37 | Стрелка «Где вы» | Где вы | Where you are | Dónde está | — | `nav.trail` |
| 4.38 | Юридические | Условия использования / Политика конфиденциальности | Terms of Service / Privacy Policy | Términos del servicio / Política de privacidad | — | `legal.*` |
| 4.39 | Модули | Модули | Modules | Módulos | — | `mod.*` |

---

## 5. Роли и люди

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 5.1 | Владелец **[решено]** | Владелец | Owner | Dueño | RU «Директор» (13: `role.director`, `est.countersign.noRight`, `team.help`, `schs.who`, `push.kind.signed.hint`, `fix.co.readOnly`…), EN «Director» (12), ES «Director» (12), «Propietario» (7 — это ещё и владелец дома) | `role.director` |
| 5.2 | Администратор | Администратор | Admin | Administrador | — | `team.role` |
| 5.3 | Диспетчер | Диспетчер | Dispatcher | Coordinador [?] (сейчас «despachador»/«dispatcher») | ES «Dispatcher» голое | `role.dispatcher` |
| 5.4 | Офис | Офис | Office | Oficina | — | `ue.role.office` |
| 5.5 | Мастер **[решено]** | Мастер | Technician | Técnico | EN «Tech» (1: `sch.tech`), RU «Монтажник» (0), «Рабочий» | `role.tech` |
| 5.6 | Продажи | Продажи | Sales | Ventas | — | `role.sales` |
| 5.7 | Сотрудник | Сотрудник | Employee | Empleado | RU «Работник» | `team.employee` |
| 5.8 | Субподрядчик | Субподрядчик | Subcontractor | Subcontratista | — | `team.sub` |
| 5.9 | Должность (под подписью) | Должность | Title | Cargo | — | `team.member.jobTitle` |
| 5.10 | Ответственный | Ответственный | Assigned to | Responsable | — | `card.filter.people` |
| 5.11 | Супруг/супруга | Супруг(а) → «Супруг или супруга» | Spouse | Cónyuge | RU «(а)» в скобках | `person.role.spouse` |
| 5.12 | Арендатор | Арендатор | Tenant | Inquilino | — | `person.role.tenant` |
| 5.13 | Управляющий недвижимостью | Управляющий | Property manager | Administrador de la propiedad | — | `person.role.property_manager` |
| 5.14 | Бухгалтер | Бухгалтер | Accountant | Contador | — | `person.role.accountant` |
| 5.15 | Помощник | Помощник | Assistant | Asistente | — | `person.role.assistant` |
| 5.16 | Основной контакт | Основной | Primary | Principal | RU «Основной человек» (`person.mainPerson`) → «Основной контакт» | `person.primary` |
| 5.17 | Вы (в списке команды) | Вы | You | Usted | ES «Tú» | `team.you` |
| 5.18 | Владелец дома (клиент) | Хозяин дома? [?] → «Клиент» | Homeowner | Propietario | не путать с «Владелец» компании | — |

---

## 6. Деньги

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 6.1 | Сумма позиций | Подытог | Subtotal | Subtotal | RU «Промежуточный итог» | `job5.lines.subtotal` |
| 6.2 | Скидка | Скидка | Discount | Descuento | — | `est.discount` |
| 6.3 | Налог с продаж | Налог | Tax | Impuesto | EN «Sales tax» только в настройках; ES «IVA» (в США нет) | `co.tax*` |
| 6.4 | Без налога | Без налога | Tax exempt | Exento de impuestos | — | `client.f.taxExempt` |
| 6.5 | Итог | Итого | Total | Total | RU «Итог» в одних, «Итого» в других (4) — писать «Итого» | `ue.total`, `job5.lines.total` |
| 6.6 | Депозит **[решено]** | Депозит | Deposit | Depósito | RU «Задаток» (4: `sync.stuck.money`, `sync.stuck.moneySelf`, `att.rejected.deposit`, `opay.readyHint.off`), «Аванс» (8: `mny.adv.*`), «Предоплата» (`sup.terms.prepaid` — условие поставщика, OK); ES «Anticipo» (8) | `money.deposit`, `inv.kind.deposit` |
| 6.7 | Платёж без счёта | Платёж без счёта | Payment without an invoice | Pago sin factura | RU «Аванс клиента», «Авансы без счёта» (`mny.adv.*`) → «Платёж без счёта» [Q9]; EN «Advance» (8); ES «Anticipo» | `mny.adv.chip`, `mny.adv.blockTitle` |
| 6.8 | Остаток по счёту | Остаток | Balance | Saldo | RU «Баланс» (`client.balance`) там, где это долг клиента | `inv.balance`, `rcpt.balanceAfter` |
| 6.9 | Сумма к оплате | К оплате | Balance due | Saldo pendiente | ES «Saldo» голое; EN «Amount due»/«Due» (15 смесь) | `inv.balance`, `visit.amountDue` |
| 6.10 | Срок оплаты | Оплатить до | Due date | Vence | — | `inv.due` |
| 6.11 | Оплачено | Оплачено | Paid | Pagado | — | `money.paid` |
| 6.12 | Просрочено | Просрочено | Overdue | Vencido | — | `money.overdue` |
| 6.13 | Должен клиент | Должен | Owes | Debe | RU «Должны» → «Должны нам» [?] | `clients.f.owes`, `rpt.owed.title` |
| 6.14 | Способы оплаты — группа | Способ оплаты | Payment method | Forma de pago | ES «Método» (`rcpt.method`) | `visit.method`, `card.filter.method` |
| 6.15 | Наличные | Наличные | Cash | Efectivo | — | `pay.cash` |
| 6.16 | Чек **[решено]** | Чек | Check | Cheque | — | `pay.check` |
| 6.17 | Карта | Карта | Card | Tarjeta | — | `pay.card` |
| 6.18 | Zelle | Zelle | Zelle | Zelle | — | `pay.zelle` |
| 6.19 | Банковский перевод | Банк (ACH) | Bank (ACH) | Banco (ACH) | — | `pay.ach` |
| 6.20 | Онлайн-оплата по ссылке | Онлайн-оплата | Online payment | Pago en línea | — | `pay.online.*` |
| 6.21 | Комиссия платёжной системы | Комиссия Stripe | Stripe fee | Comisión de Stripe | — | `mny.refund.fee` |
| 6.22 | Спор по платежу | Спор | Dispute | Disputa | ES «Contracargo» [?] | `mny.refund.err.refund_disputed` |
| 6.23 | Возврат | Возврат | Refund | Reembolso | — | `mny.refund.*` |
| 6.24 | Выставлено | Выставлено | Invoiced | Facturado | — | `inv.invoiced` |
| 6.25 | Осталось получить | Осталось получить | Left to collect | Por cobrar | — | `inv.remaining` |
| 6.26 | Собрано | Собрано | Collected | Cobrado | — | `rpt.collected.title` |
| 6.27 | Выручка | Выручка | Revenue | Ingresos | — | `rpt.cat.revenue` |
| 6.28 | Средний чек (сделки) | Средняя сумма сметы [?] | Average ticket | Ticket promedio | RU «Средний чек» путает с check **[решено]** | `rpt.cat.avg` |
| 6.29 | Надбавка | Надбавка | Markup | Margen | — | `cat.markup` |
| 6.30 | Закупка | Закупка | Cost | Costo | EN «Supplier price» | `cat.cost` |
| 6.31 | Цена клиенту | Цена | Price | Precio | — | `cat.price` |
| 6.32 | Сумма | Сумма | Amount | Monto | ES «Importe» (po.pdf) vs «Monto» — оставить «Monto» | `rcpt.amount`, `po.pdf.amount` |
| 6.33 | Минус | Минус | Less | Menos | — | `inv.less` |
| 6.34 | Выписка по договору | Выписка по договору | Contract statement | Estado de cuenta del contrato | — | `inv.statement` |
| 6.35 | Выписать чек на имя | Чек на имя | Make checks payable to | Cheques a nombre de | — | `inv.checkTo` |
| 6.36 | Тестовые цены (правило 9) | тестовые цены | test prices | precios de prueba | «демо-» | `cat.placeholder` |
| 6.37 | Ставка налога в смете | Ставка, % | Rate, % | Tasa, % | RU «Процент налога» | выключатель сметы называется «Налог» (6.3) [Q29] |
| 6.38 | Налог, который платит подрядчик поставщику | Налог поставщика | Supplier tax | Impuesto del proveedor | не путать с налогом сметы | `cat.vendorTax` |
| 6.39 | Закупка без налога (за единицу) | Закупка без налога | Cost before tax | Costo sin impuesto | RU «Закупочная цена» | см. 6.30 [Q30] |
| 6.40 | Закупка + налог поставщика | Полная себестоимость | Total cost | Costo total | RU «Себестоимость с налогом» | см. 6.30 [Q30] |
| 6.41 | Себестоимость позиции сметы (за единицу) | Себестоимость | Cost | Costo | RU «Закупка» для строки сметы | см. 6.30 [Q30] |
| 6.42 | Цена за единицу, по которой продаём | Цена продажи | Sale price | Precio de venta | — | см. 6.31 «Цена» [Q30] |
| 6.43 | Наценка на закупку, % | Наценка | Markup | Margen de ganancia | RU «Надбавка»; ES «Margen» (занято под 6.45) | см. 6.29 [Q30] |
| 6.44 | Сколько остаётся с позиции или сметы, $ | Заработок | Profit | Ganancia | RU «Прибыль», «Маржа», «Профит»; видно только при праве на себестоимость | `est.line.profit` |
| 6.45 | Заработок в процентах от суммы | Заработок, % | Margin | Margen | ES «Margen» также у 6.29 — разведено в 6.43 [Q30] | `est.line.profit` |
| 6.46 | Заработок с одной штуки (карточка каталога) | Заработок с одной штуки | Profit per unit | Ganancia por unidad | — | `cat.profit` |
| 6.47 | Заработок ниже нуля | в минус | at a loss | en pérdida | значок «alert» + слово | `est.line.loss` |
| 6.48 | Итог по разделу сметы | Итог раздела | Section subtotal | Subtotal de la sección | см. 6.1, 6.5 [Q32] | `est.section.total` |

---

## 7. Время и расписание

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 7.1 | Сегодня | Сегодня | Today | Hoy | — | `common.today` |
| 7.2 | Завтра | Завтра | Tomorrow | Mañana | — | `common.tomorrow` |
| 7.3 | Вчера | Вчера | Yesterday | Ayer | — | — |
| 7.4 | Просрочено | Просрочено | Overdue | Vencido | EN «Late» | `task.overdue` |
| 7.5 | Опаздывает | Опаздывает | Running late | Con retraso | — | `st.late` |
| 7.6 | Длительность | Длительность | Duration | Duración | — | `sch.duration` |
| 7.7 | Начало | Начало | Start | Inicio | — | `sch.start` |
| 7.8 | Окно прибытия | Окно прибытия | Arrival window | Ventana de llegada | RU «Окно» голое | — [?] |
| 7.9 | Точное время | Точное время | Exact time | Hora exacta | — | `schs.exact` |
| 7.10 | Рабочие часы | Рабочие часы | Working hours | Horario laboral | — | `vf.warn.outOfHours` |
| 7.11 | Перенос | Перенос | Reschedule | Reprogramación | — | `vw.reschedule` |
| 7.12 | Срок задачи | Срок | Due date | Fecha límite | RU «Когда» | `task.when` |
| 7.13 | Без срока | Без срока | No due date | Sin fecha | — | `task.noDate` |
| 7.14 | Минуты | мин | min | min | — | `common.min` |
| 7.15 | Часы | ч | hr | h | RU «час» в UI | — |
| 7.16 | Дни | дн. | d / days | d / días | RU «дн» без точки (`att.noReplyDays`) vs «дн.» (`lead.daysAgo`) — писать «дн.» | `lead.daysAgo` |
| 7.17 | Недели | нед. | wk | sem. | — | — |
| 7.18 | Рабочие дни | рабочих дней | business days | días hábiles | — | `visitP2.set.days` |
| 7.19 | Через N дней | Через {n} дн. | In {n} days | En {n} días | — | `task.when.in3` |
| 7.20 | N дн. назад | {n} дн. назад | {n} days ago | Hace {n} días | — | `lead.daysAgo` |
| 7.21 | Время суток 12/24 | 5 PM (как в США) [?] | 5 PM | 5 PM | RU «17:00» (5 ключей: `task.when.today`, `tag.noLateCalls`, `toast.bookedTomorrow`) [Q17] | — |
| 7.22 | Просрочено на N дней | Просрочен на {n} дн. | {n} days overdue | {n} días de atraso | — | `card.sign.overdueDays` |
| 7.23 | Мастер на пути | В пути с {time} | On the way since {time} | En camino desde las {time} | — | `late.notice.enRoute` |
| 7.24 | Следующий выезд | Следующий выезд | Next visit | Próxima visita | RU «Следующий визит» | `prop.nextVisit` |
| 7.25 | Свободное время | Свободное время | Free time | Horario libre | — | `vf.noSlots` |

---

## 8. Контакты и адрес США

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 8.1 | Телефон (основной) | Телефон | Phone | Teléfono | RU «Тел.» | `person.phone` |
| 8.2 | Дополнительный телефон | Дополнительный телефон | Additional phone | Teléfono adicional | RU «Мобильный» (2) | `client.f.phones` |
| 8.3 | Email | Email | Email | Email | RU «Почта»/«E-mail»; ES «Correo» (≈) vs «Email» — один вариант [Q18] | `person.email` |
| 8.4 | Адрес | Адрес | Address | Dirección | — | `client.import.f.address` |
| 8.5 | Улица и дом | Улица и дом | Street address | Dirección (calle y número) | — | `prop.street` |
| 8.6 | Квартира / офис | Квартира / офис | Apt / suite | Apto / suite | — | `prop.unit` |
| 8.7 | Город | Город | City | Ciudad | — | `client.import.f.city` |
| 8.8 | Штат | Штат | State | Estado | RU «Штат» ≠ «статус»; ES «Estado» = и штат, и статус — в строках адреса добавлять «(estado de EE. UU.)» не нужно, контекст есть | `co.state`, `intake.state` |
| 8.9 | Почтовый индекс | ZIP | ZIP | Código postal / ZIP | RU «Индекс» | `co.zip` |
| 8.10 | Имя | Имя | First name | Nombre | EN «Name» отдельно от First name — путать | `client.f.first` |
| 8.11 | Фамилия | Фамилия | Last name | Apellido | — | `client.f.last` |
| 8.12 | Организация клиента | Компания | Company | Empresa | — | `client.f.company` |
| 8.13 | Язык клиента | Язык клиента | Client's language | Idioma del cliente | RU «Язык документов» | `docLanguage` |
| 8.14 | Код ворот | Код ворот | Gate code | Código del portón | — | `prop.gate` |
| 8.15 | Заметки доступа | Заметки доступа | Access notes | Notas de acceso | — | `prop.accessNotes` |
| 8.16 | Не звонить после 18:00 | Не звонить после 6 PM | No calls after 6 PM | No llamar después de las 6 PM | — | `tag.noLateCalls`, `client.lateCalls` |

---

## 9. Состояние данных и сеть

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 9.1 | Сохранено на устройстве | Сохранено | Saved | Guardado | — | `set.saved` |
| 9.2 | Ждёт отправки **[решено]** | Ждёт отправки | Waiting to send | Pendiente de envío | RU «в очереди» (`nav.sync.sending`, `offline.badge`, `sync.server.badge`), «очередь» (`offline.synced`), EN «queued» (4), «Queue», ES «Cola» (4) | `offline.badge`, `card.queued` |
| 9.3 | Нет сети | Нет сети | No network | Sin conexión | EN «Offline» (6), «No connection to the server» (`acct.err.network`); ES «Sin red» | `offline.badge` |
| 9.4 | Сервер недоступен | Сервер недоступен | Server unavailable | Servidor no disponible | — | `sync.server.badge` |
| 9.5 | Не отправлено | Не отправлено | Not sent | Sin enviar | EN «Sync error» (2: `settings.syncError`, `account.syncErr.general`) | `acct.unsentChip`, `sync.stuck.badge` |
| 9.6 | Отправляется | Отправляется | Sending | Enviando | RU «Синхронизация» (3), EN «Sync» (6), ES «Sincronización» (4) — слово «синхронизация» в UI не нужно | `nav.sync.sending` |
| 9.7 | Отправлено | Отправлено | Sent | Enviado | — | `draw.save.sent` |
| 9.8 | Конфликт: данные изменил другой | Изменено другим человеком | Changed by someone else | Cambiado por otra persona | RU «конфликт», EN «Conflict» | `sync.rejected.settingsHint` |
| 9.9 | Не сохранено на устройстве | Не сохранено на телефоне | Not saved on this phone | No guardado en el teléfono | — | `draw.notSaved` |
| 9.10 | Сохранено на телефоне | Сохранено на телефоне | Saved on this phone | Guardado en el teléfono | — | `draw.saved` |
| 9.11 | Повторим сами | Повторим сами | We will retry | Reintentaremos | — | `sync.stuck.note` |
| 9.12 | Нужна сеть | Нужна сеть | Needs the network | Se necesita conexión | — | `acct.needNet` |
| 9.13 | Сеть вернулась | Сеть есть | Back online | Conectado | «очередь отправлена» → «Всё отправлено: {n}» | `offline.synced` |
| 9.14 | Загрузка | Загружаем… | Loading… | Cargando… | — | `portal.loading` |

---

## 10. Единицы и форматы

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 10.1 | Футы | ft (в строках: «фут» только в полях) | ft | ft | RU «фт» (`view.u.ft`), ES «pies» (`attr.ft`) | `attr.ft`, `view.u.ft` |
| 10.2 | Дюймы | in | in | pulg | RU «дюйм»; смесь in/pulg/″ — длина пишется 12′ 6″ в чертеже, «ft/in» в полях | `attr.in`, `set.in` |
| 10.3 | Футы+дюймы | 12′ 6″ | 12′ 6″ | 12′ 6″ | «12 ft 6 in» в чертеже | `attr.badLength` |
| 10.4 | Дроби дюйма | ½, ¼, ⅛, 3/16 (знак «″» после) | ½″ | ½″ | десятичные 0.5 | `set.u.screw.*` |
| 10.5 | Погонный фут | LF | LF | LF | RU «пог. фут» | `cat.unit` |
| 10.6 | Штука | ea (шт в РУ-тексте) | ea | u. [?] | RU «шт» (2) смесь с «ea»; ES «u» | `view.u.ea` |
| 10.7 | Квадратный фут | sq ft | sq ft | sq ft | «кв. фут» | `cat.unit` |
| 10.8 | Час | hr | hr | h | — | `cat.unit` |
| 10.9 | Фунт | lb | lb | lb | RU «фунт» | `view.u.lb` |
| 10.10 | Метрика | мм, см, м | mm, cm, m | mm, cm, m | — | `attr.unit.*` |
| 10.11 | Деньги | $1,234.56 | $1,234.56 | $1,234.56 | «1 234,56 $» | правило 7 |
| 10.12 | Дата | Nov 11, 2026 / 11 нояб. | Nov 11, 2026 | 11 nov 2026 | ДД.ММ.ГГГГ | правило 7 [?] |
| 10.13 | Время | 5 PM | 5 PM | 5 PM | 24-часовой | [Q17] |
| 10.14 | Проценты | 7.5% | 7.5% | 7.5% | «7,5 %» | — |
| 10.15 | Номера документов | EST-0001, INV-0001, RCT-0001, PO-0001, JOB-0001, HIS-n | то же | то же | кириллица в номере | `card.filter.search*` |
| 10.16 | Размер желоба | 5″ / 6″ | 5″ / 6″ | 5″ / 6″ | «пять дюймов» | — |
| 10.17 | Калибр | .027 / .032 [?] | .027 | .027 | — | `attr.gauge` |
| 10.18 | Единица измерения (поле) | Единица | Unit | Unidad | RU «Ед. изм.» | `est.line.unit` |
| 10.19 | Количество (поле) | Количество | Quantity | Cantidad | RU «Кол-во» | `est.line.qty` |

---

## 11. Модуль Gutters

Ориентир — английское слово, которое американский подрядчик говорит на объекте. RU/ES — как говорит бригада; там, где русское слово в бригадах не устоялось, указываю и английское (его используют сами) и помечаю [?]. Основатель проверит.

| № | Понятие | RU | EN | ES | Нельзя | Ключи |
|---|---|---|---|---|---|---|
| 11.1 | Водосточный желоб (вся линия) | Желоб | Gutter | Canaleta | ES «Canal» голое, «Gutter» (в заголовке модуля `Canaletas (Gutters)` — убрать скобку); RU «Лоток», «Жёлоб» | `mod.gutters.draw.line` |
| 11.2 | Участок желоба между углами | Участок желоба | Run | Tramo | RU «Линия», EN «Line» | `attr.run`, `set.defRun` |
| 11.3 | Водосточная труба | Водосток | Downspout | Bajante | RU «Труба» (в бригаде говорят оба) [?]; EN «Leader» только внутри «leader head» | `draw.downspout` |
| 11.4 | Заглушка желоба | Заглушка | End cap | Tapa de extremo | ES «Tapa» без «extremo» (`set.j.endcap`) допустимо; левая/правая: Левая / Правая | `set.j.endcap`, `pr.p.end_cap` |
| 11.5 | Левая / правая | Левая / Правая | Left / Right (L / R) | Izquierda / Derecha | — | `end cap 25L+25R` |
| 11.6 | Угол (общее) | Угол | Corner | Esquina | RU «Миттер» | `draw.cornerTitle` |
| 11.7 | Внутренний угол | Внутренний | Inside corner | Esquina interior | — | `attr.ck.in` |
| 11.8 | Наружный угол | Наружный | Outside corner | Esquina exterior | — | `attr.ck.out` |
| 11.9 | Угол эркера | Эркер | Bay | Bahía | — | `draw.cornerBay` |
| 11.10 | Миттер (готовый угол) | Угол готовый | Miter (prefab) | Esquina prefabricada | «Strip miter» — оставить по-английски в RU и ES (все так говорят) | `attr.cm.prefab` |
| 11.11 | Strip miter | Strip miter | Strip miter | Strip miter | перевод | `attr.cm.strip` |
| 11.12 | Угол, вырезанный на месте | Вырезать на месте | Field cut | Corte en obra | — | `attr.cm.cut` |
| 11.13 | Крепление желоба | Крепление | Hanger | Soporte | RU «Кронштейн», «Крюк» (оба говорят) [?]; ES «Gancho» [?] | `attr.hanger` |
| 11.14 | Скрытое крепление | Скрытое | Hidden hanger | Soporte oculto | — | `attr.k.hidden` |
| 11.15 | Костыль + гильза | Костыль с гильзой | Spike & ferrule | Clavo y casquillo | RU «Шпиль» | `attr.k.spike` |
| 11.16 | Саморез | Саморез | Screw | Tornillo | — | `pr.p.screw` |
| 11.17 | Заклёпка | Заклёпка | Rivet | Remache | — | `set.u.rivets` |
| 11.18 | Герметик | Герметик | Sealant | Sellador | EN «Caulk» (в бригадах) [?] | `pr.p.sealant` |
| 11.19 | Колено | Колено | Elbow | Codo | A / B — «Колено A» (вперёд-назад) / «Колено B» (вбок) | `attr.elbows`, `pr.p.elbow` |
| 11.20 | Колено A / колено B | Колено A / Колено B | Elbow A / Elbow B | Codo A / Codo B | — | `attr.elbowQty` |
| 11.21 | Выпуск желоба под трубу | Выпуск | Outlet | Salida | RU «Воронка» (путает с funnel, `attr.h.funnel`) | `pr.p.outlet` |
| 11.22 | Воронка | Воронка | Funnel | Embudo | — | `attr.h.funnel` |
| 11.23 | Верхний коллектор | Leader head | Leader head | Cabeza colectora | — | `pr.p.conductor_head` |
| 11.24 | Торцевой выпуск | Торцевой выпуск | End outlet | Salida de extremo | — | `pr.p.end_outlet` |
| 11.25 | Отбойник на угле | Отбойник | Splash guard | Protector de salpicadura | — | `draw.splash` |
| 11.26 | Отбойник на земле (бетонный/пластиковый) | Отбойник на земле [?] | Splash block | Bloque salpicadero | RU «Отбойник» — одно слово на два предмета (`pr.p.splash_block`, `pr.p.splash_guard`) | `attr.b.splash_block` |
| 11.27 | Защита желоба / сетка | Защита желоба | Gutter guard | Protector de canaleta | RU «Сетка» голое (`pr.p.guard_run`); «Сетка выпуска» — другое | `pr.p.guard_run` |
| 11.28 | Сетка на выпуске | Сетка на выпуске | Outlet screen | Malla de salida | — | `attr.outletScreen` |
| 11.29 | Лобовая доска | Лобовая доска (fascia) | Fascia | Fascia | — | `attr.mt.fascia` |
| 11.30 | Софит | Софит | Soffit | Sofito | — | — |
| 11.31 | Свес крыши | Свес | Eave | Alero | RU «Карниз» (`attr.mt.crown` «Карниз ogee») | `attr.mount` |
| 11.32 | Край крыши (куда крепим) | Край крыши | Roof edge | Borde del techo | — | `attr.mount` |
| 11.33 | Стропила | Стропила | Rafter | Viga / Cabio [?] | — | `attr.mt.rafter` |
| 11.34 | Рулон алюминия | Рулон | Coil | Rollo / Bobina [?] | RU «Бухта» (в бригадах «койл») | `attr.wk.coil_strap` |
| 11.35 | Бесшовный | Бесшовный | Seamless | Sin costura | — | `set.r.seamlessYes` |
| 11.36 | Секционный | Секциями | Sectional | Por secciones | — | `set.r.seamlessNo` |
| 11.37 | Профиль K | K | K-style | K | — | `attr.p.k` |
| 11.38 | Полукруглый | Полукруглый | Half round | Media caña | — | `attr.p.half_round` |
| 11.39 | Удлинитель | Удлинитель | Extension | Extensión | — | `pr.p.extension` |
| 11.40 | Хомут водостока | Хомут | Strap | Abrazadera | EN «Strap» только в сочетаниях | `attr.wk.ds_strap` |
| 11.41 | Крепление водостока к стене | Крепление водостока к стене | Downspout wall fasteners | Fijaciones de bajante a la pared | — | `set.wallKits` |
| 11.42 | Демонтаж старого | Демонтаж | Tear-off | Retiro | EN «Removal»; ES «Demolición» | `pr.w.tearoff` |
| 11.43 | Этаж | Этаж | Story | Piso | ES «Planta» [?] (в США «piso» = и этаж, и пол) | `mod.gutters.story` («эт {n}») |
| 11.44 | Уклон | Уклон | Pitch / Slope | Pendiente | — | — [?] |
| 11.45 | Смещение | Смещение | Offset | Desvío | — | `attr.offsets` |
| 11.46 | Переход в размер | Переход | Reducer | Reductor | — | `attr.reducer` |
| 11.47 | Компенсатор (температурный) | Компенсатор | Expansion joint | Junta de dilatación | — | `set.r.expansionFt` |
| 11.48 | Гибкий отвод | Гибкий отвод | Flex extension | Extensión flexible | — | `pr.p.flex` |
| 11.49 | Отвод в бочку | Отвод в бочку | Rain barrel diverter | Desviador a barril | — | `attr.diverter` |
| 11.50 | Дождевая цепь | Дождевая цепь | Rain chain | Cadena de lluvia | — | `pr.p.rain_chain` |
| 11.51 | Y-образник | Y-воронка → «Тройник Y» [?] | Wye | Ye | — | `pr.p.wye` |
| 11.52 | Короб под карнизом | Короб | Eave box | Caja de alero | — | `pr.p.eave_box` |
| 11.53 | Поддон на крыше | Поддон | Splash pan | Bandeja salpicadero | — | `pr.p.splash_pan` |
| 11.54 | Соединитель | Соединитель | Slip joint | Unión deslizante | — | `pr.p.slip_joint` |
| 11.55 | Пайка / припой (медь) | Припой | Solder | Soldadura | — | `set.u.solder` |
| 11.56 | Прайс-лист поставщика | Прайс поставщика | Supplier price list | Lista de precios del proveedor | «Прайс» голое — только поставщик | `pr.title` |
| 11.57 | Раскрой | Раскрой | Cut list | Lista de corte | ES «Corte» голое | `draw.cutTitle` |
| 11.58 | Точность замера | Точность замера | How exact | Precisión | — | `draw.accTitle` |
| 11.59 | Рулетка | Рулетка | Tape | Cinta | EN «Taped»; ES «Con cinta» | `attr.taped` |
| 11.60 | Материалы: алюминий, сталь, медь, цинк | Алюминий, Сталь, Медь, Цинк | Aluminum, Steel, Copper, Zinc | Aluminio, Acero, Cobre, Zinc | — | `attr.m.*` |
| 11.61 | Покрытие: окрашенный / без покраски | Окрашенный / Без покраски | Painted / Mill finish | Pintado / Sin pintar | EN «Mill» голое — писать «Mill finish» | `attr.f.*` |
| 11.62 | Толщина (калибр) | Толщина | Gauge | Calibre | — | `attr.gauge` |
| 11.63 | Цвета (по каталогу) | Белый, Миндаль, Лён, Глина, Коричневый, Musket, Бронза, Чёрный, Серый | White, Almond, Linen, Clay, Brown, Musket Brown, Bronze, Black, Gray | Blanco, Almendra, Lino, Arcilla, Café, Musket Brown, Bronce, Negro, Gris | перевод фирменных цветов (Musket Brown оставить) | `attr.c.*` |
| 11.64 | Профиль водостока: гладкий / гофрированный | Гладкий / Гофрированный | Plain / Corrugated | Liso / Corrugado | — | `attr.st.*` |
| 11.65 | Сечение трубы: прямоугольная / круглая | Прямоугольная / Круглая | Rectangular / Round | Rectangular / Redonda | — | `attr.sh.*` |
| 11.66 | Стена: дерево / штукатурка / кирпич | Доска, сайдинг / Штукатурка / Кирпич | Wood, siding / Stucco / Brick | Madera, siding / Estuco / Ladrillo | — | `attr.w.*` |
| 11.67 | Низ водостока | Низ водостока | Downspout bottom | Salida de bajante | — | `set.bottoms` |
| 11.68 | Замер → смета | Сделать смету | Make an estimate | Hacer presupuesto | — | `est.make` |
| 11.69 | Нарисовано / по рулетке | нарисовано / рулетка | drawn / taped | dibujado / con cinta | — | `attr.drawn` |
| 11.70 | Высота этажа, шаг креплений, запас | Высота этажа, шаг креплений, запас на отход | Story height, hanger spacing, waste | Altura del piso, separación de soportes, desperdicio | — | `set.r.*` |

---

## 12. Типовые фразы

| № | Шаблон | RU | EN | ES |
|---|---|---|---|---|
| 12.1 | Пустой экран: не было | «{Объектов} пока нет» + подсказка «Они появятся здесь, когда …» | «No {objects} yet» + «They will appear here when …» | «Aún no hay {objetos}» + «Aparecerán aquí cuando …» |
| 12.2 | Пустой фильтр | В этом отборе пусто | Nothing in this filter | Nada en este filtro |
| 12.3 | Ничего не найдено | Ничего не нашлось по «{q}» | Nothing found for “{q}” | No se encontró nada para «{q}» |
| 12.4 | Ошибка (общая) | Не получилось. Попробуйте ещё раз. | That did not work. Try again. | No funcionó. Inténtelo de nuevo. |
| 12.5 | Ошибка сети | Нет сети. Изменение сохранено и отправится, когда сеть вернётся. | No network. The change is saved and will be sent when you are back online. | Sin conexión. El cambio está guardado y se enviará cuando vuelva la red. |
| 12.6 | Ошибка с причиной | Не получилось: {причина}. | That did not work: {reason}. | No funcionó: {motivo}. |
| 12.7 | Подтверждение необратимого | {Глагол} {объект}? Вернуть нельзя. | {Verb} {object}? This cannot be undone. | ¿{Verbo} {objeto}? No se puede deshacer. |
| 12.8 | Кнопки подтверждения | «Удалить клиента» / «Не удалять» | “Delete client” / “Keep” | «Eliminar cliente» / «Conservar» |
| 12.9 | Тост «сделано / вернуть» | {Объект} удалён · Вернуть | {Object} deleted · Undo | {Objeto} eliminado · Deshacer |
| 12.10 | Тост «сохранено» | Сохранено | Saved | Guardado |
| 12.11 | Подсказка «?» | Одно предложение: что это и зачем. | One sentence: what it is and what for. | Una frase: qué es y para qué sirve. |
| 12.12 | Нужно заполнить | Укажите {что} | Enter {what} | Indique {qué} |
| 12.13 | Нет доступа | У вас нет прав на это. Обратитесь к владельцу. | You do not have permission. Ask the owner. | No tiene permiso. Consulte al dueño. |
| 12.14 | Выйти без сохранения | Выйти без сохранения? / Остаться / Выйти | Leave without saving? / Stay / Leave | ¿Salir sin guardar? / Quedarse / Salir |
| 12.15 | Счётчик | {n} из {m} · Осталось: {n} | {n} of {m} · {n} left | {n} de {m} · Quedan {n} |
| 12.16 | Пустая смета | Позиций пока нет | No line items yet | Aún no hay partidas | — | — |
| 12.17 | Позиция удалена | Позиция удалена · Вернуть | Line item deleted · Undo | Partida eliminada · Deshacer | — | — |
| 12.18 | Позиция заменена | Позиция заменена · Вернуть | Line item replaced · Undo | Partida reemplazada · Deshacer | — | — |
| 12.19 | Разложено по видам | Разложено по видам · Вернуть | Grouped by type · Undo | Agrupado por tipo · Deshacer | — | — |
| 12.20 | Скрыть можно только при цене $0 | Скрыть можно позицию с ценой $0 | You can hide a line item priced at $0 | Se puede ocultar una partida con precio $0 | — | — |
| 12.21 | Вписали цену в скрытую позицию | Позиция снова видна клиенту | Line item is visible to the client again | La partida vuelve a ser visible para el cliente | — | — |
| 12.22 | Добавлено в каталог | Добавлено в каталог · Вернуть | Added to catalog · Undo | Agregado al catálogo · Deshacer | — | — |
| 12.23 | Подсказка в «Переименовать» раздел | Клиент увидит название так, как вы его написали | Your client will see the name exactly as you typed it | Su cliente verá el nombre tal como lo escribió | — | — |
| 12.24 | Обязательное поле: клиент | Выберите клиента | Select a client | Seleccione un cliente | — | `form.req.*` |
| 12.25 | Обязательное поле: адрес | Выберите адрес | Select an address | Seleccione una dirección | RU «адрес» против 1.6 «Объект» [Q34] | `form.req.*` |
| 12.26 | Нет позиций | Добавьте позицию | Add a line item | Agregue una partida | — | `form.req.*` |
| 12.27 | Нет названия | Впишите название | Enter a name | Escriba un nombre | — | `form.req.*` |
| 12.28 | Неверное число | Впишите число, например 12.5 | Enter a number, for example 12.5 | Escriba un número, por ejemplo 12.5 | — | `form.req.*` |
| 12.29 | Нет ставки налога | Впишите ставку, например 10.25 | Enter a rate, for example 10.25 | Escriba una tasa, por ejemplo 10.25 | — | `form.req.*` |
| 12.30 | Нет закупки (каталог, материал) | Впишите закупку без налога | Enter the cost before tax | Escriba el costo sin impuesto | — | `form.req.*` |
| 12.31 | Нет цены (каталог, услуга и работа) | Впишите цену | Enter a price | Escriba un precio | — | `form.req.*` |
| 12.32 | Пустой комплект | Добавьте позицию в комплект | Add an item to the kit | Agregue un artículo al kit | — | `form.req.*` |
| 12.33 | Ссылка без https | Ссылка должна начинаться с https:// | The link must start with https:// | El enlace debe comenzar con https:// | — | `form.req.*` |

Правила: без «Упс», «Ой», «Пожалуйста» (RU/EN), без восклицательных знаков (RU 4 ключа с «!» — убрать, кроме клиентского «Спасибо!»), без многоточия в кнопках (22 ключа с «…» — оставить только в «Загружаем…» и «Отменить изменение…»-кнопках, где открывается диалог).

---

## 13. Запрещённые слова

| № | Слово | Где (вхождения) | Заменить на |
|---|---|---|---|
| 13.1 | синхронизация / sync / sincronización | RU 3, EN 6, ES 4 | «отправка», «ждёт отправки» |
| 13.2 | очередь / queue / cola | RU 4, EN 4, ES 4 | «ждёт отправки» |
| 13.3 | сервер / server | RU 41 | «в облаке» только если нужно; иначе «приложение отправит» (в ошибках «сервер» допустим один раз) [?] |
| 13.4 | токен, API, ключ API | RU 0 в UI | «код»/«ключ» только для Stripe |
| 13.5 | аккаунт / account / cuenta | RU 33 | «учётная запись» нет; оставить «аккаунт» (общепринято) [?] |
| 13.6 | операция / entity / сущность | RU 0 | не использовать |
| 13.7 | модуль (в значении add-on) | EN «add-on» | «модуль» / «Module» везде |
| 13.8 | движок | RU 0 | — |
| 13.9 | синк / sync error | EN 2 | «Не отправлено» |
| 13.10 | Customer | EN 12 | Client |
| 13.11 | Tech | EN 1 | Technician |
| 13.12 | Inspection | EN 5 | Estimate visit |
| 13.13 | Evaluación / estimado | ES 15 / 16 | Visita de presupuesto / Presupuesto |
| 13.14 | Director | RU 13 / EN 12 / ES 12 | Владелец / Owner / Dueño |
| 13.15 | задаток, аванс, anticipo, advance | RU 4+8, ES 8, EN 8 | Депозит, Deposit, Depósito (см. 6.6–6.7) |
| 13.16 | Чаты / Chats | RU 1, ES (`Chats`) | Сообщения |
| 13.17 | Люди / People | RU ≈29 | Контакты |
| 13.18 | Тап / tap | RU 0, EN `Tap → visible` (бенч) | «Нажмите» / «Tap» оставить в EN (общепринято) |
| 13.19 | Шторка / sheet | RU 5 (`sheet.*`) | «окно» |
| 13.20 | лента (feed) | RU 12 (`лента`, `история`) | «История» |
| 13.21 | строка (для позиции сметы) | RU ≈15 | «позиция» |
| 13.22 | Отмена вместо «Отменить» | RU 1 | см. 3.11 |
| 13.23 | пуш, push | RU 0 | «уведомление» |
| 13.24 | Ты/tú-формы | ES ≈14 | «usted» |
| 13.25 | Dispatcher (ES) | ES 4 | Coordinador [?] |
| 13.26 | Кастильский: ordenador, móvil, vale, coche | ES 2 («móvil») | «computadora», «celular», «de acuerdo» |
| 13.27 | «пожалуйста»/«please» в интерфейсе | 0 | не использовать (кроме клиентских текстов) |
| 13.28 | Канцелярит: «осуществить», «данные» (как заполнитель) | — | «сделать», «информация» |

---

## 14. Тексты для клиента подрядчика

Клиент — человек, не знающий приложения. Язык — язык клиента (en/es/ru), `tFor(docLanguageFor(...))`.

Правила:
1. Тон: вежливый, «вы» / «usted» / «you». Подпись — название компании подрядчика, не OCTODEX.
2. Только слова клиента: **Estimate / Presupuesto / Смета**, **Invoice / Factura / Счёт**, **Payment / Pago / Оплата**, **Deposit / Depósito / Депозит**, **Receipt / Recibo / Квитанция**, **Visit / Visita / Выезд**.
3. Никаких «лид», «клиент» (клиент не называет себя клиентом: пишем «you»), «мастер» (пишем «our technician» / «nuestro técnico» / «наш мастер»), «модуль», «синхронизация».
4. Каждое сообщение: кто пишет (компания) + что + когда + как ответить.
5. Деньги и даты — США, всегда.
6. Ссылки на оплату и подпись — одна кнопка/ссылка на сообщение.

| № | Понятие | RU | EN | ES | Нельзя |
|---|---|---|---|---|---|
| 14.1 | Заголовок документа | Смета / Счёт / Квитанция | Estimate / Invoice / Receipt | Presupuesto / Factura / Recibo | EN «Quote», «Proposal»; ES «Estimado», «Cotización» |
| 14.2 | Кому | Для | For | Para | — |
| 14.3 | Выберите вариант | Выберите вариант | Choose an option | Elija una opción | — |
| 14.4 | Дополнительно, по желанию | Дополнительно, по желанию | Optional extras | Extras opcionales | — |
| 14.5 | Одобрить и подписать | Одобрить и подписать | Approve and sign | Aprobar y firmar | — |
| 14.6 | Согласие на э-подпись | Согласен(на) подписать электронно… (E-SIGN) | I agree to sign electronically… (E-SIGN) | Acepto firmar electrónicamente… | RU «(на)» → «Я согласен(на)» оставить, юр. |
| 14.7 | Депозит к оплате | Депозит к оплате | Deposit due | Depósito a pagar | «Задаток», «Аванс» |
| 14.8 | Оплатить онлайн | Оплатить онлайн | Pay online | Pagar en línea | — |
| 14.9 | Платёж получен | Платёж получен. Спасибо! | Payment received. Thank you! | Pago recibido. ¡Gracias! | — |
| 14.10 | Ссылка устарела | Ссылка больше не действует. Попросите компанию прислать новую. | This link is no longer valid. Ask the company to send a new one. | Este enlace ya no es válido. Pida a la empresa uno nuevo. | — |
| 14.11 | Выезд на оценку (SMS) | {Компания} приедет на оценку {дата} в {время}. | {Company} will visit for an estimate on {date} at {time}. | {Empresa} irá a hacer el presupuesto el {fecha} a las {hora}. | «осмотр», «evaluación», «inspection» |
| 14.12 | Выезд на работу (SMS) | {Компания} приедет на работы {дата} в {время}. | {Company} will arrive for the work on {date} at {time}. | {Empresa} llegará para el trabajo el {fecha} a las {hora}. | — |
| 14.13 | Если время не подходит | Если время не подходит, ответьте на это сообщение. | If this time does not work, reply to this message. | Si no le conviene la hora, responda a este mensaje. | — |
| 14.14 | Отмена выезда | {Компания}: выезд {дата} в {время} отменён. Ответьте, чтобы выбрать новое время. | {Company}: the visit on {date} at {time} is cancelled. Reply to pick a new time. | {Empresa}: la visita del {fecha} a las {hora} fue cancelada. Responda para elegir otra hora. | «отменили мы» |
| 14.15 | Напоминание об оплате | {Компания}: напоминаем, что счёт {№} просрочен на {n} дн. Остаток {сумма}. | {Company}: a friendly reminder that invoice {#} is {n} days past due. Balance {amount}. | {Empresa}: le recordamos que la factura {#} tiene {n} días de atraso. Saldo {monto}. | «Долг», «задолженность» |
| 14.16 | Мастер опаздывает (клиенту) | Мастер задерживается. Будет около {время}. | Our technician is running late. Arrival about {time}. | Nuestro técnico se retrasa. Llegará a las {hora}. | — |
| 14.17 | Мастер в пути | Мастер выехал к вам. | Our technician is on the way. | Nuestro técnico va en camino. | — |
| 14.18 | Подпись компании | от имени {компания} | for {company} | por {empresa} | — |
| 14.19 | Срок сметы | Действительна до | Valid until | Válido hasta | — |
| 14.20 | Скачать PDF | Скачать PDF | Download PDF | Descargar PDF | — |
| 14.21 | Спасибо | Спасибо за оплату! | Thank you for your payment! | ¡Gracias por su pago! | — |
| 14.22 | Подрядчик (на документе) | Подрядчик | Contractor | Contratista | — |
| 14.23 | Форма «Пришлите заявку» | Заявка на расчёт | Request an estimate | Solicitar presupuesto | EN «Request a quote» (`intake.title`) **→ Request an estimate** |
| 14.24 | Журнал подписи | Журнал подписи | Signature record | Registro de firmas | — |
| 14.25 | PDF для бригады (внутренний, не клиенту) | Раскрой для бригады | Cut list for the crew | Lista de corte para el equipo | показывать клиенту |

---

## Вопросы основателю (Q1–Q25; Q26–Q34 добавлены 12.11.2026 из спецификации редактора сметы)

| Q | Понятие | Варианты | Рекомендация |
|---|---|---|---|
| Q1 | Лид в ES | Prospecto / Cliente potencial / Lead | **Prospecto** (уже решено; 9 мест «cliente potencial» и 23 «lead» поправить) |
| Q2 | Выезд на оценку: слово на кнопках статусов | «Выезд на оценку» везде / «Оценка» в короткой метке | **Везде полностью** (short = «Выезд»?) — уточнить, если не влезает в чип |
| Q3 | Владелец в ES | Dueño / Propietario | **Dueño** (решено; Propietario = хозяин дома) |
| Q4 | Мастер в ES | Técnico / Operario | **Técnico** (решено) |
| Q5 | Задаток, аванс, депозит в ES | Depósito / Anticipo | **Depósito** |
| Q6 | «Позиция сметы» в EN | Line item / Item / Line | **Line item** (решено) |
| Q7 | Касса: «Принять оплату» и «Записать оплату» | одно слово «Принять оплату» (карта, чек, наличные) | **Принять оплату**, «Записать» убрать |
| Q8 | Раздел «План»: RU «План», EN «Schedule», ES «Agenda» | «Расписание» (RU) / «План» | **«План» → «Расписание»** (EN Schedule); RU «План» путается с планом работ |
| Q9 | «Платёж без счёта» вместо «Аванс клиента» | Платёж без счёта / Аванс / Предоплата | **Платёж без счёта** |
| Q10 | Расход «по чеку» | Расход с чеком / Расход с квитанцией / Расход | **Расход** + «Фото чека» → «Фото квитанции» (receipt, не check) |
| Q11 | Check-list в ES | Lista de control / Checklist / Lista de verificación | **Lista de verificación** [?] |
| Q12 | Вид позиции каталога «Работа» (labor) | Труд / Работа / Монтаж | **Труд** (не путать с сущностью «Работа») |
| Q13 | «Готово» как статус работы | Выполнена / Готово / Завершена | **Выполнена** (кнопка «Готово» остаётся) |
| Q14 | Смета подписана | Подписана / Одобрена | **Подписана** (клиентом); ждём компанию — «Ждёт подписи компании» |
| Q15 | Лид стал клиентом: статус «Клиент» vs «Won» | Won в фильтре, Client в статусе | **«Стали клиентами» / «Became clients»** |
| Q16 | Cancelled / Canceled | Cancelled (UK) / Canceled (US) | **Canceled** (американский рынок, 20 мест) |
| Q17 | Время 12 или 24 ч в RU | 5 PM / 17:00 | **5 PM** (США, подрядчику привычно) |
| Q18 | Email / Correo | Email везде / Correo в ES | **Email** (всюду) |
| Q19 | «Разбор» / «Требует внимания» | Требует внимания / Разбор | **Требует внимания** (синхронно в трёх языках) |
| Q20 | Вкладка «Ещё» и кнопка «Меню» | Ещё / Меню | **Ещё** (везде) |
| Q21 | Отбойник на угле vs на земле | Отбойник (оба) / Отбойник на угле + Отбойник на земле | **Два слова: «Отбойник на угле» и «Отбойник на земле»** |
| Q22 | Водосток vs труба | Водосток / Труба | **Водосток** (в бригадах говорят оба; для UI одно) [?] |
| Q23 | Выпуск vs воронка (outlet / funnel) | Выпуск / Воронка | **Выпуск** (outlet) и **Воронка** (funnel) — разные детали, оба сохранить [?] |
| Q24 | Dispatcher в ES | Coordinador / Despachador / Dispatcher | **Coordinador** [?] |
| Q25 | Мастер ≠ Сотрудник ≠ Бригада | Мастер = роль, Сотрудник = любой человек команды, Бригада = группа на объекте | **Три слова, три смысла** |
| Q26 | «Материал / Товар», «Работа / Труд» (вид позиции) | Материал / Товар; Работа / Труд | Основатель говорит «товар» и «работа»; код и словарь — «Материал» (1.37) и «Труд» (1.36, Q12); рекомендация аудита — Материал, Работа. Не решено; решает основатель |
| Q27 | «Строка сметы» (спека, DS 1.4.0) против «позиция» | Строка / Позиция | словарь 1.13 и 13.21 запрещают «строка» (→ «позиция»). Спека различает: «позиция» — в каталоге и как объект сметы, «строка» — как называет её код/DS («Строка сметы», «Строки и списки сметы»). Привести DS к «позиции» или изменить 13.21 — решает аудит |
| Q28 | «Дублировать» против «Скопировать» (3.20) | Дублировать / Скопировать | спека: «Дублировать» позицию; словарь: «Скопировать» (текст, ссылка), 1.59 «Дубль» — клиент. Оставить оба с разными объектами? |
| Q29 | Налог: «Налог / Tax» (6.3) и «Sales tax» | в смете — «Налог», клиенту «Sales tax X%» | 6.3 запрещает «Sales tax» вне настроек; спека и PDF клиенту — «Sales tax». Разрешить «Sales tax» в сметах и документах клиента? |
| Q30 | «Закупка / Надбавка / Цена» против «Себестоимость / Наценка / Цена продажи» | 6.29 Надбавка=Markup=ES Margen; 6.30 Закупка=Cost; 6.31 Цена | спека и DS: «Наценка», «Себестоимость» (Cost), «Полная себестоимость» (Total cost), «Цена продажи». Два слова с EN «Cost» (6.30, 6.41); ES «Margen» занят и у Markup, и у Margin. Нужна единая лестница: закупка без налога → полная себестоимость → наценка → цена продажи → заработок |
| Q31 | Кнопка «Новая позиция» | 3.1/3.3: «Новый X» только заголовок, кнопка «Создать X» | спека: кнопка «＋ Новая позиция». Допустить как исключение (добавление в список — 3.2 «Добавить позицию»)? |
| Q32 | «Итог раздела» и «Итого» (6.5) | Итог раздела / Подытог раздела | 6.5 велит писать «Итого»; в DS 1.4.0 и спеке — «Итог раздела», EN «Section subtotal» (подытог). RU: «Подытог раздела»? |
| Q33 | «Свой артикул»: EN «Item code» против «SKU» | Item code / SKU / Own SKU | спека (§6.6 п.11) — «Item code»; американские подрядчики говорят SKU. Поле поставщика — «Supplier SKU» |
| Q34 | «Выберите адрес» против 1.6; «Допуслуга» против 1.12 | Объект / Адрес; Доп. опция / Допуслуга | подсказка обязательного поля в спеке — «Выберите адрес», 1.6 запрещает «Адрес» как имя сущности (в задаче аудита был вариант «Выберите адрес работ»). DS называет необязательное «Допуслуга», словарь 1.12 — «Доп. опция» / Optional extra |

---

## Сколько мест в i18n придётся поправить (грубо, по ключам, пересчёт точнее — `an.py`)

| Раздел | Что править | ≈Мест |
|---|---|---|
| 1 Объекты | Customer→Client (12), Inspection/Evaluación/Осмотр→Выезд на оценку (≈32+5+15), «заявка/lead/cliente potencial» (≈30+23+9 к разбору), «Люди»→Контакты (≈29), «Чаты» (1), «Estimado» (16) | ≈150 |
| 2 Статусы | Одобрена/Подписано (≈6), Отказ/Отклонён (4), Cancelled/Canceled (21), Готово как статус (≈15) | ≈45 |
| 3 Кнопки | «Отменить» (≈14 неверных), «Записать» (≈8), «Убрать/Удалить» (≈11+19), Añadir/Agregar (11), Borrar (3), Reset→Discard/Descartar (≈6), Copy (2) | ≈70 |
| 4 Навигация | План/Schedule/Agenda, Разбор/Triage, Меню/Ещё, «Мои выезды» | ≈10 |
| 5 Роли | Директор/Director (≈37), Tech (1), despachador (4) | ≈42 |
| 6 Деньги | Задаток (4), Аванс/Advance/Anticipo (≈24), Баланс (≈3), Итог (4) | ≈35 |
| 7 Время | 17:00 (5), «дн»/«дн.» (≈4), окно прибытия | ≈10 |
| 8 Контакты/адрес | Телефон/Мобильный (2), email/correo | ≈6 |
| 9 Данные/сеть | очередь/queue/cola (≈12), sync (≈13), Offline (6) | ≈30 |
| 10 Единицы | ft/фт/pies (≈9), шт/ea/u (3), «Сумма, $» | ≈15 |
| 11 Gutters | «Отбойник», «Воронка/Выпуск», скобка «(Gutters)», ES «Estimado» в `mod.gutters.est.*`, «Mill», «Planta/Piso» | ≈25 |
| 12 Фразы | «Не получилось» вариации (≈10), «!» (4), многоточия | ≈25 |
| 13 Запреты | пересечение с другими разделами; сервер (≈41 → 10 осмысленных замен) | ≈10 |
| 14 Клиенту | `vf.msg.*`, `visitP2.msg.*`, `mny.msg.*`, `intake.title`, `portal.*` ES «evaluación» | ≈20 |
| **Итого (без пересечений)** | | **≈400–500 ключей из 3356 (12–15 %)** |

Оценка по таблице: до проверки скриптом по каждому языку отдельно. EN/ES-пары в одних и тех же ключах считаются один раз.
