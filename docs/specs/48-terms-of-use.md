# 48. Условия использования и политика конфиденциальности: разбор образцов и наш текст (#1533, #1554, #1519)

> Класс К2 по виду работы (только текст), но с правом и деньгами рядом: **юриста США не нанимаем (решение основателя 05.11, #1519); остаточный риск и вопросы «если юрист появится» — §9**. Этап 0 — этот документ. Код, i18n и миграции в этом PR не тронуты: тексты в `src/i18n` переносит исполнитель экранов (зона (г), общий файл `i18n/*` — малым отдельным PR).
> Метки: **[проверено]** — прочитано на странице образца 15.11.2026, цитата дословная; **[не прочитано]** — страница не открылась, текста нет; **[сниппет]** — только выдержка поиска, не дословная цитата, в выводы не идёт; **[код]** — по `origin/main`.
> Цитаты ограничены ~125 знаками (ограничение средства чтения страниц); полный текст — по ссылке.

## 0. Итог

1. Образцов прочитано **2 полностью** (Zoho Invoice, Invoice2go), **1 частично** (Wave — рабочий текст в PDF на стороннем хостинге), **3 не прочитано** (Invoice Simple — 403; Joist — адрес `joist.ai` ведёт на чужой домен, `joist.com` — ошибка 500; Square — 429 дважды). Задание просило 5–6; **закрыто 2 из 6; остальные — задача #1591** — вывод ниже держится на двух текстах и общеизвестной форме, не на шести. Остальные — пересмотреть, когда страницы откроются (§1.4).
2. Что общего у двух прочитанных: «как есть» в верхнем регистре, предел ответственности с нижней границей ($1000 или $100), возмещение убытков пользователем, длина 4 000 и 11 000 слов. «Не юридический и не налоговый совет» есть только у одного (Invoice2go); про **подпись на документах клиента — у обоих ничего**.
3. Наш текст: 11 пунктов, ≈ 600 слов на английском (§4.4), без заглавных блоков, пункты про то, что у образцов отсутствует: подпись, работник/субподрядчик, ИИ, доступ поддержки.
4. Продукт **не называем** «развлекательной, ознакомительной, тестовой платформой» (§3): это неправда о продукте.
5. Правки по задачам: #1554 (`terms.7.b`, `terms.6.b`, `privacy.5.b`), #1519 (фраза о работниках, п.3), #1533 (платформа, не сторона договора; тексты и расчёты справочные).

## 1. Образцы

### 1.1. Что читали

| Сервис | Страница, дата на ней | Статус |
|---|---|---|
| Zoho Invoice | `https://www.zoho.com/terms.html` — «Last updated on: 2nd March 2022.» (общие условия Zoho; отдельных условий Invoice не найдено) | [проверено] |
| Invoice2go (теперь BILL) | `https://invoice.2go.com/terms-of-service/` — «Effective Date: December, 15, 2025.» | [проверено] |
| Wave | `https://www.waveapps.com/legal/terms-of-use` — «Effective as of: January 29, 2025»; на странице ≈200 слов, рабочий текст — PDF на стороннем хостинге, **не читали** | частично |
| Invoice Simple | `https://www.invoicesimple.com/end-user-terms/` | [не прочитано] — 403 на всех адресах сайта |
| Joist | `joist.ai/terms-and-conditions` перенаправляет на `kantiv.com` (чужой домен — не следовали); `joist.com/terms-of-use/` — 500 | [не прочитано] |
| Square Invoices | `squareup.com/us/en/legal/general/contracts-terms`, `…/invoices-plus` | [не прочитано] — 429 дважды |

[сниппет] Поиск показал, что у Square в условиях POS есть «We are not providing any legal, financial, accounting, tax or other professional advice…», а у Square Contracts — «как есть». Это выдержки поиска, а не прочитанный текст: **в выводы не берём**, пока страница не открыта. Square Contracts — это продукт с электронной подписью, самый близкий образец для нашего п.4: прочитать первым.

### 1.2. Дословные цитаты [проверено]

**«Как есть» и отказ от гарантий**

| Сервис | Цитата |
|---|---|
| Zoho | «THE SERVICES ARE PROVIDED ON AN AS-IS-AND-AS-AVAILABLE BASIS.» · «ZOHO EXPRESSLY DISCLAIMS ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED» · «ZOHO MAKES NO WARRANTY THAT THE SERVICES WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR FREE.» |
| Invoice2go §17 | «THE PRODUCT IS PROVIDED "AS IS" AND INVOICE2GO, AND ITS AFFILIATES AND LICENSORS» · «EXPRESSLY DISCLAIM ANY AND ALL WARRANTIES AND REPRESENTATIONS OF ANY KIND» · «THERE IS NO WARRANTY THAT THE PRODUCT WILL BE ERROR FREE» |

**Предел ответственности**

| Сервис | Цитата и что из неё следует |
|---|---|
| Zoho | «EXCEED ONE THOUSAND DOLLARS ($1000) OR THE FEES PAID BY YOU DURING THE TWELVE (12) MONTHS PRIOR TO THE FIRST EVENT» … «WHICHEVER IS HIGHER.» — предел: большее из $1000 и платы за 12 месяцев; исключены косвенные, штрафные убытки, упущенная выгода, потеря данных |
| Invoice2go §18.1 | «IN NO EVENT WILL THE INVOICE2GO PARTIES OR THEIR LICENSORS BE LIABLE TO YOU» · «(A) THE AMOUNT PAID OR PAYABLE BY CUSTOMER TO INVOICE2GO IN THE PRIOR SIX (6) MONTH PERIOD» · «(B) ONE HUNDRED DOLLARS (US$100)» — предел: большее из платы за 6 месяцев и $100 |

**«Не совет»**

| Сервис | Цитата |
|---|---|
| Invoice2go §17 | «THE PRODUCT IS NOT INTENDED TO PROVIDE PROFESSIONAL ACCOUNTING, TAX OR OTHER ADVICE.» (про юридический совет — ничего) |
| Zoho | **не найдено.** Ближайшее — про гарантии, а не про совет: «NO ADVICE OR INFORMATION, WHETHER WRITTEN OR ORAL, OBTAINED BY YOU FROM ZOHO …» |

**Документы составляет пользователь**

| Сервис | Цитата |
|---|---|
| Invoice2go §12.3 | «Invoice2go takes no responsibility and assumes no liability for any Customer Data» · «Customer is solely responsible for Customer Data and the consequences of its use.» |
| Invoice2go §12.1 | «Customer’s use of the Product will comply with all applicable local, state, federal and international laws» |
| Zoho | «You agree to be solely responsible for the contents of your transmissions through the Services.» Про точность счетов и налоговые ставки пользователя — **не найдено** (налоги в тексте — это налоги на подписку Zoho) |

**Подпись**

| Сервис | Результат |
|---|---|
| Zoho | **не найдено** |
| Invoice2go | **не найдено.** Единственное «электронное» — принятие самих условий: «By electronically accepting these Terms or by establishing an Invoice2go account» |

**Возмещение убытков пользователем**

| Сервис | Цитата |
|---|---|
| Zoho | «You agree to indemnify and hold harmless Zoho, its officers, directors, employees, suppliers, and affiliates» |
| Invoice2go §12 | «Customer will indemnify, defend (at Invoice2go’s request) and hold harmless Invoice2go and its affiliates» |

**Форма:** Zoho ≈ 4 000 слов, «плотный юридический английский»; Invoice2go ≈ 11 000 слов, 25 разделов, арбитраж JAMS с отказом от коллективных исков (§23), право Калифорнии; Wave — вводный абзац написан просто («Hey there!»), но и он заканчивается: «Our lawyers wrote the Agreement and that’s the language that counts.» (Wave, Terms of Use, 29.01.2025).

### 1.3. Что из этого следует для нас

1. **«Как есть» и «без гарантий» — стандарт.** Их берём (п.9), но обычным регистром и одной фразой: заглавные блоки читать нельзя, а закон (UCC в США) требует лишь, чтобы отказ от гарантий был **заметным** — это решает юрист (§9, вопрос Ю3).
2. **У обоих предел с нижней границей** ($1000, $100). Наш прежний текст «на бесплатном тарифе — $100» относился к бесплатному тарифу, которого нет (решение основателя 15.11: пробный срок 14 дней, затем платно, README §12 п.1, п.3). Для пробного срока «заплачено за 12 месяцев» = $0, а предел $0 суд вправе не признать. **Предложение аудита:** оставить нижнюю границу $100, без слов «free plan» (п.10). **Решено аудитом 15.11: оставить $100 (Ю2).**
3. **Подпись и статус работника — у образцов пусто.** Эти два пункта — наши, их пишем с нуля (п.3, п.4), по смыслу решений основателя: «классификация работников, часы и документы субподрядчика — ответственность компании, не GoRix» (#1519) и «мы просто платформа… вся ответственность лежит на пользователе» (README §9 п.2).
4. **Возмещение убытков** («indemnify») в образцах есть, у нас нет. Не добавляем: короче и дружелюбнее; но это может быть нужно юристу (Ю4).
5. **Арбитраж, право штата, отказ от коллективных исков** — не берём в этом черновике: это выбор штата и формы суда, решение юриста и основателя (Ю5).

### 1.4. Что дочитать, когда страницы откроются

Invoice Simple (End User Terms), Joist (адрес основных условий приложения подрядчиков — уточнить на сайте; `joist.ai` ≠ приложение), Square (Contracts terms и Invoices Plus), Wave (PDF Terms of Use, продукты Wave Payments / Subscription). Для каждого — те же 7 тем (§1.2). Если прочитанное **опровергнет** вывод §1.3 (например, окажется, что у Square есть явная оговорка про действительность подписи) — правка этой спеки до переноса текста в код.

## 2. Что мы обещаем и откуда это взято (проверка каждой фразы нашего текста)

| Фраза | Источник | Статус |
|---|---|---|
| ИИ выключен, пока владелец не включит; согласие каждого человека отдельно | спека 43 §8.1–§8.2, §10.2 п.5, README §12 п.11 | решено 15.11 |
| ИИ предлагает, меняет только после «Да» | спека 43 §0 п.1, §3 | в спеке |
| Поддержка видит только общие сведения без разрешения владельца | спека 45 §4.1, README §12 п.14 | решено 15.11 |
| Доступ по разрешению владельца 24/72 ч, только чтение, журнал виден владельцу | спека 45 §4.2 | в спеке |
| Экстренный доступ — с записью и уведомлением владельца **после** | README §12 п.15, спека 45 §4.4 | решено 15.11 |
| Копию после закрытия не храним; выгрузка до закрытия; «90 дней» убрать | README §12 п.16, #1554 | решено 15.11 |
| Подпись — запись «кто, когда, что подписано» | спека 46 §0 п.4 (`document_hash`), README §9 п.11 | в спеке |
| «GoRix не использует данные для обучения моделей» | текущее `legal.terms.7.b` [код] | в силе |
| Поставщик ИИ «may keep up to 30 days and may not train models» | спека 43 §8.2 («Anthropic may not train models on Customer Content from Services» [проверено]), §8.4 («до 30 дней» [проверено]); договор обработки данных (DPA) — **[не проверено]**; при нулевом хранении срок в тексте убрать | цитата — в спеке 43; **DPA не проверен** |
| «Выгрузить данные можно в любой момент, пока учётная запись открыта» | спека 45 §6.1, этап 4 | **выгрузки в приложении ещё нет** — п.8 показывается только с функцией (§8.3) |
| «24 или 72 часа, только чтение, журнал виден владельцу» и перечень общих сведений (название, дата регистрации, число людей и документов, версия, отчёты об ошибках без текстов клиентов) | спека 45 §4.2 и §4.1 — сверено дословно 15.11, расхождений нет, правка спеки 45 не нужна. Суммы по документам — в агрегате только если решит основатель (спека 45 §12.2 п.2, ответ 15.11: только общие сведения) | в силе |

## 3. Почему не «развлекательная, ознакомительная, тестовая платформа»

Основатель предложил так назвать платформу, чтобы снять ответственность (README §12 п.18). Позиция аудита, с которой эта спека согласна:

1. **Это неправда о продукте.** GoRix принимает деньги клиентов через Stripe, ведёт сметы, счета, подписи. Описание «развлекательное» вводит в заблуждение. Apple (App Review Guidelines, `developer.apple.com/app-store/review/guidelines`, сверено аудитом 15.11) в п.2.3 «Accurate Metadata»: «…make sure all your app metadata, including privacy information, your app description, screenshots, and previews accurately reflect the app's core experience»; в п.2.3.1(a): «marketing your app in a misleading way… is grounds for removal of your app from the App Store». Правила Stripe о точном описании бизнеса — **[не проверено]**, без цитаты в довод не ставим (при необходимости — сверить со Stripe Services Agreement / Restricted Businesses). Суд смотрит на то, что продукт делает, а не как назван.
2. **Образцы так не делают.** Прочитанные Zoho и Invoice2go называют себя тем, чем являются (сервис счетов, продукт для учёта), и защищаются другими словами: «как есть», предел, «не профессиональный совет». Именно эти слова берём мы.
3. **Что законно даёт ту же защиту:** п.2 (инструмент, не юрист и не сторона договора), п.3 (ответственность пользователя), п.4 (подпись — запись, не заключение), п.9 и п.10.
4. Запрет внести в код: тексты Условий, описание в магазине и подписи в приложении **не используют** слова «развлекательный», «тестовый», «только для ознакомления» о самом продукте. Образцы текстов договора для подрядчика (условия сметы) — «образец, проверьте у своего юриста» — остаются как в решении основателя 15.11 (README §9 п.2 б).

## 4. Наш текст (EN — основной; RU и ES — перевод)

Номера и ключи: `legal.terms.N.t` / `.b`. Прежние 1–8 переупорядочены, новые — 4, 5, 7. Новая нумерация **ломает привязку старых ключей** — исполнитель переименует ключи во всех трёх языках сразу (TypeScript проверяет одинаковость). Версия текста растёт → экран согласия показывает его заново (спека 45 §1, строка «Согласия и Условия»).

### 4.1. English

**1. Who agrees.** These terms are between GoRix and the contracting company that uses it. The person who accepts them confirms they may act for that company.

**2. What GoRix is.** GoRix is business software for contractors: customers, estimates, invoices, payments and schedule. You create and send your documents. GoRix is not a lawyer, an accountant, a tax adviser or a licensed contractor, and it is not a party to your contracts with your customers. Templates, calculations, tax rates and suggestions are reference information, not advice. Check them before you use them.

**3. Your responsibilities.** You are responsible for your licenses and insurance; for your contracts, prices, taxes and deposits being lawful; for the consent of the people you message; and for the accuracy of what you enter. You also decide whether the people who work for you are employees or independent contractors, and you are responsible for their hours, pay, insurance and paperwork. GoRix records what you enter and does not decide this for you.

**4. Signatures.** When your customer approves a document in GoRix, we record who approved it, when, and exactly what the document said. That is a record, not a legal opinion. GoRix does not promise that a signature or a contract is valid or enforceable in your state or for your kind of work. If you are unsure, ask your own lawyer.

**5. The assistant.** The assistant is off until the company owner turns it on, and each person agrees separately before first use. It can make mistakes. It only suggests: nothing changes until you confirm, and you remain responsible for what you confirm and send. To answer, it sends your question and the data it needs to our AI provider, which may keep it for up to 30 days and may not train models on it. You can withdraw your consent in Settings, and the rest of the app keeps working.

**6. Messages.** You are the sender of texts and emails to your customers: you choose the recipient, the time and the words. GoRix may pause sending after complaints.

**7. Support access.** By default our support staff see only general facts about your company: its name, sign-up date, how many people and documents it has, app version and technical error reports. They do not see customer names, documents, photos or amounts. You can allow read-only access for 24 or 72 hours in Settings; every opening is logged and you can see the log. In rare cases — fraud, a security threat or a court order — GoRix staff may open content without your permission. We record it and tell you afterwards, unless the law forbids.

**8. Your data (with export — see §8.3).** Your data belongs to you. GoRix does not sell it, does not share it for advertising and does not use it to train models. You can export it at any time while your account is open. When you close the account we do not keep a copy for export, so export first.

**9. As is.** GoRix is provided as is, without implied warranties and without a promise of uninterrupted work. Keep exports and backups of what matters to you. Measurements in the app are approximate; the contractor verifies dimensions on site before ordering materials and cutting. The app is not responsible for measurement errors. (решение аудита 16.11, слова основателя: «замер примерный — убрать вообще» с экранов; оговорка — только здесь)

**10. Limit of liability.** Our liability is limited to what you paid GoRix in the 12 months before a claim, or $100 if that is more, and we are not liable for indirect losses, except where the law does not allow such a limit.

**11. Changes.** We show the new edition in the app before it takes effect. Material changes are accepted again the next time you sign in.

### 4.2. Русский

**1. Кто принимает.** Эти условия заключаются между GoRix и подрядной компанией, которая им пользуется. Тот, кто их принимает, подтверждает, что вправе действовать от имени этой компании.

**2. Что такое GoRix.** GoRix — программа для подрядчиков: клиенты, сметы, счета, оплаты и расписание. Документы создаёте и отправляете вы. GoRix не юрист, не бухгалтер, не налоговый консультант и не лицензированный подрядчик и не является стороной ваших договоров с клиентами. Шаблоны, расчёты, налоговые ставки и подсказки — справочная информация, а не совет. Проверяйте их, прежде чем использовать.

**3. Ваша ответственность.** Вы отвечаете за свои лицензии и страховку; за законность ваших договоров, цен, налогов и депозитов; за согласие людей, которым вы пишете; за точность введённых данных. Вы же решаете, кто у вас работает — наёмный сотрудник или независимый подрядчик, — и отвечаете за их часы, оплату, страховку и документы. GoRix записывает то, что вы вносите, и этого за вас не решает.

**4. Подписи.** Когда клиент подтверждает документ в GoRix, мы записываем, кто подтвердил, когда и что именно было в документе. Это запись, а не юридическое заключение. GoRix не обещает, что подпись или договор действительны и имеют силу в вашем штате или для вашего вида работ. Сомневаетесь — спросите своего юриста.

**5. Помощник.** Помощник выключен, пока владелец компании его не включит, и каждый человек отдельно соглашается перед первым использованием. Он может ошибаться. Он только предлагает: пока вы не подтвердите, ничего не меняется, а за подтверждённое и отправленное отвечаете вы. Чтобы ответить, он отправляет ваш вопрос и нужные данные нашему поставщику ИИ, который может хранить их до 30 дней и не вправе обучать на них модели. Согласие можно отозвать в Настройках — остальное приложение продолжит работать.

**6. Сообщения.** Тексты и письма клиентам отправляете вы: вы выбираете получателя, время и слова. GoRix может приостановить отправку после жалоб.

**7. Доступ поддержки.** По умолчанию наша поддержка видит только общие сведения о компании: название, дату регистрации, сколько у неё людей и документов, версию приложения и технические отчёты об ошибках. Имена клиентов, документы, фото и суммы она не видит. Вы можете разрешить доступ только для чтения на 24 или 72 часа в Настройках; каждое открытие записывается, журнал вам виден. В редких случаях — мошенничество, угроза безопасности или требование суда — сотрудники GoRix могут открыть содержимое без вашего разрешения. Мы записываем это и сообщаем вам потом, если закон не запрещает.

**8. Ваши данные.** Ваши данные принадлежат вам. GoRix их не продаёт, не передаёт для рекламы и не использует для обучения моделей. Выгрузить их можно в любой момент, пока учётная запись открыта. Когда вы закрываете её, копию для выгрузки мы не храним — выгрузите заранее.

**9. «Как есть».** GoRix предоставляется как есть, без подразумеваемых гарантий и без обещания бесперебойной работы. Сохраняйте выгрузки и копии важного. Замеры в приложении приблизительные; подрядчик проверяет размеры на месте перед заказом материалов и резкой. Приложение не несёт ответственности за ошибки замера. (решение аудита 16.11, слова основателя: «замер примерный — убрать вообще» с экранов; оговорка — только здесь)

**10. Предел ответственности.** Наша ответственность ограничена суммой, которую вы заплатили GoRix за 12 месяцев до претензии, или $100, если это больше; косвенные убытки мы не возмещаем, кроме случаев, когда закон такое ограничение не допускает.

**11. Изменения.** Новую редакцию мы показываем в приложении до вступления в силу. Существенные изменения нужно принять заново при следующем входе.

### 4.3. Español

**1. Quién acepta.** Estos términos son entre GoRix y la empresa contratista que lo usa. Quien los acepta confirma que puede actuar por esa empresa.

**2. Qué es GoRix.** GoRix es software para contratistas: clientes, presupuestos, facturas, pagos y calendario. Usted crea y envía sus documentos. GoRix no es abogado, contador, asesor fiscal ni contratista con licencia, y no es parte de sus contratos con sus clientes. Las plantillas, cálculos, tasas de impuestos y sugerencias son información de referencia, no asesoría. Revíselas antes de usarlas.

**3. Sus responsabilidades.** Usted es responsable de sus licencias y seguro; de que sus contratos, precios, impuestos y depósitos sean legales; del consentimiento de las personas a quienes escribe; y de la exactitud de lo que ingresa. También decide si quienes trabajan para usted son empleados o contratistas independientes, y es responsable de sus horas, pago, seguro y documentos. GoRix registra lo que usted ingresa y no decide esto por usted.

**4. Firmas.** Cuando su cliente aprueba un documento en GoRix, registramos quién lo aprobó, cuándo y qué decía exactamente el documento. Es un registro, no una opinión legal. GoRix no promete que una firma o un contrato sea válido o exigible en su estado o para su tipo de trabajo. Si tiene dudas, consulte a su propio abogado.

**5. El asistente.** El asistente está apagado hasta que el dueño de la empresa lo active, y cada persona acepta por separado antes del primer uso. Puede equivocarse. Solo sugiere: nada cambia hasta que usted confirme, y usted sigue siendo responsable de lo que confirma y envía. Para responder, envía su pregunta y los datos necesarios a nuestro proveedor de IA, que puede conservarlos hasta 30 días y no puede entrenar modelos con ellos. Puede retirar su consentimiento en Ajustes y el resto de la aplicación sigue funcionando.

**6. Mensajes.** Usted es el remitente de los mensajes y correos a sus clientes: elige el destinatario, la hora y el texto. GoRix puede pausar el envío si hay quejas.

**7. Acceso de soporte.** De forma predeterminada, nuestro soporte ve solo datos generales de su empresa: nombre, fecha de registro, cuántas personas y documentos tiene, versión de la aplicación e informes técnicos de errores. No ve nombres de clientes, documentos, fotos ni montos. Puede permitir acceso de solo lectura por 24 o 72 horas en Ajustes; cada apertura queda registrada y usted ve el registro. En casos poco frecuentes — fraude, amenaza de seguridad u orden judicial — el personal de GoRix puede abrir contenido sin su permiso. Lo registramos y se lo decimos después, salvo que la ley lo prohíba.

**8. Sus datos.** Sus datos le pertenecen. GoRix no los vende, no los comparte para publicidad ni los usa para entrenar modelos. Puede exportarlos en cualquier momento mientras su cuenta esté abierta. Al cerrar la cuenta no guardamos una copia para exportar, así que exporte antes.

**9. Tal cual.** GoRix se ofrece tal cual, sin garantías implícitas y sin promesa de funcionamiento ininterrumpido. Guarde exportaciones y copias de lo importante. Las medidas en la aplicación son aproximadas; el contratista verifica las dimensiones en el sitio antes de pedir materiales y cortar. La aplicación no se responsabiliza por errores de medición. (решение аудита 16.11, слова основателя: «замер примерный — убрать вообще» с экранов; оговорка — только здесь)

**10. Límite de responsabilidad.** Nuestra responsabilidad se limita a lo que pagó a GoRix en los 12 meses anteriores a un reclamo, o $100 si es más, y no respondemos por pérdidas indirectas, salvo donde la ley no permita ese límite.

**11. Cambios.** Mostramos la nueva edición en la aplicación antes de que entre en vigor. Los cambios importantes se aceptan de nuevo en el siguiente inicio de sesión.

### 4.3а. Добавка #2169: цены и состав тарифов (18.11.2026) — **текст на юриста**

Новый пункт после «10. Limit of liability», перед «11. Changes» (номер ставит исполнитель экранов при переносе; ключи `legal.terms.N.t/.b` — общий блок i18n через руководителя). Основание: решение основателя 18.11 (подписка Apple, три тарифа; «старым клиентам… цена ещё остаётся для них месяц старая… для новых пользователей сразу же новая цена»), спека 44 ред. 5 §5.4, спека 62.

- **EN.** **Plans and prices.** GoRix is offered as monthly plans billed through the App Store. We may change prices and what each plan includes. A new price applies to new subscribers right away. If you already subscribe, we will tell you in the app at least 30 days before a higher price or a smaller plan applies to you; Apple may also ask for your consent. You can cancel at any time in your Apple ID settings, and your data stays readable and exportable.
- **RU.** **Тарифы и цены.** GoRix предлагается месячными тарифами с оплатой через App Store. Мы можем менять цены и состав тарифов. Новая цена сразу действует для новых подписчиков. Если вы уже подписаны, мы сообщим в приложении не меньше чем за 30 дней до того, как для вас начнёт действовать более высокая цена или меньший состав тарифа; Apple может также попросить ваше согласие. Отменить подписку можно в любой момент в настройках Apple ID; ваши данные остаются доступны для чтения и выгрузки.
- **ES.** **Planes y precios.** GoRix se ofrece en planes mensuales cobrados a través de la App Store. Podemos cambiar los precios y lo que incluye cada plan. Un precio nuevo se aplica de inmediato a los nuevos suscriptores. Si ya está suscrito, le avisaremos en la app al menos 30 días antes de que se le aplique un precio más alto o un plan con menos contenido; Apple también puede pedir su consentimiento. Puede cancelar en cualquier momento en los ajustes de su Apple ID, y sus datos siguen disponibles para leer y exportar.

Пометка: **текст — на юриста** (условия автопродления, требования штатов США к уведомлению о повышении цены и к отмене подписки — [не проверено]; Apple сама показывает свои условия покупки). Тест при переносе: ключи пункта есть в RU/EN/ES, строки «30 days» / «30 дней» / «30 días» на месте.

### 4.4. Проверяемые свойства текста (EN)

- Слов: ≈ 600 (Zoho ≈ 4 000, Invoice2go ≈ 11 000) — цель ≤ 700, сторож в тестах (§6).
- Ни одного слова из ≥ 4 заглавных букв подряд в тексте пунктов; у образцов — сплошные заглавные блоки.
- Каждый пункт ≤ 110 слов, ≤ 6 предложений.
- Слов «entertainment», «informational purposes only», «test platform» нет (§3).

### 4.5. Политика конфиденциальности (`legal.privacy.*`) — правки

Сначала EN; RU/ES — перевод тем же PR. Остальные пункты не меняются.

- **privacy.2.b** — в RU и ES есть английская фраза «Mobile information will not be shared with third parties or affiliates for marketing/promotional purposes.» [код: `ru.ts`, `es.ts`, строки 2279 и далее] — переведена не была. Оставить как отдельное обязательство на английском нельзя: перевести (требование оператора связи, смысл сохранить). EN: «We do not share mobile information with third parties or affiliates for marketing or promotional purposes.»
- **privacy.3.b** — добавить поставщика ИИ: «…and, if your company turns the assistant on, our AI provider, which receives your question and the data needed to answer it for that one request.» Срок хранения у поставщика и способ отзыва — по условиям поставщика (спека 43 §8.5; **не проверено**, заполняется при подключении).
- **privacy.4.b** — «No tracking»: сохранить «нет рекламы и сторонних трекеров», добавить: «The app sends us technical error reports (no customer text) and keeps them 30 days.» (спека 45: `platform.client_errors`, срок 30 дней — §12.2 п.6; **сверить с итоговым текстом приёма ошибок**). Слов «no third-party analytics» не использовать, если выбран внешний сбор ошибок.
- **privacy.5.b** (#1540, #1554) — было: «To delete your account, write to support…». Стало: «You can delete your account in the app (Settings → Delete account). Before it is deleted we tell you what is removed and what the company must keep.» [код: `app/settings/delete-account.tsx` — удаление в приложении уже есть]. «What the company keeps» — тот же список, что на экране удаления (спека 50 §3.1); ссылка на экран — в тексте пункта (спека 50 §12 п.8).
- **privacy.6.b** — по спеке 50 §12 п.8 (одна таблица сроков, спека 50 §6): «While your account is open. When a company is closed, it stays read-only for 30 days so you can export it, then its data is erased; backups are kept no longer than 35 days. Keep your own copies of tax and business records.» Число дней — по ответу на вопрос В3 спеки 50. Прежний текст («we keep only what the law requires for business records…, then delete it») снят: «7 лет на деловые записи» отменено основателем 12.11 (спека 50 §6). С п.8 Условий («копию для выгрузки не храним») согласуется, п.8 не правится. Юристу показать (Ю3).
- **privacy.basis / terms.basis** — «Draft. The final text will be based on the Common Paper Cloud Service Agreement (CC BY 4.0)» остаётся, пока текст не прочтёт юрист; после — заменить на дату и редакцию.

## 5. Чем лучше образца (WORKER.md п.4а)

1. **Как у образцов:** 4 000 и 11 000 слов; заглавные блоки; одна общая юридическая «простыня»; про подпись и статус работника — ничего; про ИИ в Zoho и Invoice2go — не искали (не входило в 7 тем).
2. **Жалобы на образец:** отзывов на сами Условия в этом проходе **не искали** (нет прочтённых источников), поэтому слов жалоб не приводим. Замена — измеримые свойства самого текста (п.3). Если нужны жалобы, это отдельное задание поиска (Reddit, отзывы Apple/Google на «условия»).
3. **Наш вариант и измеримое отличие:** (а) ≈ 600 слов вместо 4 000 и 11 000 — в 7–18 раз короче; (б) нет заглавных блоков; (в) четыре пункта, которых у образцов нет (подпись, работник/субподрядчик, ИИ, доступ поддержки); (г) нет обещаний, которых приложение не выполняет (убрано «90 дней» и «free plan $100»); (д) у каждой нашей обещающей фразы есть строка-источник в спеке или решение основателя (§2).
4. **Чем проверим:** модульный тест текста (длина, заглавные блоки, запрещённые слова, одинаковое число пунктов в EN/RU/ES); e2e на всех 6 видах: экран `/legal/terms` открывается, видны 11 пунктов, прокрутка до конца; проход основателя 15 минут: читает текст на телефоне и отвечает «понятно ли, что за что отвечаю».

## 6. Тесты (для исполнителя экранов, красные до правки)

| № | Что | Вид |
|---|---|---|
| ТУ1 | 11 пунктов в EN, RU, ES; ключи одинаковые | тип (TypeScript) + модульный |
| ТУ2 | EN ≤ 700 слов; пункт ≤ 110 слов; нет слова из ≥ 4 заглавных букв | модульный |
| ТУ3 | в EN/RU/ES нет «90 days/дней/días», «free plan», «entertainment/развлекател», «тестов… платформ» | модульный (сторож текста) |
| ТУ4 | в privacy.2.b RU/ES нет английской фразы | модульный |
| ТУ5 | после смены версии текста экран согласия показывается снова | e2e (`legal`) |
| ТУ6 | `/legal/terms`, `/legal/privacy` на 6 видах | e2e (`08-layouts`) |

| ТУ7 | пока нет функции выгрузки, в тексте п.8 нет слов «export/выгруз/exportar»; после появления — есть | модульный |

Номера пишутся при сборке; сторож — в `apps/mobile/test/` (зона «Проверки»).

## 7. Стыки и карта пути

Стык «Согласия и Условия» (`legal_acceptance`, спека 45 §1): новая версия текста → повторное принятие при входе. Новых статусов и сущностей нет. `docs/15-story-map.md` не меняется. Задачи: #1533 (этот текст), #1554 (устаревшие `terms.6.b`, `terms.7.b`, `privacy.5.b` — закрываются при переносе), #1519 (п.3), #1540 (privacy.5.b — тот же перенос).

## 8. Порядок переноса в код (исполнитель экранов)

1. Дождаться принятия спеки аудитом №2.
2. Один малый PR: `legal.terms.*` и `legal.privacy.*` во всех трёх языках, версия текста +1, сторож ТУ1–ТУ4, e2e ТУ5–ТУ6. Общий файл `i18n/*` — предупредить руководителя и другой чат.
3. Условие: п.5 и п.7 описывают помощника и панель поддержки, которых ещё нет в коде. **Показывать их в приложении можно только вместе с функцией** (иначе Условия обещают то, чего нет). До выхода помощника п.5 не включается, до выхода панели — п.7 (в части «доступ по разрешению» и «экстренный»); до выхода выгрузки (спека 45, этап 4) — п.8 в сокращённой редакции без обещания выгрузки (см. ниже); пункты, описывающие уже существующее (1–4, 6, 8–11, `privacy.*`), идут сразу. Деление отметить в PR.

**Временный п.8 (пока выгрузки нет):**
- EN: «Your data belongs to you. GoRix does not sell it, does not share it for advertising and does not use it to train models. When you close the account we delete it as described in the Privacy Policy.»
- RU: «Ваши данные принадлежат вам. GoRix их не продаёт, не передаёт для рекламы и не использует для обучения моделей. Когда вы закрываете учётную запись, мы удаляем данные так, как описано в Политике конфиденциальности.»
- ES: «Sus datos le pertenecen. GoRix no los vende, no los comparte para publicidad ni los usa para entrenar modelos. Al cerrar la cuenta los eliminamos como se describe en la Política de privacidad.»

Полный п.8 (с выгрузкой, §4.1–§4.3) включается тем же PR, что выгрузка. Тест ТУ7 (ниже) держит обе редакции.

## 9. Вопросы

**Основателю — решено, остаточный риск записан**
- **Ю1.** Юриста США не нанимаем (решение основателя 05.11, #1519; согласовываем только с Apple). **Остаточный риск:** суд может не признать отказ от гарантий и предел ответственности (в ряде штатов они ограничены), запись подписи может быть оспорена как «не подпись», а формулировки пунктов 4, 5 и 7 не проверены на действие в конкретном штате; текст снижает риск, но не снимает.
- **Ю2.** Нижняя граница предела $100 — **решено аудитом 15.11: оставить** (без слов «free plan»).

**Если юрист появится**
- **Ю3.** Заметность отказа от гарантий («as is» обычным регистром достаточно?); совместимость «копию не храним» и «хранится то, что требует закон».
- **Ю4.** Нужно ли возмещение убытков пользователем (в образцах есть, у нас нет).
- **Ю5.** Применимое право, место суда, арбитраж, коллективные иски — не заполнено.
- **Ю6.** Действительность «записи подписи» (п.4): ESIGN Act / UETA, формулировка «не обещаем действительность».

**Руководителю**
- §8.3 (деление: помощник, поддержка, выгрузка — не раньше функции) — согласовано 15.11.
- Образцы Joist, Invoice Simple, Square, Wave (PDF) — задача #1591; если страницы не откроются, спека так и скажет, без цитат из выдержек.
