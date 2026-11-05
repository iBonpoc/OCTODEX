-- After L2 part 2: people of old leads are in contacts; a lead that has a client gave its people to the client.
do $$
declare v_main uuid; v_c text;
begin
  -- open lead: main person with both phones (mobile primary, then work) and the email; the tenant as a second person
  select id into v_main from public.contacts where lead_id = 'cf410000-0000-0000-0000-000000000001' and customer_id is null and is_primary and deleted_at is null;
  if v_main is null then raise exception 'upgrade: open lead has its main person'; end if;
  if (select name || '/' || role from public.contacts where id = v_main) <> 'Open lead/main' then raise exception 'upgrade: main person is the lead itself'; end if;
  select string_agg(number || ':' || label || ':' || is_primary, ',' order by position) into v_c from public.contact_phones where contact_id = v_main and deleted_at is null;
  if v_c is distinct from '(818) 555-0501:mobile:true,(818) 555-0502:work:false' then raise exception 'upgrade: lead phones copied in order, got %', v_c; end if;
  if (select count(*) from public.contact_emails where contact_id = v_main and address = 'open@example.com' and is_primary) <> 1 then raise exception 'upgrade: lead email copied'; end if;
  if (select count(*) from public.contacts c join public.contact_phones p on p.contact_id = c.id
       where c.lead_id = 'cf410000-0000-0000-0000-000000000001' and c.name = 'Tina Tenant' and c.role = 'tenant' and not c.is_primary and p.number = '(818) 555-0503') <> 1 then
    raise exception 'upgrade: lead_contacts person copied with its phone'; end if;
  -- won lead: no people left on the lead; the main person merged into the client's (same phone), its second phone added; the spouse moved
  if (select count(*) from public.contacts where lead_id = 'cf410000-0000-0000-0000-000000000002' and customer_id is null and deleted_at is null) <> 0 then
    raise exception 'upgrade: a won lead keeps no people of its own'; end if;
  select string_agg(number, ',' order by position) into v_c from public.contact_phones where contact_id = 'cf430000-0000-0000-0000-000000000001' and deleted_at is null;
  if v_c is distinct from '(818) 555-0511,(818) 555-0512' then raise exception 'upgrade: client person got the lead''s second phone, not a duplicate, got %', v_c; end if;
  if (select count(*) from public.contacts where customer_id = 'cf420000-0000-0000-0000-000000000001' and deleted_at is null) <> 2 then
    raise exception 'upgrade: client has its person and the spouse'; end if;
  if (select count(*) from public.contacts where customer_id = 'cf420000-0000-0000-0000-000000000001' and name = 'Sam Spouse' and role = 'spouse' and not is_primary and deleted_at is null) <> 1 then
    raise exception 'upgrade: spouse moved to the client, not primary'; end if;
  if (select primary_contact_id from public.customers where id = 'cf420000-0000-0000-0000-000000000001') <> 'cf430000-0000-0000-0000-000000000001' then
    raise exception 'upgrade: the client keeps its main person'; end if;
  if exists (select 1 from public.leads where company_id = 'cf400000-0000-0000-0000-000000000000' and updated_at <> '2026-03-01T00:00:00Z') then
    raise exception 'upgrade: copying people did not touch the leads'; end if;
end $$;
\echo 'upgrade 20261105120000_lead_people ok'
