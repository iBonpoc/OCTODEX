# GoRix — было | стало (26.11.2026)

Страница: https://claude.ai/artifact/4qpyfr4GYXjaYLkqgn9CeK (просьба основателя 26.11).

- `index.html` — страница; `img/` — снимки 390 × 844, jpg; `ready/` — готовые пары из веток #2931 и #2954.
- Пересобрать: `python3 build.py <лог снимков>`; лог — строки `commit|route|opts|theme|file` от `npm run shot`.
- Снимки: worktree на коммите main до/после влития, `npm run shot -- <route> --theme light|dark --width 390 --repo <worktree>`.

Ловушка фотографа: сборки из нескольких worktree с общим `node_modules` берут один кэш Metro
(require.context в expo-router) — все «сборки» показывают код первой. Собирать каждую с своим `TMPDIR`
(`expo export` в папку `dirFor(repoState(worktree))`), затем `npm run shot -- … --no-build`.
