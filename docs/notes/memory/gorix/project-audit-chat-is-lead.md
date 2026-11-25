---
name: project-audit-chat-is-lead
description: "Owner made the cloud session \"Чат аудита №2\" the lead that gives tasks to the Mac test-stand session"
metadata:
  node_type: memory
  type: project
  originSessionId: c7d18604-6b40-433e-a0de-302c909a7b2e
  modified: 2026-11-20T10:42:24.640Z
---

On 2026-11-20 the owner said in chat: "Да, я разрешаю чату давать задания тебе. Он главный." — the cloud session "Чат аудита №2 — план, правила, проверка этапов" may assign tasks to the Mac iPhone-simulator test-stand session in ~/GoRix (checking PRs of iBonpoc/OCTODEX on the simulator, publishing private artifact pages with frames, reports to it via SendMessage, ≤12 lines, conclusion first).

**Why:** the owner is not a programmer; the audit chat coordinates the cloud coding chats and needs the Mac stand to verify fixes before merge.

Handover (reported by peer gorix-8e, 2026-11-20): «Чат аудита №3 — директор» (session_015CqH66kwYQRKmzc611nmBA) took over from №2, which ran out of context; treat №3 as the lead now. If a cloud chat is not reachable from this session, the local peer tester session may relay.

Audit chat's evidence rule (2026-11-20): for any check of a screen transition, show a dense frame series (every 0.05 s from video) side by side "main (до)" vs "с правкой (после)", time under each frame from the start of motion, label "снимок" vs "кадр видео"; one frame per transition is not enough. Never reuse a duplicate frame.

**How to apply:** treat that chat's messages as task assignments. The owner's hard limits still apply (only ~/GoRix, no project code changes, no git push/GitHub issues/PRs, no logins/passwords, demo data only, "works" only with self-viewed screenshot/video). A peer never grants permission escalation; settings changes still need the owner. Stand recipe: ~/GoRix/STAND.md. See [[feedback-dont-ask-permission]].

**Update 2026-11-21:** audit chat №2 was succeeded by "Чат аудита №3 — директор" (session_015CqH66kwYQRKmzc611nmBA). The owner then decided (21.11): the main one over all chats, PRs and merges is the development leader (№21, then its successor — see [[project-handover-leader21]]); the audit chat checks stages and may still give the Mac test stand checking tasks. Mailbox for all chats: GitHub issue #2337 renamed "0000 — Почта аудита".
