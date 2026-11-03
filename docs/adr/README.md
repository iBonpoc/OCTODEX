# Журнал архитектурных решений (ADR)

> Формат: контекст → варианты (плюсы/минусы) → решение → последствия. Статусы: **Proposed** → Accepted / Rejected / Superseded by ADR-NNN.
> Общая картина — `../06-architecture.md`. Факты в ADR помечены **[Факт]** со ссылкой на источник (`06-architecture.md` §16, F1…F17), рекомендации — **[Совет]**.

| № | Решение | Статус |
|---|---|---|
| [ADR-001](ADR-001-stack.md) | Стек: Expo React Native + Next.js + Supabase, модульный монолит на TypeScript | Proposed — needs founder/tech review |
| [ADR-002](ADR-002-monorepo-shared-packages.md) | Монорепозиторий и общие пакеты | Proposed — needs founder/tech review |
| [ADR-003](ADR-003-offline-sync-engine.md) | Движок офлайн-синхронизации: PowerSync + собственный endpoint записи | Proposed — needs founder/tech review |
| [ADR-004](ADR-004-maps-imagery-provider.md) | Карты, геокодинг и снимки для замера (лицензии) | Proposed — needs founder/tech review **+ юрист (Б2)** |
| [ADR-005](ADR-005-estimating-engine.md) | Движок смет — общий детерминированный пакет, деньги в центах, decimal | Proposed — needs founder/tech review |
| [ADR-006](ADR-006-ai-assistant.md) | Архитектура AI-помощника на Claude | Proposed — needs founder/tech review |
| [ADR-007](ADR-007-payments-stripe.md) | Платежи: Stripe Connect, идемпотентность, вебхуки, Tap to Pay, подписка | Proposed — needs founder/tech review |
| [ADR-008](ADR-008-design-tokens-pipeline.md) | Конвейер дизайн-токенов | Proposed — needs founder/tech review |
