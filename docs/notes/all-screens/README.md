# Все экраны GoRix (#2974)

Страница-артефакт: каждый экран приложения снимком 390 (светлая и тёмная), под ним поле «Замечание».

- `index.html` — опубликованная страница (собрана из `page.tpl.html` + `catalog.json`).
- `catalog.json` — экраны: `id`, `route`, `title`, `group`, `file`, `note`; `missing` — экраны без снимка и почему.
- `shots/<file>__light|dark.jpg` — снимки 390×844 при deviceScaleFactor 2, сборка `main` d1e6f61, время фотографа (20.11.2026 12:00 LA), роль директор, язык RU.

Замечания — в базе артефакта, коллекция `remarks`, документ на замечание:
`{screen, route, title, text, theme, createdAt, status, issue, link, reply, shotCommit}`;
`status`: `new` (Отправлено) · `accepted` (Принято) · `in_work` (В работе #issue) · `pair_ready` (Пара готова — смотрите, `link` — https-ссылка на пару) · `merged` (Влито). Руководитель меняет `status`/`issue`/`link`/`reply` через `ArtifactData update`.

Ссылка: https://claude.ai/artifact/AMgckKfbPgNmcpqunXqbfU · поле `screen` = `id` из `catalog.json` (например `today`, `estimate_new_id_e6`).

Переснять: `npx expo export --platform web` в `apps/mobile`, затем пакетом через `scripts/shot/web.cjs` (`shootWeb`) по маршрутам `catalog.json`.
