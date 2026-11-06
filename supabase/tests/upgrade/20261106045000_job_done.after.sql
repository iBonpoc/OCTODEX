-- After wave 3c: the stuck job is «in progress» (so the office gets «Работа выполнена?»), the other one is untouched.
do $$
begin
  if (select status from public.jobs where id = 'cf463000-0000-0000-0000-000000000001') <> 'in_progress' then
    raise exception 'FAILED upgrade 20261106045000: a job with a finished visit stayed scheduled';
  end if;
  if (select status from public.jobs where id = 'cf463000-0000-0000-0000-000000000002') <> 'scheduled' then
    raise exception 'FAILED upgrade 20261106045000: a job with its visit ahead was moved';
  end if;
end $$;
