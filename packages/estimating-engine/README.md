# @octo/estimating-engine

Детерминированный движок смет и денег Octo (ADR-005). Один и тот же код считает на телефоне и на сервере.

- Деньги — целые центы, вся промежуточная арифметика в `decimal.js`, округление round half up.
- `formula.ts` — безопасный язык формул сборок (без eval).
- `gutterParts.ts`, `gutterKits.ts` — детали и работа модуля Gutters из замера (спека 33-gutters-parts, 33-gutters-consumption).
- `estimate.ts` — итоги варианта, налоговые режимы, депозит с лимитом CA, распределение возврата (PRD 05 §7.2, PRD 19, PRD 18 §K).

```
npm install
npm test          # проверочные примеры из PRD как автотесты
npm run typecheck
```

Покрыто: T1–T12, T16–T18, TX1–TX21 (кроме UI-кейсов), G1–G10, примеры A, A0, B, C из PRD 06.
Ещё нет: учёт инвойсов/платежей/возвратов (PRD 18 M1–M26), сроки отказа CA (§L), cut list.
