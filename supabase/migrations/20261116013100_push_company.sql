-- Spec 42 §14 (wave 4-1, S27, #1673): a push says whose company it is. push_claim (the body of
-- 20261107120000_push_lead_reminders.sql) adds three keys to each row it hands the send-push function: `company` (the
-- outbox row's company), `company_name` and `companies` (how many open companies the recipient is active in — the
-- title says the company only when there are two or more). jsonb: the handler of before reads none of them.
-- Rule 16: the same name, arguments and result type; nothing dropped.

create or replace function public.push_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r       public.push_outbox;
  v_dev   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  -- stuck in «sending» (the function died): back to the queue; with no tries left — failed
  update public.push_outbox
     set status = case when tries >= app.push_max_tries() then 'failed' else 'pending' end,
         error = case when tries >= app.push_max_tries() then 'stuck' else error end,
         next_try_at = now()
   where status = 'sending' and next_try_at < now() - interval '10 minutes';
  -- yesterday's payment is noise: a row older than 24 h is not sent
  update public.push_outbox set status = 'skipped', error = 'expired'
   where status = 'pending' and created_at < now() - interval '24 hours';

  for r in
    select * from public.push_outbox
     where status = 'pending' and next_try_at <= now()
     order by next_try_at, id
     limit v_limit
     for update skip locked
  loop
    -- the person switched this kind off after it was queued (П4)
    if not app.push_enabled(r.company_id, r.user_id, r.kind) then
      update public.push_outbox set status = 'skipped', error = 'off' where id = r.id;
      continue;
    end if;
    -- a reminder that did not go before the working day ended: skipped as «off_hours» — the reminders job makes it
    -- again the next working morning (security-check #305 В)
    if r.kind in ('lead.reminder', 'lead.escalation') and not app.push_in_hours(r.company_id, now()) then
      update public.push_outbox set status = 'skipped', error = 'off_hours' where id = r.id;
      continue;
    end if;
    if not app.push_still_recipient(r) then
      update public.push_outbox set status = 'skipped', error = 'not_member' where id = r.id;
      continue;
    end if;
    -- the phones NOW: after a phone was handed over, the old owner's pushes never reach it
    select jsonb_agg(jsonb_build_object('device_id', d.id, 'token', d.expo_token, 'lang', d.lang) order by d.last_seen_at desc)
      into v_dev
      from public.push_devices d
     where d.user_id = r.user_id and d.revoked_at is null
       -- a retry goes only to the phones it did not reach (security-check #287 №3): a phone with a ticket of this row
       -- already got it
       and not exists (select 1 from public.push_tickets t where t.outbox_id = r.id and t.device_id = d.id);
    if v_dev is null then
      if exists (select 1 from public.push_tickets t where t.outbox_id = r.id) then
        -- every live phone got it on an earlier try
        update public.push_outbox
           set status = 'sent', sent_at = now(), error = null,
               ticket_ids = (select array_agg(ticket_id order by ticket_id) from public.push_tickets where outbox_id = r.id)
         where id = r.id;
      else
        update public.push_outbox set status = 'skipped', error = 'no_device' where id = r.id;
      end if;
      continue;
    end if;
    update public.push_outbox set status = 'sending', tries = tries + 1, next_try_at = now(), error = null where id = r.id;
    -- spec 42 S27 (#1673): whose company it is — the phone opens it there; the name and how many companies the person is
    -- active in are for the server's title only (the handler keeps them out of the push's data)
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'kind', r.kind, 'route', r.route, 'devices', v_dev,
      'company', r.company_id,
      'company_name', (select c.name from public.companies c where c.id = r.company_id),
      'companies', (select count(*) from public.memberships m join public.companies c on c.id = m.company_id
                     where m.user_id = r.user_id and m.status = 'active' and m.deleted_at is null
                       and c.closed_at is null and c.deleted_at is null)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;
