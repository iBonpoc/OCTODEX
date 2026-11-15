# 43 (приложение). Все действия интерфейса → команда помощника или «нельзя»

Снято по `origin/main` 25973da, ссылки на строки сверены с 0740f35 (15.11.2026) **[код]**: мутации стора `apps/mobile/src/data/store.tsx` и прямые вызовы `src/cloud/*` из экранов. Это исходный список для сторожа покрытия (спека 43 §5); после волны И0 правдой становится реестр `src/commands/`, а этот файл — история.

Уровни: `read` / `undo` (сразу + «Отменить»; **только четыре**: заметка, тег клиента, своя задача, черновик сметы — по ревью безопасности, спека §3.2) / `confirm` (карточка) / `strict` (деньги, клиенту, удаление — карточка с точными данными, не пакетом, не после чужого текста). `screen` — помощник открывает обычный экран с заполненными полями, последнее нажатие делает человек (спека §3.2–§3.3). **Нельзя** — только служебное. Правило: всё с деньгами, отправкой клиенту или удалением — `strict` или `screen` (сторож Т9а).

## 0. Что выяснилось и меняет спеку

1. **Приложение само ничего не отправляет клиенту.** «Отправить» открывает SMS / почту / «Поделиться» телефона или копирует ссылку (`features/sendEstimate.ts:21-40`, `features/estimatePdf.ts:149-170`), стор лишь записывает факт (`touchLead`, `remindInvoice`, `markNotified`, `logMessage`). Сервер только ставит письмо о подписанном договоре в `email_outbox` (`supabase/migrations/20261105350000_email_outbox.sql`), рассылка не собрана. Значит, у помощника отправка — это **открыть готовое сообщение в Сообщениях/Почте**, а нажимает «Отправить» сам человек. Это сильнее, чем двойное подтверждение Octo, и бесплатно.
2. **15 действий идут мимо стора и очереди** (§3): нужны сеть в момент нажатия, «Отменить» нет. Для помощника они либо `strict` с пометкой «только при сети», либо «нельзя».
3. **Права разбросаны:** таблица `routeRoles` (`nav/roles.ts:25-47`), ~60 функций `can*` и **~119 прямых сравнений роли** (48 — в экранах, напр. `const office = role !== "tech"` в `app/jobs.tsx:33`). Где у кнопки нет функции прав, а есть сравнение в экране, волна И0 выносит его в функцию, и на неё ссылаются и экран, и команда. Иначе «права помощника = права кнопки» не проверить.
4. Без «Отменить» в сторе: `voidInvoice`, `sendPurchaseOrder`, `cancelPurchaseOrder`, `readNotices`. Для помощника первые три — `strict`.
5. **Столбец «Функция стора» — не всегда вся кнопка.** Где экран делает работу до и после стора (смета `app/estimate/new.tsx:695-706`, новая работа `app/job/new.tsx:85-128`, новый клиент `app/client/edit.tsx:77-79`, отправка сметы `features/EstimateCard.tsx:426-443`, шаги выезда `app/visit/[id].tsx:95-107`), волна И0 выносит её в функцию действия `features/actions/*`, и команда ссылается на неё (спека §2.1). Список таких кнопок И0 собирает сторожем Т2.
6. Без вызова из интерфейса: `addEstimate`, `payInvoice`, `replyLead`, `checkItem` (только через `toggleCheck`) — команд для них нет (некому соответствовать); сторожу — пометка «без экрана».
7. **Похоже на «учебное» действие** (ревью кода подтвердило: SMS клиенту есть только в `app/job/[id].tsx:111`): кнопка «В пути» на выезде (`app/visit/[id].tsx:221`) показывает тост `visit.etaSent` «Customer notified: technician on the way», но отправки клиенту в приложении и в серверных функциях не найдено (push — только сотрудникам). **[код, на устройстве не проверено]** — задача руководителю (правило 21); помощник такое действие честно называет «отметить: в пути».

## 1. Клиенты, люди, объекты

| Действие (экран) | Функция стора | Команда | Уровень |
|---|---|---|---|
| Новый клиент (`app/client/edit.tsx:77`) | `addCustomer` (+`updateCustomer`) | `client.create` | confirm |
| Изменить клиента | `updateCustomer`, `saveCustomerPeople`, `updateProperty` | `client.update`, `client.people` | confirm («было → станет»; почта и телефон — никогда без карточки); освобождение от налога — strict |
| Теги, новый тег | `setCustomerTags`, `saveTag` | `client.tags`, `tag.create` | undo |
| Статус: архив / не обслуживать | `setCustomerStatus` | `client.status` | confirm |
| Объединить дубли | `mergeCustomers` | `client.merge` | strict (удаляет запись) |
| «Не дубль» | `markNotDuplicate` | `client.notDuplicate` | confirm |
| Объект: добавить, доступ, код ворот, контакты | `saveProperty`, `setGateCode`, `updateProperty` | `property.save`, `property.gate` | confirm (код ворот — только кто видит `canSeeGateCode`) |
| Импорт из файла (`app/client/import.tsx`) | облако, мимо стора | **screen** | массовая запись по файлу; помощник открывает импорт, файл и «Импорт» — человек |
| Отменить импорт (`app/client/imports.tsx:61`) | облако, мимо стора | **screen** | массовое удаление — только рукой на экране истории импорта |
| Позвонить / написать / маршрут | открывает телефон, потом `logCall`/`logMessage` | `client.call`, `client.message` | strict (открывает Сообщения/Почту/звонок с шаблоном; отправляет человек) |
| Заметка: добавить / закрепить / удалить | `addNote`, `updateNote` | `note.add`, `note.pin`, `note.delete` | undo / confirm / strict |

## 2. Лиды

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Новый лид | `addLead` | `lead.create` | confirm |
| Позвонить / SMS / письмо, ответить, напомнить про смету | `touchLead`, `markReminded` | `lead.contact` | strict (открывает Сообщения/Почту/звонок с шаблоном; отправляет человек) |
| Итог звонка | `callResult` | `lead.callResult` | confirm |
| Напомнить мне через… | `saveTask` | `task.save` | undo |
| Записать на осмотр | `bookLead` | `lead.book` | confirm |
| Собрать смету по лиду | `leadEstimateTarget` | `lead.estimateTarget` (часть `estimate.draft`) | confirm |
| Отложить / вернуть | `snoozeLead`, `unsnoozeLead` | `lead.snooze` | confirm |
| Закрыть (проигран, причина) / ждать ещё / вернуть в работу | `closeLead`, `waitMore`, `reopenLead` | `lead.close`, `lead.wait`, `lead.reopen` | confirm / confirm / confirm |
| Сделать клиентом | `convertLead` | `lead.convert` | confirm |
| Поля лида, люди, интерес, назначить | `updateLead`, `saveLeadPeople`, `setLeadInterest`, `assignLead` | `lead.update`, `lead.people`, `lead.interest`, `lead.assign` | confirm |
| Стоимость лида | `setLeadCost` | `lead.cost` | strict (деньги компании; не для мастера) |
| Новый источник | `saveSource` | `source.create` | confirm |
| Веб-форма (`app/f/[token].tsx`) | `lead-intake`, мимо стора | не действие пользователя | это вход клиента; помощник его только читает (чужой текст, спека §8.3) |

## 3. Сметы

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Сохранить смету / черновик по прошлым | `saveEstimate` (+`saveCatalogItem` для новых строк) | `estimate.draft`, `estimate.update` | undo (новый черновик) / confirm (изменить существующую) |
| Найти похожие прошлые | чтение | `estimate.findSimilar` | read |
| Шаблон: сохранить, копировать, переименовать, архив | `saveEstimateTemplate` | `estimateTemplate.save` | confirm |
| Отправить: SMS / почта / ссылка | `saveEstimate` + `sendEstimate`, затем приложение телефона | `estimate.send` | **screen** — `sendEstimate` включает `/p/` до нажатия в Сообщениях [код: `features/EstimateCard.tsx:433`], а подпись компании ставится при отправке (README §9 п.11); помощник открывает шторку отправки (спека §3.4) |
| PDF | файл | `estimate.pdf` | strict (документ уходит наружу через «Поделиться») |
| Отозвать ссылку | `revokeEstimateLink` | `estimate.revokeLink` | strict |
| Категория услуги | `setEstimateCategory` | `estimate.category` | confirm |
| Подпись клиента на телефоне | `signEstimate` | **screen** | подпись — рукой клиента |
| Принять на месте (вариант + подпись) | `approveEstimate` | **screen** | подпись клиента; создаёт работу и счёт на аванс |
| Подписать от компании | `countersignEstimate` | **screen** | подпись — рукой человека |
| Не подписывать — изменить / отказать | `reopenEstimate`, `declineCountersign` | `estimate.reopen`, `estimate.decline` | confirm / strict |
| Записать аванс | `payDeposit` | `estimate.deposit` | strict |
| Моя подпись | `saveMySignature` | **screen** | подпись |
| Портал клиента: принять, оплатить (`app/p/[token].tsx`) | мимо стора | не действие пользователя | это экран клиента |

## 4. Счета и оплаты

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Записать оплату | `recordPayment` | `payment.record` | strict |
| Напомнить SMS / почтой | приложение телефона + `remindInvoice` | `invoice.remind` | strict (сообщение отправляет человек) |
| PDF счёта, «Поделиться» (`features/invoice/InvoiceCard.tsx:83`) | файл, лист «Поделиться» | `invoice.pdf` | strict (документ уходит наружу) |
| Аннулировать (причина) | `voidInvoice` (без «Отменить») | `invoice.void` | strict |
| Выставить счёт (остаток, этап) | `issueInvoice` | `invoice.issue` | strict |
| Возврат (`app/receipt/[id].tsx:196`) | `stripe-refund` / `refund_record`, мимо стора | **screen** | деньги уходят наружу необратимо; помощник открывает квитанцию со шторкой возврата и суммой |
| Зачесть аванс в счёт | `advance_apply`, мимо стора | **screen** | нужна сеть, нет «Отменить» |
| Квитанция `/receipt/:id`: SMS / почта / PDF (`app/receipt/[id].tsx:74-76,86`) | приложение телефона | `receipt.send`, `receipt.pdf` | strict |
| Расход (и скан чека) | `addExpense` | `expense.add` | strict |
| Кто должен, сколько заработал за период | чтение, движок `reports.ts` | `report.run`, `money.owed` | read (только `canOpen(role,"/reports")`) |

## 5. Работы, выезды, расписание

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Новая работа | `addJob` (+`addCustomer`, `saveProperty`, `scheduleJob`) | `job.create` | confirm |
| Назначить выезд работы | `scheduleJob` | `job.schedule` | confirm |
| Завершить работу | `completeJob` | `job.complete` | confirm |
| Строки работы, налог | `saveJobLine`, `removeJobLine`, `setJobTax` | `jobLine.save`, `jobLine.remove`, `job.tax` | strict (сумма договора) |
| Тип, теги, категория | `setJobType`, `setJobTags`, `setJobCategory` | `job.type`, `job.tags`, `job.category` | confirm |
| Заказать материалы | `makeJobOrders` | `job.orders` | confirm |
| «В пути»: SMS клиенту (`app/job/[id].tsx:111`) | только приложение SMS | `visit.onMyWay` | strict (открывает SMS с шаблоном; отправляет человек) |
| Шаг выезда: в пути / на месте / работа / готово | `advanceVisit` | `visit.step` | confirm (см. §0 п.6) |
| Фото до/после | `addPhoto`, `removePhoto`, `retryPhoto` | `photo.add` (из чата), `photo.remove` | confirm / strict |
| Чек-лист: отметить, пропустить, добавить, переставить, из шаблона, удалить | `toggleCheck`, `skipItems`, `addVisitItem`, `moveVisitItem`, `addVisitTemplate`, `editVisitItem`, `removeVisitItem`, `attachItemPhoto` | `checklist.*` | confirm (удалить пункт — strict) |
| Подпись клиента на выезде | `signVisit` | **screen** | подпись |
| Оплата на выезде | `payVisit` | `visit.pay` | strict |
| Смета с осмотра | `leadEstimateTarget` | часть `estimate.draft` | confirm |
| Предупредить клиента | `markNotified`, `logMessage` | `visit.notify` | strict (открывает Сообщения/Почту/звонок с шаблоном; отправляет человек) |
| Перенести, назначить | `rescheduleVisit`, `assignVisit` | `visit.reschedule`, `visit.assign` | confirm |
| Отменить выезд | `cancelVisit` | `visit.cancel` | strict |
| Осмотр на объекте | `addInspection` | `visit.inspection` | confirm |
| Событие календаря: сохранить / удалить | `saveCalendarEvent`, `removeCalendarEvent` | `event.save`, `event.remove` | confirm / strict |
| Пропущенное просмотрено | `reviewVisitMissed` | `visit.reviewMissed` | confirm |
| Геолокация, точки | `setLocationConsent`, `recordVisitPoint` | **screen** (согласие) / не действие (точки) | согласие даёт человек; точки пишет приложение само |
| Расписание на день / неделю | чтение | `schedule.read` | read |

## 6. Задачи, звонки, сообщения

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Задача: новая, сделана | `saveTask` | `task.save` | undo |
| Записать звонок | `logCall` | `call.log` | confirm |
| Сообщение | приложение телефона + `logMessage` | `message.send` | strict (отправляет человек) |
| Уведомления прочитаны | `readNotices` | не действие | служебное, без «Отменить» |

## 7. Каталог, поставщики, заказы

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Позиция каталога: сохранить | `saveCatalogItem` | `catalog.save` | strict (цена меняет все будущие сметы) |
| Убрать из каталога | `removeCatalogItem` | `catalog.remove` | strict |
| Поиск по каталогу | чтение | `catalog.find` | read |
| Поставщик: сохранить, архив, налог на позиции | `saveSupplier`, `setSupplierActive`, `applySupplierTax` | `supplier.save`, `supplier.active`, `supplier.applyTax` | confirm / confirm / strict |
| Заказ: сохранить / отправить (PDF) / отменить / принять | `savePurchaseOrder`, `sendPurchaseOrder`, `cancelPurchaseOrder`, `receivePurchaseOrder` | `po.save`, `po.send`, `po.cancel`, `po.receive` | confirm / strict / strict / confirm |

## 8. Команда, компания, настройки

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Пригласить, повторить, отозвать, отключить (`app/team.tsx`) | в демо — стор (`inviteMember`, `revokeInvite`, `setMemberDisabled`), в облаке — `cloud/team.ts` мимо стора (`app/team.tsx:62,71,304`) | **screen** | права людей; в т. ч. «Поделиться ссылкой приглашения» (`app/team.tsx:176,184`) и «Отправить ещё раз» (`resendInvitation`, `:226`) |
| Сотрудник: должность, номер, право подписи | `updateMember` | **screen** | права людей (право подписи) |
| Профиль компании, контакты, лицензии, часы, пояс, настройки лидов | `saveCompany`, `saveContact`, `removeContact`, `saveLicense`, `removeLicense` | `company.save`, `company.contact`, `company.license` | confirm (удалить — strict) |
| Модули: включить, выключить, настройки | `enableModule`, `disableModule`, `saveModuleSettings` | **screen** | меняет весь вид компании; выключение удаляет данные модуля |
| Чек-листы компании, шаблоны | `setVisitSettings`, `saveChecklistTemplate` | `checklistTemplate.save` | confirm |
| Категории услуг | `saveServiceCategory` | `serviceCategory.save` | confirm |
| Онлайн-оплата Stripe | облако | **screen** | деньги, внешний счёт |
| Заявки с сайта: формы, ключи, принять/отказать | облако | **screen** | ключи доступа; приём чужого текста |
| Уведомления, свои настройки | `setPushKind`, `setPrefs`, `register_push_device` | `prefs.set` (только свои настройки) | confirm |
| Демо: офлайн, сброс; роль; очередь: повтор / выбросить; закрытая компания | `setOnline`, `resetDemo`, `setRole`, `retryOp`, `discardOp`, `dismissRejected`, `dropUnsentIn` | **нельзя** | служебные; «выбросить» теряет данные |
| Выгрузка CSV | файл | `report.export` | strict (выгрузка клиентов наружу) |

## 9. Модуль Gutters (через `moduleOp` → `module.op`)

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Рисунок (жесты на холсте) | `moduleOp` | **screen** | рисует рука; помощник открывает замер |
| Привязать / отвязать замер, новый лид из замера | `relink`, `addLead` | `gutters.link` | confirm |
| Удалить замер | `removeMeasurement` | `gutters.removeMeasurement` | strict |
| Копия замера, точность | `duplicateMeasurement`, `setAccuracy` | `gutters.duplicate`, `gutters.accuracy` | confirm |
| Фото замера | `addPhoto`/`removePhoto` модуля | `gutters.photo` | confirm (удалить — strict) |
| Сделать / обновить смету по замеру | `makeEstimate` (`estimateLink.ts:181`) | `gutters.estimate` | confirm |
| PDF рисунка, цеховой PDF | файлы | `gutters.pdf` | confirm |
| Настройки и цены модуля | `saveModuleSettings`, `saveCatalogItems` | **screen** | правка цен пачкой |

Команды модуля живут в модуле (`src/modules/gutters/commands`, зона (в)) и регистрируются, только когда модуль включён — ядро о гаттерах не знает (правило планирования CLAUDE.md).

## 9а. Пропущенные в первой редакции (аудит №2)

| Действие | Функция | Команда | Уровень |
|---|---|---|---|
| Условия сметы: подставить по умолчанию, при смене клиента (`estimateTerms`, `estimateTermsOnClientChange`) | чтение / часть сохранения сметы | часть `estimate.draft` | как `estimate.draft` (не отдельная команда) |
| Смета PDF (`features/EstimateCard.tsx:89`) | файл | `estimate.pdf` | strict (документ уходит наружу) |
| PDF рисунка и цеховой PDF Gutters | файлы | `gutters.pdf` | strict (документ уходит наружу) |
| Выгрузка CSV отчёта | файл | `report.export` | strict |
| Вызовы `useAuth` из экранов: вход, код, пароль, регистрация, согласие с условиями (`cloud/legal.ts:8`), создание компании, принятие приглашения, выход, забыть устройство | `cloud/auth.tsx` | — | **screen** (§10 ниже) |
| Регистрация push-устройства (`features/pushNative.ts:70`) | RPC | — | не действие (делает приложение) |

## 10. Учётная запись

Вход, регистрация, согласие с условиями, создание компании, принятие приглашения, выход, удаление учётной записи и передача владения — **screen**: помощник может открыть экран, но делает это человек (решения человека о себе; Apple 5.1.1(v)). До входа помощника нет вовсе — нет согласия и учётной записи.

## 11. Итог

| | Число |
|---|---|
| Мутаций стора с вызовом из интерфейса | ~115 (+4 без экрана, +7 служебных) |
| Действий мимо стора | 15 групп |
| Решение «команда» | ~95 команд (read 8, undo 4: заметка, тег, задача, черновик сметы; confirm ~55; strict ~28) |
| Решение `screen` (открыть экран, жмёт человек) | ~25 действий, причина у каждого |
| Решение «нельзя» и «не действие пользователя» | ~12 (служебные, вход клиента, портал) |

Цифры приблизительные (±5): точный счёт даст сторож И0 по типу интерфейса стора (`StoreCtx`, 150 членов).

Не вошли в таблицы выше и должны попасть в реестр как «нельзя» или «не действие»: `refundPaymentDemo`, `applyAdvanceDemo` (демо — нельзя), `addCheckItem` (как `addVisitItem`), `estimateTerms`, `estimateTermsOnClientChange`, `mayMakeEstimateAt`, `loadCostHistory`, `loadPriceHistory`, `unsentIn` (чтение / не действие).
