-- T470 (rule 15: the migration on a database with data).
-- After the developer flag: only the founder's company has it; every other company has it off (the default); the
-- module rows are not touched (trial end, payment, row_version) — the flag lives on the company.
do $$
begin
  if not (select developer_account from public.companies where id = '01a1eb73-a746-728b-b42d-8cfcd8eaeae4') then
    raise exception 'FAILED T470 upgrade 20261117660000: the founder''s company is not marked as the developer''s';
  end if;
  if exists (select 1 from public.companies where developer_account and id <> '01a1eb73-a746-728b-b42d-8cfcd8eaeae4') then
    raise exception 'FAILED T470 upgrade 20261117660000: another company got the developer flag';
  end if;
  if (select count(*) from public.company_modules
       where company_id in ('01a1eb73-a746-728b-b42d-8cfcd8eaeae4', 'c5400000-0000-4000-8000-0000000000f1')
         and trial_ends_at < now() - interval '2 days' and paid_until is null and row_version = 2) <> 2 then
    raise exception 'FAILED T470 upgrade 20261117660000: a module row was changed';
  end if;
end $$;
-- clean up: the module rows (the companies stay, as in the other upgrade checks; the founder's keeps its flag — no test
-- of the main run reads it)
delete from public.company_modules where company_id in ('01a1eb73-a746-728b-b42d-8cfcd8eaeae4', 'c5400000-0000-4000-8000-0000000000f1');
