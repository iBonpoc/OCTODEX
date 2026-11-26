# Папка `design/` — оглавление

Статус: действует · сверено 26.11.2026 · обложка библиотеки — `../docs/README.md` (раздел 4 «Дизайн»).

**Правила вида и поведения — только `naryad-ds/DESIGN-SYSTEM.md`** (решение основателя 11.11.2026). Всё остальное в этой папке — материалы, из которых он вырос, и черновики. Где они расходятся с дизайн-системой, верна дизайн-система. Папку `naryad-ds/` ведёт чат «Дизайн-система GoRix», сейчас действует заморозка вида #2893. Это оглавление только называет файлы, ничего не переносит.

## Что здесь

| Где | Что это | Статус |
|---|---|---|
| `naryad-ds/` | Дизайн-система «Наряд». `DESIGN-SYSTEM.md` — единственный источник правил вида. `tokens/*.css` — токены, их зеркало `packages/design-tokens` (сторож `mirror.test.ts`). Остальные `.md` папки (`AUDIT`, `BACKLOG`, `CHECKLIST`, `HANDOFF`, `DEVELOPER_*` и др.) правилами не считаются (CLAUDE.md) | действует (`DESIGN-SYSTEM.md`) |
| `brand-gorix-draft/` | Бренд GoRix: знак, логотип, заставка, где показывается бренд. Памятка чата «Бренд» — `HANDOFF.md`, набор — `logo-spec.md`, где бренд и анимация — `usage-map.md`, просмотр — `preview.html`, `usage-preview.html` (11.11.2026) | черновик: переименование в GoRix — отдельной задачей после логотипа и значка |
| `review/` | Дизайн-ревью и аудит контраста 11 стилевых прототипов (`design-review.md`, 03.11.2026), снимки `01…10-*.png`, `contrast-failures.csv`, скрипты `audit-scripts/` | справочно: выбор направления сделан 20.11 (`../docs/design/2026-11-20-direction/06-decision.md`) |
| `*.html` (12 файлов) | Стилевые прототипы начала ноября, которые разбирает `review/design-review.md`: `aurora-bento`, `copper-glass-direction`, `daylight-glass-direction` (Style Lab), `frost-calm`, `graphite-instrument`, `lime-ledger`, `paper-air`, `prism-calm`, `prism-glass`, `satin-copper`, `vision-smoke`, `volt-night` | справочно, не правила |

Материалы выбора вида 20–21.11, каркасы и ревью — в `../docs/design/` (оглавление `../docs/design/README.md`), макеты — `../docs/prototypes/`.
