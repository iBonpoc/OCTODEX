# Снимки «Деньги» — origin/main 14fcdbe (22.11.2026), роль director, демо-данные, 20.11 12:00 LA

Все — фотограф `npm run shot`, web-движок. Имя: `экран__состояние__тема-ширина-язык-роль`.

## Вкладка «Деньги» как открывается (/finance — обзор, переключателя НЕТ)
- finance__open__dark-390-ru-director.jpg — 390 тёмная: шапка, 2+3 плитки, «К оплате», «Оплачены сегодня»
- finance__open__light-390-ru-director.jpg — 390 светлая
- finance__scrolled__dark-390-ru-director-s300.jpg — прокрутка вниз
- finance__open__dark-820 / light-820 / dark-1280 — 820 и 1280 (на 1280 в боковой рейке нет «Денег»)
- finance__en__dark-390-en / finance__es__dark-390-es — EN/ES

## После «Все ›» (это уже /invoice — другой экран, появился сегмент Сметы · Счета · Оплаты)
- finance__after-vse__dark-390-ru-director.jpg, finance__after-vse__light-390-ru-director.jpg
- Другие плитки (Ждёт оплаты / Просрочено / Получено / Ещё выставить), жёлтая плитка

## Каждый сегмент (прямой адрес)
- estimates__direct__dark-390 / dark-1280, estimates__scrolled__dark-390-s400
- invoice__direct__dark-390 / dark-820 / dark-1280, invoice__scrolled__dark-390-s400
- payments__direct__dark-390 / light-390 / dark-1280, payments__scrolled__dark-390-s400

## Плитки и меню
- finance__tile-owed (→ /invoice), finance__tile-estimates (→ /estimates), finance__tile-spent (→ /money «Расходы»), finance__tile-deposits (→ /payments)
- invoice__tile-overdue / tile-received / tile-tobill (с экрана счетов: «Получено» → /payments, «Ещё выставить» → /estimates)
- finance__lists-sheet__dark-390 — шторка «Списки денег» (иконка-ползунки в шапке)
- finance__create-menu__dark-390 — меню «＋»
- money__expenses__dark-390 — экран «Расходы» (/money, свой экран с «назад», без сегмента)

## Роли
- finance__sales__dark-390-ru-sales — продажи: плиток «Расходы» нет, «К оплате» есть, «Оплачены сегодня» нет
- finance__dispatcher__dark-390-ru-dispatcher — офис
- finance__tech__dark-390-ru-tech — /finance у техника: тост «Нет доступа…», открывается «Главная»
- estimates__tech__dark-390 / estimates__sales__dark-390 — сметы техника (без сегмента) и продаж
