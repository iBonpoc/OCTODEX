-- Lead intake: validate activities_kind_check (added «not valid» in 20261108210000 with the new kind 'intake').
-- Its own file = its own transaction: validate takes SHARE UPDATE EXCLUSIVE and does not block reads or writes.
-- The list only grew: every existing row passes.
alter table public.activities validate constraint activities_kind_check;
