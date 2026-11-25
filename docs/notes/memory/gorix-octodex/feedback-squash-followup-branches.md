---
name: feedback-squash-followup-branches
description: Ветку, срезанную с PR-ветки, после squash-влития этой PR переносить cherry-pick своих коммитов на origin/main, а не merge origin/main
metadata:
  type: feedback
---

PR в main вливаются squash-коммитом. Если ветка исполнителя срезана с ветки другой PR (например, фотограф #2360 от `design/2344-direction`), после squash-влития той PR `git merge origin/main` даёт ложные конфликты в чужих файлах. Правильно: `git switch -c <ветка> origin/main` + `git cherry-pick <свои коммиты>` (или `git rebase --onto origin/main <старая-база>`).

**Why:** 21.11.2026 руководитель №22 велел фотографу «merge origin/main» после squash #2349 — конфликты в чужих e2e; исполнитель сам сбросил ветку и перенёс свой коммит; основатель заметил и счёл это недоруководством.
**How to apply:** в брифе такой ветки сразу писать «после влития базы — cherry-pick своих коммитов на origin/main». Лучше вообще резать ветки от origin/main. См. [[project-leader22-maestro]].
