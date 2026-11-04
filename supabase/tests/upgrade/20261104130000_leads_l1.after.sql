-- The L1 migration numbered old leads in arrival order and did not touch their "last activity".
do $$ begin
  if (select string_agg(number, ',' order by received_at) from public.leads where company_id = 'cf000000-0000-0000-0000-000000000000') is distinct from 'L-0001,L-0002' then
    raise exception 'upgrade: old leads not numbered in arrival order: %', (select string_agg(coalesce(number, 'null'), ',' order by received_at) from public.leads where company_id = 'cf000000-0000-0000-0000-000000000000');
  end if;
  if exists (select 1 from public.leads where company_id = 'cf000000-0000-0000-0000-000000000000' and updated_at <> '2026-03-01T00:00:00Z') then
    raise exception 'upgrade: numbering stamped updated_at on old leads';
  end if;
  if exists (select 1 from public.leads where company_id = 'cf000000-0000-0000-0000-000000000000' and (call_attempts <> 0 or interest is not null or snoozed_until is not null)) then
    raise exception 'upgrade: new lead fields must start empty';
  end if;
end $$;
\echo 'upgrade 20261104130000_leads_l1 ok'
