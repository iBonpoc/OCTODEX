-- CH2: validate the range checks of visits.checklist_min_photos_before/_after (added «not valid» in 20261108150000).
-- Its own file = its own transaction: validate takes SHARE UPDATE EXCLUSIVE and does not block reads or writes of visits.
-- The columns are new, every value is null: nothing to reject.
alter table public.visits validate constraint visits_checklist_min_photos_before_range;
alter table public.visits validate constraint visits_checklist_min_photos_after_range;
