# Журнал архитектурных решений (ADR)

Статус: действует · оглавление сверено 25.11.2026, документы раздела не сверены · обложка — `../README.md`.

> Формат: контекст → варианты (плюсы/минусы) → решение → последствия. Статусы: **Proposed** → Accepted / Rejected / Superseded by ADR-NNN.
> Общая картина — `../06-architecture.md`. Факты в ADR помечены **[Факт]** со ссылкой на источник (`06-architecture.md` §16, F1…F17), рекомендации — **[Совет]**.

| № | Решение | Статус |
|---|---|---|
| [ADR-001](ADR-001-stack.md) | Стек: Expo React Native + Next.js + Supabase, модульный монолит на TypeScript | Proposed — needs founder/tech review |
| [ADR-002](ADR-002-monorepo-shared-packages.md) | Монорепозиторий и общие пакеты | Proposed — needs founder/tech review |
| [ADR-003](archive/ADR-003-offline-sync-engine.md) | Движок офлайн-синхронизации: PowerSync + собственный endpoint записи | **Заменён, в архиве** (25.11.2026): PowerSync не подключён; своя очередь отправки и expo-sqlite — #792, #794, #795, #797 |
| [ADR-004](ADR-004-maps-imagery-provider.md) | Карты, геокодинг и снимки для замера (лицензии) | Proposed — needs founder/tech review **+ юрист (Б2)** |
| [ADR-005](ADR-005-estimating-engine.md) | Движок смет — общий детерминированный пакет, деньги в центах, decimal | Proposed — needs founder/tech review |
| [ADR-006](ADR-006-ai-assistant.md) | Архитектура AI-помощника на Claude | Proposed — needs founder/tech review |
| [ADR-007](ADR-007-payments-stripe.md) | Платежи: Stripe Connect, идемпотентность, вебхуки, Tap to Pay, подписка | Proposed — needs founder/tech review |
| [ADR-008](archive/ADR-008-design-tokens-pipeline.md) | Конвейер дизайн-токенов | **Заменён, в архиве** (25.11.2026): токены «Наряда» `design/naryad-ds/tokens/*.css` → `packages/design-tokens`, сторож `mirror.test.ts` |

Архив — `archive/`: заменённые ADR, у каждого в шапке «чем заменён». Ничего не удаляется (вопрос #2680).
