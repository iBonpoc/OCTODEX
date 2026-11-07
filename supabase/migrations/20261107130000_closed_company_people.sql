-- 7а-3 «в» (story map S22b; docs/specs/22 §3.5, §3.6): the people of a closed company see why they have no company.
-- delete_account closes a company and makes every other member «deleted» in ONE transaction with one now()
-- (20261106200000: closed_at = now(), memberships.deleted_at = now()), so `deleted_at >= closed_at` tells «gone with the
-- closing» from «left before». Keep that one now() there: this function and T77 count on it.
-- Only the person's own memberships, only the company's name and when it closed, for 90 days (founder: «видна 90 дней»).
-- Nothing is changed: a new function only (rule 16 — nothing renamed or dropped).

create or replace function public.my_closed_companies()
returns table (company_id uuid, name text, closed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select co.id, coalesce(nullif(co.dba, ''), co.name), co.closed_at
    from public.memberships m
    join public.companies co on co.id = m.company_id
   where auth.uid() is not null
     and not app.is_anonymous_user()
     and app.account_alive()
     and m.user_id = auth.uid()
     and m.status = 'deleted'
     and co.closed_at is not null
     and m.deleted_at >= co.closed_at
     and co.closed_at > now() - interval '90 days'
   order by co.closed_at desc;
$$;
-- rule 18: nobody by default, the signed-in app only
revoke all on function public.my_closed_companies() from public, anon, authenticated;
grant execute on function public.my_closed_companies() to authenticated;
