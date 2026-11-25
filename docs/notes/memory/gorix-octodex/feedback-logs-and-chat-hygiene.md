---
name: feedback-logs-and-chat-hygiene
description: Длинные логи агенты не читают целиком (фильтры для vitest/e2e/gh/expo/tsc); исполнителя — в архив в час сдачи; ротация руководителя; ежедневная уборка сессий (основатель 21.11.2026)
metadata:
  type: feedback
---

ЛОГИ — никогда целиком: vitest — `--reporter=dot` или `| grep -E "FAIL|Tests "`; e2e — только строки `✗` и итог; GitHub — `--log-failed | grep -E "✗|FAIL|Error" | head` (или лог job через `gh api … --allow-escape-sequences | sed` + grep); expo/metro — в фоне в файл, grep по ошибке; tsc — `| grep error | head`; картинки — только нужный кусок/уменьшенные.
ЧАТЫ — исполнитель сдал задачу → `archive_session` в тот же час; исполнитель на 2–3 задачи, потом памятка и новый; руководитель — ротация при длинном контексте (памятка `docs/ai/HANDOVER-*.md` + память); раз в день — list_sessions/ListAgents и архив простаивающих. gorix-c7 — архивирует только основатель вручную (удалённое управление).

**Why:** основатель 21.11 спросил «контролируешь ли длинные чаты, архивируешь, перезапускаешь? длинные логи — как избавиться?».
**How to apply:** вставлять строку про логи в каждый бриф агенту; правило внести в `docs/ai/WORKER.md` docs-PR после влития #2349. См. [[project-leader22-maestro]], [[feedback-shared-screenshots]].
