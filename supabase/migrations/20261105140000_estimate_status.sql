-- Estimate status, wave A (docs/specs/07-estimates.md §4, §2.2 Б; docs/15-story-map.md §5, handoff S8b).
-- The app now shows awaiting_countersign («Ждёт вашей подписи»): the client signed remotely, an employee has not
-- signed for the company yet. "Don't sign — change it" makes a new version, so awaiting_countersign → draft is allowed.
-- sent → draft and viewed → draft (edit after send = new version) are already in 20261104000000_core.sql.
-- No new tables, functions or grants here: nothing to revoke.

insert into app.status_transitions (entity_type, from_status, to_status) values
  ('estimate', 'awaiting_countersign', 'draft')
on conflict do nothing;
