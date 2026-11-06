-- «Do not service»: who may set it, and a trace (docs/specs/04-clients-and-properties.md §12.8, security-check 4b-1
-- finding 7). Setting or lifting the mark closes or reopens new work for the client and revokes their estimate links,
-- so only the director and the office do it (owner / admin / office) — the same people as public.revoke_estimate_link.
-- Sales still change the other statuses (archive) as before (customers_update). Every set / lift leaves one line in the
-- client's history: who (actor_id), when, from → to, the reason; no other personal data.
-- The role comes from the caller's membership: inside a security definer function auth.uid() is still the caller.
-- No signed-in user and not an app role = service_role / migrations only (anon through a definer is refused).

create or replace function app.tg_customer_dns_who()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'do_not_service')
     or (tg_op = 'UPDATE' and (old.status = 'do_not_service') is distinct from (new.status = 'do_not_service')) then
    -- the system (service_role, migrations) has no user and is not an app role; anon through a definer function
    -- (the client page) is not the system: current_user is the owner there, the session's role stays «anon»
    if (auth.uid() is not null or coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated'))
       and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
      raise exception 'only the director or the office marks a client «do not service»' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
-- a trigger function: nobody calls it directly (T52), the trigger fires it all the same
revoke all on function app.tg_customer_dns_who() from public, anon, authenticated;
drop trigger if exists t45_customer_dns_who on public.customers;
create trigger t45_customer_dns_who before insert or update of status on public.customers
  for each row execute function app.tg_customer_dns_who();

create or replace function app.tg_customer_dns_trace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'do_not_service')
     or (tg_op = 'UPDATE' and (old.status = 'do_not_service') is distinct from (new.status = 'do_not_service')) then
    insert into public.activities (company_id, subject_type, subject_id, kind, body, meta, actor_id)
    values (new.company_id, 'customer', new.id, 'status', new.status,
            jsonb_build_object('action', case when new.status = 'do_not_service' then 'do_not_service_set' else 'do_not_service_lifted' end,
                               'from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status,
                               'reason', case when new.status = 'do_not_service' then new.do_not_service_reason end),
            auth.uid());
  end if;
  return null;
end;
$$;
-- a trigger function: nobody calls it directly (T52), the trigger fires it all the same
revoke all on function app.tg_customer_dns_trace() from public, anon, authenticated;
drop trigger if exists t92_customer_dns_trace on public.customers;
create trigger t92_customer_dns_trace after insert or update of status on public.customers
  for each row execute function app.tg_customer_dns_trace();
