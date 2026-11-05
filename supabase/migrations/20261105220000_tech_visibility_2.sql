-- Security review of #67, follow-up to 20261105200000_tech_visibility:
-- 1) app.is_customer_assignee ignored time and status: a tech kept seeing a client and the client's people after any
--    visit, even a cancelled one. docs/specs/04 §8: clients of their visits today, in the future and in the last
--    14 days, never through a cancelled or no-show visit (the same window as properties: app.tech_visit_counts).
-- 2) notes_insert let any member write a note on any subject of the company. Outside the office a member writes
--    notes only on subjects they see (app.can_see_note_subject), as they read them.

create or replace function app.is_customer_assignee(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs j
    join public.visits v on v.job_id = j.id and v.deleted_at is null
    where j.customer_id = p_customer_id
      and j.deleted_at is null
      and app.tech_visit_counts(v.id)
  );
$$;
revoke all on function app.is_customer_assignee(uuid) from public, anon, authenticated;
grant execute on function app.is_customer_assignee(uuid) to authenticated;

drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (app.is_member(company_id)
              and (app.is_staff(company_id) or app.can_see_note_subject(subject_type, subject_id, company_id)));
