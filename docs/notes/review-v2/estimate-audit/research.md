# Ресёрч: как лучшие приложения устроили сметы (quotes/estimates) на телефоне

Дата: 22.11.2026. Источники — справка вендоров (help center). «не подтверждено» = в доступной справке ответа нет (не значит, что функции нет). Всё читалось текстом справки; интерфейс приложений вживую не открывался, поэтому «мобильные» детали — только то, что справка явно говорит про mobile.
Охват: Jobber, Housecall Pro (HCP), ServiceTitan (ST), Joist, Markate. Invoice2go / Workiz — не изучались (время).

## 1. Таблица «вопрос × приложение»

### 1. Список смет
| | Что подтверждено | Источник |
|---|---|---|
| Jobber | Колонки (веб): Client, Quote number, Property, Created date, Status, Total. Фильтры: Status, Quote created date (All/Last week/Last 30 days/Last month/This year/Last 12 months/Custom range), Salesperson. Сверху метрики: Overview по статусам, Conversion rate, Sent quotes, Converted quotes. Строка «…»: Convert to Job, Archive, Delete. Массово (только admin): Bulk Archive, Bulk delete. Смахивание/долгое нажатие — не подтверждено. | https://help.getjobber.com/en/articles/quote-list-page-and-key-metrics/ |
| HCP | Статус в колонке Status на вкладке Estimates клиента: «Canceled» (красным), «Pro canceled» (удалена). Удалять массово нельзя. Остальное (колонки, фильтры, смахивание) — не подтверждено. | https://help.housecallpro.com/en/articles/1151198-how-to-cancel-delete-and-restore-estimates |
| ST | Список неоплаченных — Follow Up > Unsold Estimates (офис). Массового «Dismiss» нет (FAQ). Мобильный список смет — внутри задания: Overview → задание → Estimates. | https://help.servicetitan.com/docs/estimates-and-sales-faq ; https://help.servicetitan.com/v1/docs/present-and-sell-estimates-in-servicetitan-mobile |
| Joist | В списке на каждой смете значки: открытый конверт (клиент открыл письмо), перо (подписано); цвет метки срока: серый >7 дней/нет срока, жёлтый <7 дней, красный просрочена. Остальное не подтверждено. | https://support.joistapp.com/en/articles/9212960-how-do-i-know-if-my-client-viewed-or-signed-my-estimate-or-invoice ; https://support.joistapp.com/en/articles/10452332-estimate-expiry |
| Markate | Вкладка My Estimates; у каждого статуса счётчик в скобках. Колонки/смахивание — не подтверждено. | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 2. Карточка сметы, главная кнопка и меню по статусам
| | Подтверждено | Источник |
|---|---|---|
| Jobber | Статусы: Draft, Awaiting Response, Changes Requested, Approved, Converted, Archived. Меню «More» (список одним блоком, **по статусам не разбит — не подтверждено**): Convert to Job, Create Similar Quote, Collect Deposit, Text Message, Email to Client, Mark as Awaiting Response, Mark as Approved, Mark as Archived, Preview as Client, Collect Signature, Print or download PDF. Правила: Draft нельзя архивировать (сначала Mark as Awaiting Response); из Awaiting Response назад в Draft нельзя; Converted — финальный, даже если job удалён; Changes Requested скрыт от клиента, вернуть — Mark as Awaiting Response. | https://help.getjobber.com/en/articles/quote-basics/ ; https://help.getjobber.com/es/articles/quote-approvals/ |
| HCP | Действия: Send (иконка бумажного самолёта), Present (режим предложения), Copy to Job (в iOS — меню «Approve Estimate and Copy to New Job»), «⋯»: Cancel / Delete, Restore estimate (жёлтая плашка сверху отменённой). Одобренную/отклонённую нельзя вернуть в «undecided». | https://help.housecallpro.com/en/articles/7834798-sales-proposal-tool-on-mobile ; https://help.housecallpro.com/en/articles/2883009-copy-estimate-to-job ; https://help.housecallpro.com/en/articles/1151198-how-to-cancel-delete-and-restore-estimates |
| ST | В задании: Present → View → Sell / E-Sign → Accept → «perform work now / later». Статусы: Sold (с замком Lock или без), unsold/open. Dismiss — только офис. | https://help.servicetitan.com/v1/docs/present-and-sell-estimates-in-servicetitan-mobile |
| Joist | iOS: кнопка Invoice вверху (конвертация), «⋯»/More: Duplicate, Delete. Других пунктов не подтверждено. | https://support.joistapp.com/en/articles/9212961-how-do-i-convert-an-estimate-to-an-invoice ; https://support.joistapp.com/en/articles/9212962-how-do-i-duplicate-an-estimate-or-invoice |
| Markate | Статусы: Draft, Submitted, Accepted, Declined by Customer, Inactive, Lost, Invoiced, Archived. Действия: Convert to Work Order, Convert to Invoice (одобренной). | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 3. Редактор: позиции, группы, варианты, налог, себестоимость, скидка, депозит, шаблоны текста
| | Подтверждено | Источник |
|---|---|---|
| Jobber | Позиция — из Products & Services или своя; до 100 позиций; изображения позиций — план Grow. Опциональные позиции (Optional): клиент ставит/снимает галочку в client hub, итог пересчитывается; невыбранные — «Not included», серые в PDF; при конвертации в job выбранные становятся обычными, невыбранные удаляются; процентный депозит пересчитывается. Good/Better/Best как пакетов нет (есть только опциональные позиции) — не подтверждено обратное. Разделы: в форуме упомянуты sections (не справка). Налог: чекбокс «exempt from tax» у товара/услуги; ставка на смету правится только для неё. Себестоимость: Price → Add costs; наценка (markup) пересчитывает цену и наоборот; внизу под итогом — суммарная себестоимость и «estimated margin» = (price − COGS)/price; клиент видит только цену. Скидка: Add a Discount. Депозит: required deposit / график платежей, собирается при одобрении. Текст: client message + contract/disclaimer (по умолчанию из Client Document Settings; «Apply to all future quotes»). Причина архивации — выбор из списка. | https://help.getjobber.com/en/articles/quote-basics/ ; https://help.getjobber.com/es/articles/optional-line-items-on-quotes/ ; https://help.getjobber.com/es/articles/markups-on-quotes/ |
| HCP | Варианты: «+ New option» → «Option from scratch» / «Option from templates»; имена Good/Better/Best; у каждого варианта свои позиции, цены, теги, вложения; в заголовке — может ли клиент одобрить один или несколько. На мобиле: Present — вариант рядом друг с другом, «view option», «Edit estimate settings» (что видит клиент). Таксабл: переключатель Taxable в Price Book + tax category (Automated Sales Tax); в смете можно пометить позицию нетаксируемой. Себестоимость: unit cost всегда скрыта от клиента; наценки материалов — по диапазонам стоимости (material markups). Настройки на смету: номер, дата, сообщение, показ названия/описания/кол-ва/цены/суммы позиций; скрытые суммы всё равно входят в итог. «Write it for me» — ИИ-описание работ. | https://help.housecallpro.com/en/articles/14831533-what-s-new-in-estimates ; https://help.housecallpro.com/en/articles/7834798-sales-proposal-tool-on-mobile ; https://help.housecallpro.com/en/articles/6908612-adjust-individual-estimate-settings-on-web-or-mobile ; https://help.housecallpro.com/en/articles/5578214-how-to-set-up-and-edit-your-material-mark-ups ; https://help.housecallpro.com/en/articles/12805669-automated-sales-tax |
| ST | Позиции из pricebook; в мобиле видны только позиции с активной категорией; шаблоны смет должны быть сгруппированы в Proposal Template (Good-Better-Best), иначе не видны в приложении. Создавать/продавать смету на мобиле могут только «managed» техники. | https://help.servicetitan.com/docs/estimates-and-sales-faq ; https://help.servicetitan.com/roofing/docs/build-estimates-close-sales |
| Joist | Депозит и график платежей — есть (заголовки статей), содержание не получено. Срок действия: «Allow Document to Expire» + Expiration Date, по умолчанию +7 дней; просроченную клиент утвердить не может, но может запросить новую. Пакеты, себестоимость — не подтверждено. | https://support.joistapp.com/en/articles/10452332-estimate-expiry |
| Markate | Пакет с заданным Tax % применяет налог автоматически; ставки: Settings > Tax Rates > +New Rate. Остальное не подтверждено. | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 4. Сохранение и правка отправленной / подписанной
| | Подтверждено | Источник |
|---|---|---|
| Jobber | Явное сохранение: «Save Quote» → после создания «Update Quote»; секции правятся карандашом → Save секции → Save всей сметы; «Save and…»: Send as Email / Send as Text Message / Convert to Job / Mark as Awaiting Response. Отправленную править можно без блокировки. Правка одобренной (итог, депозит, позиции, сообщение, договор, номер) **снимает подпись клиента**; нужна галочка «I understand»; прежняя версия с подписью сохраняется PDF-заметкой; статус остаётся Approved; для новой подписи — Mark as Awaiting Response и отправить заново. | https://help.getjobber.com/en/articles/quote-basics/ ; https://help.getjobber.com/es/articles/quote-approvals/ |
| HCP | Правка отправленной — **не подтверждено**. «Если оценка одобрена/отклонена, вернуть нельзя». | https://help.housecallpro.com/en/articles/14831533-what-s-new-in-estimates ; поиск по справке |
| ST | Проданную смету можно править (Estimates → смета → изменить позиции → Done); пока работа «now» не закрыта; позиции, уже записанные в новый job, править нельзя; после Complete / записи — значок Lock. | https://help.servicetitan.com/v1/docs/present-and-sell-estimates-in-servicetitan-mobile |
| Joist | Правка после подписи — не подтверждено (справка отсылает к другим статьям). | https://support.joistapp.com/en/articles/9212960-how-do-i-know-if-my-client-viewed-or-signed-my-estimate-or-invoice |
| Markate | Править до отправки, клонировать, пересдать клиенту (resubmit). Правка после отправки/принятия — не подтверждено. | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 5. Удаление / архив / отзыв / дубль / смена клиента / перевод
| | Подтверждено | Источник |
|---|---|---|
| Jobber | Archive (с причинами: chose a competitor, no longer needed, customer unresponsive, project postponed, price too high, scheduling conflict, scope or service mismatch, trust or credibility concerns); Delete; Create Similar Quote (копирует позиции, сообщение, вид клиента, название, договор, депозиты, скидки); смена клиента: «Change» в блоке клиента; Convert to Job (позиции, себестоимость, скидка, налог переходят; статус → Converted). Отзыв ссылки — не подтверждено; архив скрывает от клиента (client hub). | https://help.getjobber.com/en/articles/quote-basics/ ; https://help.getjobber.com/en/articles/quote-list-page-and-key-metrics/ |
| HCP | Cancel (опция «Notify customer» — письмо/SMS; подтверждение «Yes, Cancel the Option») — запись остаётся; Delete (в 2026 справке: «Deleted estimates can't be recovered» vs. старая статья про Restore — расходятся: в старой «Restore estimate» есть, в новой нет); номер удалённой не переиспользуется; Copy to Job (одобряет и копирует). | https://help.housecallpro.com/en/articles/1151198-how-to-cancel-delete-and-restore-estimates ; https://help.housecallpro.com/en/articles/14831533-what-s-new-in-estimates ; https://help.housecallpro.com/en/articles/2883009-copy-estimate-to-job |
| ST | Удалять не рекомендуют; вместо — Dismiss (всю возможность или отдельную смету) в Follow Up > Unsold Estimates; массово нельзя. | https://help.servicetitan.com/docs/estimates-and-sales-faq |
| Joist | Delete: More → Delete → подтверждение; **необратимо**, ссылка клиента перестаёт работать; рекомендуют сохранить копию. Duplicate: ⋯ → Duplicate (открывается копия в режиме правки). Convert: кнопка Invoice. | https://support.joistapp.com/en/articles/9212964-how-do-i-delete-an-estimate-or-invoice ; https://support.joistapp.com/en/articles/9212962-how-do-i-duplicate-an-estimate-or-invoice |
| Markate | Edit/Delete/Clone/Resubmit; Archived — статус; Convert to Invoice / Work Order. | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 6. Слова (EN, точные)
| Что | Jobber | HCP | ST | Joist | Markate |
|---|---|---|---|---|---|
| Статусы | Draft, Awaiting Response, Changes Requested, Approved, Converted, Archived | (в списке) Canceled, Pro canceled; смета «approved/declined» | Sold / unsold (open) | (значки) envelope/pen; цвета срока | Draft, Submitted, Accepted, Declined by Customer, Inactive, Lost, Invoiced, Archived |
| Отправка | Save and Send as Email / Text Message | Send (самолёт) / Present | Present, E-Sign → Send Link | Send | Submit |
| Одобрение клиентом | Approve / Approve and Pay Deposit / Request Changes → Send Request | approve (один вариант) | Sell, E-Sign, Accept | sign | Accepted |
| Ручное одобрение | Mark as Approved | Approve Estimate and Copy to New Job | Sell | — | — |
| Перевод | Convert to Job | Copy to Job | perform work now / later | Invoice | Convert to Invoice / Work Order |
| Дубль | Create Similar Quote | — | — | Duplicate | Clone |
| Убрать | Mark as Archived / Archive / Delete | Cancel / Delete / Restore estimate | Dismiss | Delete | Archive / Delete |
| Депозит | Collect Deposit; «Review & Pay Deposit» | — | — | payment schedule | — |
| Шаблоны | Templates → Create Template | Estimate templates / Save as template | Proposal Template | custom contracts | — |
Источники — те же, что в таблицах выше.

### 7. Шаблоны
| | Подтверждено | Источник |
|---|---|---|
| Jobber | Quotes → кнопка **Templates** (шторка) → **Create Template**; только admin, до 30 шт.; в шаблоне: имя, заголовок, позиции, депозит, сообщение клиенту; создаются на веб, в приложении используются. Текст писем/SMS по смете — Settings → Emails & Text Messages. Договор/disclaimer — Client Document Settings. | https://help.getjobber.com/en/articles/quote-templates/ ; https://help.getjobber.com/en/articles/quote-basics/ |
| HCP | **Price book → Estimate templates**; категории обязательны (+ Category), ADD TEMPLATE; шаблон из готового варианта: вкладка Option → ⋯ → **Save as template**; доступ — admin или право «Update company account info». | https://help.housecallpro.com/en/articles/8168484-estimate-sales-proposal-templates |
| ST | Шаблоны смет → группируются в Proposal Template; без группы в приложении не видны. | https://help.servicetitan.com/docs/estimates-and-sales-faq |
| Joist | Custom contracts (отдельная статья, содержание не получено); email messages — настраиваются. | https://support.joistapp.com/en/collections/9198032-sending-and-managing-estimates-and-invoices |
| Markate | «Шаблон: макет, логотип, условия (terms)» — общие слова, детали не подтверждены. | https://markate.freshdesk.com/support/solutions/articles/14000159887-estimates-faq |

### 8. Налог поставщика в себестоимости (подрядчик — конечный потребитель)
- **Как устроено в США (вторичные источники, юрист/CPA нужен):** при lump-sum контракте подрядчик — конечный потребитель материалов, платит налог поставщику, и он фактически часть себестоимости материала (закладывается в цену до наценки); при separated contract подрядчик — ретейлер, налог поставщику не платит (resale/exemption certificate) и взимает налог с клиента на материалы; оборудование — налог при покупке всегда. Правила зависят от штата — источник пример Техас: https://comptroller.texas.gov/taxes/publications/94-157.php ; https://texas.public.law/statutes/tex._tax_code_section_151.056 ; пересказ: https://freemanlaw.com/texas-sales-and-use-tax-rules-for-construction-related-services/ (не подтверждено для других штатов).
- **Jobber:** на строке есть cost, markup, price; налог — на уровне «exempt from tax» у товара и ставка на смету. **Считается ли налог поставщика в cost — справка не говорит; поля «налог в себестоимости» нет — не подтверждено.** https://help.getjobber.com/es/articles/markups-on-quotes/
- **HCP:** Taxable toggle + tax category в Price Book; Automated Sales Tax берёт ставку по адресу клиента; в смете позицию можно сделать нетаксируемой. Налог поставщика в cost отдельно не описан — не подтверждено. https://help.housecallpro.com/en/articles/12805669-automated-sales-tax ; https://help.housecallpro.com/en/articles/16300040-assigning-tax-categories-to-your-price-book-items
- ST / Joist / Markate — не подтверждено.
- Вывод: ни один из изученных не показывает «налог поставщика» отдельной строкой; практика — вписывать его в unit cost вручную.

### Apple iOS (что взять)
| Приложение | Подтверждено | Источник |
|---|---|---|
| Почта | Быстрый левый свайп по письму = дефолтное действие (Trash или Archive — настраивается в настройках аккаунта); долгое нажатие на письмо → меню с Trash Message; Trash — отдельный ящик, оттуда Mailbox → переместить обратно; в iCloud хранится не дольше 30 дней. | https://support.apple.com/en-us/102428 ; https://support.apple.com/guide/iphone/delete-and-recover-emails-iphb02be90ba/ios |
| Заметки | Удалить: свайп влево → Delete или долгое нажатие → Delete; уходит в Recently Deleted на 30 дней; восстановить: свайп → Move; навсегда: свайп → Delete → «Delete Note». Общую заметку, чужую, из списка убирает без Recently Deleted. | https://support.apple.com/guide/iphone/delete-and-recover-notes-iph904eee369/ios |
| Файлы | Deleted → Recently Deleted (Locations), 30 дней; восстановление: долгое нажатие → Recover или More → Select; возвращается на прежнее место; удаление из Recently Deleted — сразу и навсегда. | https://support.apple.com/en-us/104953 |
| Фото | Recently Deleted 30 дней; открывается через Face ID/passcode; Recover; shake-to-undo — не подтверждено. | https://support.apple.com/en-us/124460 ; https://support.apple.com/en-us/104967 |
«Назад»/«⋯» в Apple — по справке не проверялось, не подтверждено.

## 2. Общие шаблоны отрасли (делают все или почти все)
1. Статус-конвейер: черновик → отправлена → (просмотрена) → одобрена/отклонена → конвертирована в job/invoice; плюс архив. «Конвертирована/Invoiced» — терминальный.
2. Отправка = автоматическая смена статуса (Jobber: Draft → Awaiting Response при отправке).
3. Клиент одобряет сам (ссылка, подпись) либо подрядчик ставит «одобрено» вручную (Jobber Mark as Approved; HCP Approve Estimate and Copy to New Job; ST Sell на планшете).
4. Один главный перевод: смета → job (Jobber Convert to Job; HCP Copy to Job; Markate Convert to Work Order) или → invoice (Joist, Markate).
5. Себестоимость и наценка скрыты от клиента (Jobber, HCP «unit costs always stay hidden»).
6. Дубль есть везде (Create Similar Quote / Duplicate / Clone), смена клиента — в самой смете.
7. Варианты для клиента: Good/Better/Best у HCP и ST, опциональные позиции у Jobber; клиент выбирает, итог пересчитывается.
8. Шаблоны и каталог (price book) — основной способ набрать позиции; шаблоны создают на вебе, на мобиле только пользуются (Jobber, ST).
9. Депозит задаётся на смете и собирается при одобрении (Jobber).
10. «Не удалять — отменять/закрывать»: ST прямо рекомендует Dismiss вместо Delete; HCP Cancel сохраняет запись; Jobber Archive с причиной.
11. Налог — на позицию (taxable/exempt) + ставка по адресу/смете.

## 3. Где расходятся
- **Правка отправленной/одобренной:** Jobber — разрешает, но при одобренной снимает подпись, показывает «I understand» и хранит старую версию PDF; ST — разрешает до записи в job, потом замок; HCP — одобрение необратимо, правка не описана. Нет приложения с «новой версией v2» по справке.
- **Удаление:** Joist — безвозвратно, сразу; HCP — Cancel + Delete (состыковка «Restore» устарела); Jobber — Delete есть в «…», корзины не описано; ST — Dismiss.
- **Варианты:** HCP/ST — полноценные пакеты со сравнением («Present»); Jobber — только опциональные позиции.
- **Статусы:** у Jobber 6 (с Changes Requested), у Markate 8 (Inactive/Lost авто), у HCP фактически «approved/declined/canceled».
- **Мобильная правка:** Jobber — шаблоны только с веба; HCP — новая веб-версия смет не затрагивает мобильную («work the same as before»); ST — править смету на мобиле могут только managed techs.
- **Массовые действия:** Jobber только admin и только на веб-списке; HCP/ST — нет.

## 4. Лучшее у Apple, что стоит взять
- **Один свайп = одно предсказуемое действие**, настраиваемое (Почта: Trash или Archive).
- **Долгое нажатие дублирует свайп**: те же пункты в контекстном меню (Заметки: Delete и по свайпу, и по удержанию; Файлы: Recover по удержанию).
- **Recently Deleted 30 дней для всех типов** (Заметки, Файлы, Фото, Почта) — «Удалить» всегда обратимо; навсегда — отдельное явное действие в этом же разделе (подтверждение «Delete Note»).
- **Восстановление возвращает на прежнее место** (Файлы).
- Чужое/общее убирается без корзины (Заметки) — аналог «убрать у себя».
- Закрытый раздел корзины (Фото — Face ID) — для чувствительного.

## 5. Выводы
См. краткий ответ в сообщении. Главное ограничение ресёрча: справка мобильных приложений мало описывает смахивание/долгое нажатие у Jobber/HCP/Joist — не подтверждено; Invoice2go и Workiz не изучались.
