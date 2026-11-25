# Бриф дизайнеру: круг 1 проверки вида v2 (GoRix)

Приложение — CRM/FSM для подрядчиков США, RN/Expo, телефон 390×844. Макет v2 (утверждён основателем, «макет понравился») — снимки макета `mock/m-*.png` и раскадровки `mock/strip-NN.png`. Наши снимки — сборка 721a1ff. Держимся макета, но где макет хуже — предлагать лучше с обоснованием (Apple HIG, лучшие приложения: Jobber, Housecall Pro, Apple Mail/Reminders/Wallet).

Правила проекта, которые нельзя нарушать: только токены и компоненты дизайн-системы; цвет только для статуса (ok/info/warn/bad/neutral), всегда значок + слово; один жёлтый акцент acc на экране — главное действие; кнопки видимые 40, зона 44; списки — строки GroupRow в одной карточке ListGroup (правило 12, новое решение основателя 21.11); тексты RU/EN/ES; деньги en-US.

Значки разбирает другой человек — по F30/F31/F34/F35 мнение не нужно.

## Находки (слово основателя → что от нас ждут)

### F01 · visit · блокирует
- Что: Главная кнопка выезда обрезана: «Заверши…» вместо «Завершить»
- Макет: «Завершить» целиком (галочка + слово), ширина кнопки ~146 при паре с «Фото» и квадратной кнопкой
- У нас: «Заверши…» с многоточием, кнопка 144 px; то же в светлой теме
- Основатель: — → решить самим (нельзя обрезать главное действие)
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__light-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F02 · client · блокирует
- Что: В строке выезда у клиента время обрезано до «Сегодня 8:…», подпись до «Bathroom rem…»
- Макет: «Сегодня 8:30–12:30», подпись «Bathroom remodel · Alex», справа плашка «Скоро» (≈60 px)
- У нас: плашка «Опаздывает · не выехал» (≈175 px) съела место: «Сегодня 8:…», «Bathroom rem…»; время не прочитать
- Основатель: «это плохо» → чинить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__light-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F03 · client · блокирует
- Что: В тёмной теме в русских словах кривые буквы: «ь» на кнопке выглядит как «Б», над «Смета» и «Остаток» лишние чёрточки
- Макет: «Выставить счёт», «Смета», «Остаток» без искажений (в светлой теме у нас так и есть)
- У нас: «ВыставитБ счёт»; черта под «м» в «Смета» и над «О» в «Остаток»
- Основатель: «может, дефект скриншота? на других нет» → **переснять и проверить**, найти причину (шрифт/снимок/экран)
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F04 · client · блокирует
- Что: Шапка клиента свёрнута, но между ней и карточкой пустая полоса, а полоса вкладок не прилипает под шапкой
- Макет: на 112: строка «← Имя ⌄ ⋯», сразу под ней вкладки «Обзор · Работы…» (прилипшая полоса 44), карточка уехала вверх (strip-10)
- У нас: на 72/112/300 кадры одинаковые: под шапкой пустота ≈58 px (y 52–110), вкладки остаются на y≈320 и не прилипают; экран не прокручивается дальше
- Основатель: «делай как надо» → чинить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h112__dark-390-ru-director-s112__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h112__light-390-ru-director-s112__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/strip-10.png

### F05 · client · блокирует
- Что: Панель «⌄» развёрнута на весь экран и содержит лишнее: контакты, адреса и «Сведения»
- Макет: панель контактов поверх контента: телефон+SMS, почта, адрес, другие люди; строки 48 (мок ≈36 на уменьшенном кадре ×1/0.75), панель короткая, под ней вуаль 50 %
- У нас: панель от y 132 до низа вкладок (≈640 px), строки ≈58, разделы «Контакты · 2», «Адреса · 2», «Сведения (Номер CLT-0001, Откуда…)»; вуали не видно
- Основатель: «окно в окне не сильно полезно, место съедается» → брейншторм: нужна ли, что в ней, какой высоты
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__panel-open__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/strip-11.png

### F06 · plan · желательно
- Что: Время слота написано с AM/PM и плашка шире; стрелка между половинами обрезана
- Макет: «8:30 ▸ 12:30» без AM/PM, плашка ≈100 px, стрелка читается
- У нас: «8:30 AM›  12:30 PM» плотно, у «›» почти нет места, в «1:30› 3:30 PM» «PM» опущено в первой половине
- Основатель: «разбирайся» → решить, показать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F07 · home · желательно
- Что: На 44 pt шапка Главной уже полностью свёрнута, а в макете это середина перехода
- Макет: на 44: большой заголовок ×0,75, прозрачность 0,83, малый заголовок только входит (strip-06)
- У нас: на 44 и 72 кадры одинаковые: только «Сегодня, 20 нояб.», большого заголовка нет
- Основатель: — → решить самим
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h44__dark-390-ru-director-s44__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h72__dark-390-ru-director-s72__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/strip-06.png

### F08 · plan · желательно
- Что: Счётчик у заголовка секции выглядит по-разному: на Плане «06» в тёмной таблетке (с нулём), на Деньгах «2» просто серым справа, на Смете «7» в светлой таблетке рядом
- Макет: Один вид счётчика (CountPill) и одно написание числа
- У нас: План: таблетка «06»; Деньги: голая «2» у правого края; Смета: таблетка «7» с другим фоном
- Основатель: «один вид счётчика, 06 не нужно» → один вид, без ведущего нуля
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/finance__money-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F09 · estimate · желательно
- Что: При прокрутке слова позиций видны сквозь верхнюю строку и по краям нижней карточки «Итого»
- Макет: плашка шапки плотная (plateAlpha 0.92), под плавающим низом полосы нет
- У нас: на y≈45 читается обрезок «Debris haul-away», у нижней карточки «Не заполнено» торчит на y 840
- Основатель: **идея: при прокрутке сворачивать низ «Итого» — не вниз, а вбок, под большой палец, раскрывать по нажатию** → брейншторм с дизайнером, показать варианты
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h300__dark-390-ru-director-s300__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F10 · plan · желательно
- Что: Подпись под именем склеена со статусом и обрезана; одно и то же состояние названо по-разному
- Макет: В макете строка: «Bathroom remodel · Alex», статус отдельной плашкой
- У нас: Опаздывает · в пути · Panel upgrade 200A · V…
- Основатель: «разбирайся» → одно название состояния; не склеивать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F11 · visit · желательно
- Что: Пункт чек-листа обрезан: «Согласовать обьём работ с клиент…»
- Макет: каждый пункт чек-листа в одну строку без многоточия (в макете короткие; длинный — в 2 строки)
- У нас: текст в одну строку с «…» на 3-м пункте, слово «клиентом» потеряно
- Основатель: «с дизайнерами» → текст не обрезать (перенос)
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F12 · client · желательно
- Что: Закреплённая заметка «Gate code…» залита оранжевым на всю карточку и спорит с жёлтой кнопкой «Выставить счёт» — на экране два тёплых акцента; на других экранах тёплой заливки целой карточки нет
- Макет: Одна жёлтая заливка на экран; тихая заметка — тон warn только плашкой/значком
- У нас: Целая карточка заметки в тёплой заливке, в светлой теме — заметный персиковый блок
- Основатель: **«цвет непонятный, не нравится»** → другой вид закреплённой заметки, показать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__light-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F13 · client · желательно
- Что: Разделители строк в панели «⌄» начинаются в разных местах, у строки «Tom Mitchell» линия сдвинута вправо
- Макет: линии на одной левой кромке (strip-11: от иконки)
- У нас: линии у почты и у человека начинаются на x≈48/96 вразнобой, у «Tom Mitchell» обрывается у аватара
- Основатель: — → вместе с F05
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__panel-open__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/strip-11.png

### F14 · visit · желательно
- Что: Внизу подсвечена вкладка «Клиенты», хотя человек пришёл из Плана и в макете подсвечен «План»
- Макет: подсвечен «План» (gold-значок на ряду вкладок)
- У нас: подсвечены «Клиенты»
- Основатель: «логика, думать как пользователь» → решить, показать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F15 · home · желательно
- Что: Плитки «Требует действия» ниже, чем в макете
- Макет: высота плитки ≈111 px, зазор 12
- У нас: высота ≈99 px, зазор 10
- Основатель: «не понимаю, делай правильно» → по макету
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F16 · money · желательно
- Что: Верхние плитки «Должны» и ряд из трёх ниже на ≈12 px, чем в макете
- Макет: большая плитка ≈135 px, ряд из трёх ≈105 px
- У нас: большая ≈123 px, ряд ≈92 px; зазоры 9–10
- Основатель: «решай сам; строки одинаковые или нет — обдумать» → решить вместе с F29
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/finance__money-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-money.png

### F17 · plan · желательно
- Что: Аватары исполнителей в слотах серые и с «VE»/«AP»; в макете цветные пастельные круги «AL»
- Макет: пастельный круг (персиковый, 34 px) с инициалами по сотруднику
- У нас: тёмно-серый круг 28 px «VE», «AP» одинаковый для всех
- Основатель: «как по макету» → по макету
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F18 · visit · желательно
- Что: В строке «назад» на Выезде вместо подписи родителя стоит название работы («Deep clean after move-out»), а у Клиента — «Клиенты»; то же название сразу повторяется в карточке ниже
- Макет: «←» + подпись родителя 15/600 серым (куда вернёт: «План»/«Клиенты»); имя объекта — в крупном блоке
- У нас: Подпись = заголовок работы; родителя не видно, название дважды на экране
- Основатель: «думай как нужно» → решить (см. решение 68: «← План», назад туда, откуда пришёл)
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F19 · plan · желательно
- Что: Выбор «выбранного» устроен по-разному: на Плане выбранный сегмент «День» залит жёлтым, на Клиенте выбранная вкладка «Обзор» — белая/чёрная таблетка
- Макет: Сегмент (36, выбранный жёлтый) и чипы (32) — разные вещи, но на одном экране жёлтого должно быть не больше одного
- У нас: План сразу четыре жёлтых места: сегмент, день 20, таблетка 1:30, линия 12:00 (+ вкладка); Клиент — один жёлтый + белый чип
- Основатель: «как считаешь нужным, с дизайнерами» → единое правило выбранного
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F20 · estimate · желательно
- Что: Один тип списка собран по-разному: позиции сметы — одна карточка со строками и линиями, а на Клиенте, Деньгах и Главной каждая строка — своя карточка
- Макет: Один способ: либо группа строк в одной карточке, либо отдельные; промежуток 8
- У нас: Смета и панель контактов — одна карточка; Клиент/Деньги/Главная — карточка на строку
- Основатель: — → вместе с правилом 12
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F21 · client · желательно
- Что: Закреплённая заметка обрезана многоточием посреди слова
- Макет: Gate code 4512 · small dog
- У нас: Gate code 4512. Small dog in the bac…
- Основатель: — → не резать посреди слова
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F22 · home · желательно
- Что: Адрес в карточке «Дальше» обрезан на середине слова
- Макет: Адрес виден целиком (макет: «Bathroom remodel · 1420 Oak Grove Ave, Pasadena»)
- У нас: Kitchen faucet + garbage disposal · 4512 Ventura Ca…
- Основатель: «делай как надо» → не резать посреди слова
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F23 · home · желательно
- Что: Приветствие и имя на разных языках: макет по-русски, у нас имя латиницей и другая формула
- Макет: Доброе утро, Алекс
- У нас: Добрый день, Alex
- Основатель: «делай как надо» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F24 · home · желательно
- Что: В строке выезда статус «Опаздывает» просочился в подзаголовок и подпись срезана
- Макет: Bathroom remodel · Alex / одно слово статуса
- У нас: Bathroom remodel: vanity, … ; «Опаздывает · в пути · Panel upgrade 200A · Valley»; Deep clean after move-out…
- Основатель: «подпись не должна быть обрезана» → чинить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h300__dark-390-ru-director-s300__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/—

### F25 · client · желательно
- Что: Полоса разделов набор отличается от макета, последняя вкладка срезана без подсказки на «Объ…»
- Макет: Обзор · Работы 2 · Сметы 1 · Счета 2 · Выезды 2
- У нас: Обзор · Работы 2 · Сметы 1 · Счета 2 · Объе…
- Основатель: «делай как в макете» → по макету
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F26 · visit · мелочь
- Что: Слово «Демо» стоит в разных местах шапок: у Главной рядом с датой, у Плана и Денег рядом со строкой даты/месяца, у Клиента после «Клиенты», у Выезда после названия работы, у Сметы — внутри строки статуса
- Макет: Один и тот же приём на всех шапках (рядом с серой строкой над заголовком; в свёрнутой — точка на «←»/аватаре)
- У нас: Шесть вариантов расположения: плашка слева, плашка в строке «назад», слово в конце подзаголовка
- Основатель: «думай как надо» → одно место
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F27 · home · мелочь
- Что: Строка даты на Главной — «пятница, 20 ноября» строчными полностью, на Плане — «Пт, 20 ноября · 6 выездов», на Деньгах — «Ноябрь 2026»
- Макет: Серая строка 13/600 одного вида: «Пт, 20 ноября»
- У нас: Главная: день недели целиком с маленькой буквы
- Основатель: «делай как надо» → одно правило
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F28 · plan · мелочь
- Что: Над списком добавлена плашка «2 опаздывают», которой нет в макете
- Макет: сразу «Выезды сегодня», потом слоты
- У нас: плашка 24 px (y 305–327) сдвигает первый слот на 12 вниз (на 335 вместо 323)
- Основатель: «не знаю, обдумай» → брейншторм
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/plan__plan-h0__dark-390-ru-director__721a1ff.png, /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-plan.png

### F29 · money · мелочь
- Что: Строки счетов чуть выше макета, значок «Срок/Сумма» справа тот же
- Макет: высота строки ≈58, зазор 10
- У нас: ≈61–62, зазор 10
- Основатель: «одинаковые или нет — обдумать» → с F16
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/finance__money-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-money.png

### F30 · home · мелочь
- Что: На плитке и кнопках другие значки
- Макет: «Маршрут» — булавка, «Лиды» — inbox, «Получено» — тренд
- У нас: «Маршрут» — стрелка-навигатор, «Лиды» — коробка, «Получено» — столбики
- Основатель: см. «Значки» → сначала разбор, потом правка
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F31 · estimate · мелочь
- Что: Значки в панели «Позиции» не те, что в макете
- Макет: линейка · слои · книга · «+»
- У нас: линейка · копия · заметка · «+»
- Основатель: — → решить самим
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F32 · estimate · мелочь
- Что: Строки позиций выше макета
- Макет: высота строки 52
- У нас: высота строки 56
- Основатель: **«делай как по макету (52); запиши вопрос, вернёмся позже, напомни»** → 52 + задача-напоминание
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F33 · estimate · мелочь
- Что: Над сметой жёлтая строка «Уже отправлена…» сдвигает всё на 38 px
- Макет: сразу карточка клиента (y≈106)
- У нас: строка 20 px + отступ; карточка клиента на y 115
- Основатель: **«не нравится, когда строка сдвигает всё»** → другое решение (не сдвигать содержимое), показать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

### F34 · home · мелочь
- Что: В нижней панели у «Лиды» нет красного числа 2 и значок другой
- Макет: значок inbox + точка-число «2»
- У нас: значок мишени, числа нет
- Основатель: — → решить самим
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F35 · client · мелочь
- Что: Значок «Замер» не тот, что в макете
- Макет: линейка
- У нас: дом с чертой
- Основатель: — → решить самим
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F36 · home · мелочь
- Что: Жёлтые заливки в светлой теме обведены тёмно-жёлтой линией (кнопка «В путь», «Должны» на Деньгах, «Завершить», «Готово»), в тёмной линии нет
- Макет: Одинаковый вид заливки в обеих темах; без рамок
- У нас: Светлая: рамка 1 px вокруг жёлтого; тёмная: без рамки
- Основатель: «разбирайся с дизайнером, чтобы красиво» → решить, показать
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__light-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/—

### F37 · visit · мелочь
- Что: Прогресс «0 из 4 · 0 %» показан дважды в одной карточке («Работа» и «Чек-лист выезда») с одним значением
- Макет: Прогресс — один раз словами и числом
- У нас: Две строки с одинаковым «0 из 4 · 0 %»
- Основатель: **«дважды не надо, 100%»** → один раз
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F38 · home · мелочь
- Что: Прогресс работы: пробелы и знак процента разъезжаются; значение «0 из 4 · 0 %» при не начатой работе
- Макет: 3 из 5 · 62 %
- У нас: 0 из 4 · 0 %
- Основатель: «разбирайся» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F39 · home · мелочь
- Что: Вторая ячейка тройки не как в макете у не начатого выезда
- Макет: 12 мин / в дороге
- У нас: $1,840 / к оплате
- Основатель: «разбирайся, убедись, что правильно» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/today__home-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-home.png

### F40 · visit · мелочь
- Что: Подпись «Сегодня» с большой буквы в середине строки, в макете день строчными
- Макет: ABC Supply · вчера
- У нас: Home Depot · Сегодня
- Основатель: «не принципиально, как красивей» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/visit_v4__visit-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-visit.png

### F41 · client · мелочь
- Что: Подпись причины шага отличается от макета
- Макет: задаток оплачен, работа идёт
- У нас: задаток оплачен, остаток не выставлен
- Основатель: «разбирайся» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F42 · client · мелочь
- Что: Длительность по-разному записана и не по макету
- Макет: Длит. 1 ч
- У нас: Длит. 1 ч 30 мин
- Основатель: «разберись» → одно правило записи длительности
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__client-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-client.png

### F43 · client · мелочь
- Что: В «Контактах» подписи не по правилам: «Мобильный ★», «Супруг(а)» со скобками; три телефона и счётчик «2»
- Макет: Контакты · 2 — склонения и роли без скобок
- У нас: Контакты · 2 при пяти строках; «Супруг(а)»; «Мобильный ★»
- Основатель: «разберись; в макете тоже могут быть ошибки» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/client_c1__panel-open__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/—

### F44 · money · мелочь
- Что: Способ оплаты пишется по-разному: в подписи строчными, в колонке с заглавной; в макете «карта · 9:12»
- Макет: INV-0104 · карта · 9:12 / Способ Карта
- У нас: INV-0104 · чек · 11:00 AM / Способ Чек; INV-0103 · zelle · 9:40 AM / Zelle
- Основатель: **«как у нас — так правильно»** → оставить наш
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/finance__money-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-money.png

### F45 · money · мелочь
- Что: Сводка «Сметы открыты» с неверным склонением и счётом, не как в макете
- Макет: Сметы открыты $16,552 — «6 смет · 3 ждут ответа»
- У нас: $6,392 — «3 сметы · 3 ждут ответа»
- Основатель: «делай как правильно» → правильное склонение (i18n plural)
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/finance__money-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-money.png

### F46 · estimate · мелочь
- Что: Дата сохранения сокращена с точкой и «чт», не как «сохранено 8:19» в макете; шапка в одну строку тесна
- Макет: Черновик · сохранено 8:19 · Демо
- У нас: Отправлена · сохранено чт, 19 нояб. · Демо
- Основатель: «некрасиво, обдумай» → решить
- Наш снимок: /Users/yuriisurhuchov/GoRix/notes/screens/721a1ff/estimate_new_id_e6__estimate-h0__dark-390-ru-director__721a1ff.png
- Макет: /Users/yuriisurhuchov/GoRix/notes/review-v2/mock/m-estimate.png

## Новые вопросы и идеи основателя (вне 46)
1. **Чипы статусов** («Опаздывает», «не выехал», «Скоро»): обязательно ли с надписью? Может, иначе. И **цвет пилюли «Опаздывает · не выехал» и надписи внутри — неприятный.** → брейншторм; правило 2 («значок + слово») — если меняем, это правка правила основателем.
2. **«Окно в окне»** на Выезде (работа → чек-лист внутри ещё одной карточки) съедает место слева/справа, текст не влезает. → решает дизайнер (не требование основателя), с независимым дизайнером.
3. **Смета по группам:** работы отдельно, материалы отдельно (как на присланном скриншоте основателя).
4. Нижний итог сметы — см. F09.
