-- After t14 on a database with data: the guard is for new rows only — an old job keeps its status and still moves on.
do $$
begin
  if (select status <> 'scheduled' from public.jobs where id = 'cf473000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106046000: an old job changed';
  end if;
  update public.jobs set status = 'in_progress' where id = 'cf473000-0000-0000-0000-000000000001';
  if (select status <> 'in_progress' from public.jobs where id = 'cf473000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106046000: an old job does not move on';
  end if;
end $$;
\echo 'upgrade 20261106046000 old jobs untouched ok'
