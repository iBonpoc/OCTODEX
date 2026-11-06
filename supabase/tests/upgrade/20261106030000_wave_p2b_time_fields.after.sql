-- After wave П-2b on a database with data: an old task keeps its due time, has no start / end, is not «all day».
do $$
begin
  if (select due_at is null or starts_at is not null or ends_at is not null or all_day or description is not null
        from public.tasks where id = 'cf422000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106030000: an old task changed';
  end if;
end $$;
\echo 'upgrade 20261106030000 old tasks ok'
