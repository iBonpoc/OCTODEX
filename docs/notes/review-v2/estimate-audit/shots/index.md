# Снимки сметы (390, 94339f9)
01-list-dark · общий список смет, dark · /estimates --theme dark
01b-list-dark-bottom · список смет, низ, dark · /estimates --theme dark --scroll 3000
01-list-light · общий список смет, light · /estimates --theme light
01b-list-light-bottom · список смет, низ, light · /estimates --theme light --scroll 3000
02-client-linda-dark · страница клиента Линда, группа смет · /client/c3 
02-client-linda-light · то же, светлая · /client/c3 --theme light
02b-client-linda-bottom · страница клиента, низ · /client/c3 --scroll 3000
04-card-e2-top · карточка сметы e2 верх · /estimate/e2 
04-card-e2-bottom · карточка сметы e2 низ · /estimate/e2 --scroll 4000
04-card-e6-top · карточка сметы e6 верх · /estimate/e6 
04-card-e6-bottom · карточка сметы e6 низ · /estimate/e6 --scroll 4000
04-card-e1-top · карточка сметы e1 верх · /estimate/e1 
04-card-e1-bottom · карточка сметы e1 низ · /estimate/e1 --scroll 4000
04-card-e5-top · карточка сметы e5 верх · /estimate/e5 
04-card-e5-bottom · карточка сметы e5 низ · /estimate/e5 --scroll 4000
05-card-e6-menu · карточка e6 (sent) меню ⋯ · /estimate/e6 --do click:estimate-screen-more --frames 2 --every 600
06-editor-e6-top-dark · редактор e6 верх · /estimate/new?id=e6 
06-editor-e6-top-light · редактор e6 верх светлая · /estimate/new?id=e6 --theme light
06-editor-e6-menu-dark · ⋯ редактора · /estimate/new?id=e6 --do click:est-menu --frames 2 --every 600
06-editor-e6-menu-light · ⋯ редактора светлая · /estimate/new?id=e6 --theme light --do click:est-menu --frames 2 --every 600
06-editor-e6-addmenu · кнопка добавить (над списком, est-add-layers) · /estimate/new?id=e6 --do click:est-add-layers --frames 2 --every 600
06-editor-e6-secmenu · ⋯ раздела · /estimate/new?id=e6 --do click:est-sec-menu-auto-1 --frames 2 --every 600
06-editor-e6-row-open-dark · раскрытая позиция · /estimate/new?id=e6 --do clicktext:Railing bracket
06-editor-e6-row-open-light · раскрытая позиция светлая · /estimate/new?id=e6 --theme light --do clicktext:Railing bracket
06-editor-e6-row-menu · ⋯ открытой строки · /estimate/new?id=e6 --do clicktext:Railing bracket;click:est-menu-l-e6-5 --frames 2 --every 600
06-editor-e6-bottom-dark · низ: итого, капсула, кнопки · /estimate/new?id=e6 --scroll 5000
06-editor-e6-bottom-light · низ светлая · /estimate/new?id=e6 --theme light --scroll 5000
06-editor-e6-sheet-discount · шторка скидки · /estimate/new?id=e6 --scroll 5000 --do clicktext:Скидка --frames 2 --every 600
06-editor-e6-sheet-deposit · шторка депозита · /estimate/new?id=e6 --scroll 5000 --do clicktext:Депозит --frames 2 --every 600
06-editor-e6-sheet-tax · шторка налога · /estimate/new?id=e6 --scroll 5000 --do clicktext:Налог с продаж --frames 2 --every 600
07-client-page-top · страница клиента /p/<token>, верх · /p/demo0handyman0estimate0000000001 
07-client-page-bottom · страница клиента /p, низ · /p/demo0handyman0estimate0000000001 --scroll 6000
07-client-page-light · страница клиента /p, светлая · /p/demo0handyman0estimate0000000001 --theme light
08-new-blank · новая смета /estimate/new (черновик) · /estimate/new 
08-new-draft-client · новый черновик, клиент Линда выбран (пустой) · /estimate/new --do clicktext:Linda Alvarez
08-new-draft-catalog · новый черновик: позиции из каталога · /estimate/new --do clicktext:Linda Alvarez;clicktext:Позиция --frames 2 --every 600
08-new-draft-picker · черновик: шторка выбора из каталога · /estimate/new --do clicktext:Linda Alvarez;click:est-bar-add --frames 2 --every 700
08-new-draft-menu · ⋯ черновика · /estimate/new --do clicktext:Linda Alvarez;click:est-menu --frames 2 --every 600
08-new-draft-menu-light · ⋯ черновика светлая · /estimate/new --theme light --do clicktext:Linda Alvarez;click:est-menu --frames 2 --every 600
09-editor-e6-terms · заметки и условия (прокрутка до условий) · /estimate/new?id=e6 --scroll est-terms-lang
09-editor-e6-terms-light · то же светлая · /estimate/new?id=e6 --theme light --scroll est-terms-lang

05-card-e6-menu · карточка e6 (sent) меню ⋯ · /estimate/e6 click:estimate-screen-more (dark)

## Не удалось / нет в демо
- Долгое нажатие и смахивание строки сметы: фотограф не умеет жесты (testID est-swipe-* есть, не кликабелен в --do); не снято.
- Статусы draft / awaiting_countersign / declined в демо-данных нет (в seed только sent: e2,e4,e6 и approved: e1,e3,e5; viewed/expired/invoiced — не статусы сметы). Карточка draft недоступна (id нового черновика неизвестен между снимками); снят редактор нового черновика (08-*).
- e1/e3/e5 (approved) — старые сметы без позиций, без «⋯» на карточке; меню approved не снято. Подписанная смета с doc в демо нет.
- Кнопка est-add-layers у пустого черновика появляется только после первой строки; снят est-bar-add (08-new-draft-picker).
- 10-editor-e6-clientview: пункт «Экран для клиента» не кликабелен (скрыт).
- Дата сборки: 94339f9 (main), часы заморожены 20.11.2026 12:00 LA, язык ru.
11-draft-list · список смет с новыми статусами · /estimates  (dark)
11-draft-list-b · список смет, низ · /estimates  scroll 3000 (dark)
12-draft-card-top · карточка черновика ed верх · /estimate/ed  (dark)
12-draft-card-bottom · карточка черновика низ · /estimate/ed  scroll 4000 (dark)
12-declined-card-top · карточка declined (ex) верх · /estimate/ex  (dark)
12-declined-card-bottom · карточка declined низ · /estimate/ex  scroll 4000 (dark)
12-countersign-card-top · карточка countersign (ec) верх · /estimate/ec  (dark)
12-countersign-card-bottom · карточка countersign низ · /estimate/ec  scroll 4000 (dark)
12-approved-signed-card-top · карточка approved-signed (ea) верх · /estimate/ea  (dark)
12-approved-signed-card-bottom · карточка approved-signed низ · /estimate/ea  scroll 4000 (dark)
12-approved-invoiced-paid-card-top · карточка approved-invoiced-paid (ep) верх · /estimate/ep  (dark)
12-approved-invoiced-paid-card-bottom · карточка approved-invoiced-paid низ · /estimate/ep  scroll 4000 (dark)
12-draft-card-top-light · карточка draft верх · /estimate/ed  (light)
12-countersign-card-top-light · карточка countersign верх · /estimate/ec  (light)
12-approved-signed-card-top-light · карточка approved-signed верх · /estimate/ea  (light)
12-approved-invoiced-paid-card-top-light · карточка approved-invoiced-paid верх · /estimate/ep  (light)
12-declined-card-top-light · карточка declined верх · /estimate/ex  (light)
13-list-light-new · список смет со всеми статусами · /estimates  (light)
13-list-light-new-b · список смет, низ · /estimates  scroll 3000 (light)
13-client-linda-new · клиент Линда: группа смет со всеми статусами · /client/c3  (dark)
13-client-linda-new-b · клиент Линда, низ · /client/c3  scroll 3000 (dark)
13-client-linda-new-light · клиент Линда, светлая · /client/c3  (light)
14-press-ec · долгое нажатие строки ec · /estimates press:est-row-ec (dark)
14-swipe-ec · смахивание вправо строки ec (est-row) · /estimates drag:est-row-ec (dark)
12-draft-card-menu · карточка черновика меню · /estimate/ed click:estimate-screen-more (dark)
12-declined-card-menu · карточка declined меню ⋯ · /estimate/ex click:estimate-screen-more (dark)
12-declined-card-menu-light · карточка declined меню ⋯ · /estimate/ex click:estimate-screen-more (light)
12-countersign-card-menu · карточка countersign меню ⋯ · /estimate/ec click:estimate-screen-more (dark)
12-countersign-card-menu-light · карточка countersign меню ⋯ · /estimate/ec click:estimate-screen-more (light)
12-approved-signed-card-menu · карточка approved-signed меню ⋯ · /estimate/ea click:estimate-screen-more (dark)
12-approved-signed-card-menu-light · карточка approved-signed меню ⋯ · /estimate/ea click:estimate-screen-more (light)
12-approved-invoiced-paid-card-menu · карточка approved-invoiced-paid меню ⋯ · /estimate/ep click:estimate-screen-more (dark)
12-approved-invoiced-paid-card-menu-light · карточка approved-invoiced-paid меню ⋯ · /estimate/ep click:estimate-screen-more (light)
12-draft-card-menu-light · карточка draft меню ⋯ · /estimate/ed click:estimate-screen-more (light)

## Дополнение (состояния подложены в localStorage `octo.db.v5` скриптом вне репо; код приложения не менялся)
Клоны e6 (Линда, c3): ed=draft EST-0007, ex=declined EST-0008 (с подписью клиента и причиной), ec=awaiting_countersign EST-0009, ea=approved с подписями клиента и компании EST-0010, ep=approved EST-0011 + работа JOB-0099 + счёт на депозит (оплачен) + финальный счёт (оплачен частично) + 2 платежа. Снимки 11-*, 12-*, 13-*, 14-*.
- Моё прежнее «draft/declined/countersign нет в демо» теперь снято подмешанными данными. Меню карточки approved e1/e3/e5 по-прежнему нет (старые сметы без позиций).
- 14-swipe-ec (drag по est-row-ec) и 14-press-ec (зажатие 900 мс на est-row-ec; открылось меню «Открыть») — получились; est-swipe-* в DOM не находится.
- Отдельного «viewed/expired/invoiced» статуса у сметы нет: «после счёта» показан ep (счета и платежи видны в списках денег).
