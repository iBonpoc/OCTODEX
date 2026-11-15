-- #1604, #1603: a closed company stays closed to its creator; a profile picture is a file of the person's own.
-- Rule 16: nothing renamed or dropped; the policy changed with alter policy; the column is not read by the app.

-- 1 ------------------------------------------------------------------------------------------------
-- #1604: the creator sees his company before any membership (sign-up, 20261106200000) — only while it is open. A
-- closed company keeps its memberships today (deleted_at), so the branch is closed already; this holds it if they go.
alter policy companies_select on public.companies
  using (app.is_member(id) or (created_by = (select auth.uid()) and closed_at is null and not app.has_any_membership(id)));

-- 2 ------------------------------------------------------------------------------------------------
-- #1603: users.avatar_file_id points at a file; from the app only at the person's own live photo (the server's roles are
-- not limited: account deletion clears it)
alter table public.users drop constraint if exists users_avatar_file_fk;
alter table public.users add constraint users_avatar_file_fk foreign key (avatar_file_id) references public.files (id) not valid;
-- (avatar_file_id is null in every row: nothing writes it yet — the check reads nothing)
alter table public.users validate constraint users_avatar_file_fk;
-- rule16: small (partial: only rows with a picture — none yet, the index is empty and built at once)
create index if not exists users_avatar_file_idx on public.users (avatar_file_id) where avatar_file_id is not null;

create or replace function app.tg_users_avatar_own()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- security definer to see the file whatever the caller's read rule; who calls is the JWT, not current_user
  if auth.uid() is not null and new.avatar_file_id is not null
     and (tg_op = 'INSERT' or new.avatar_file_id is distinct from old.avatar_file_id)
     and not exists (select 1 from public.files f
                      where f.id = new.avatar_file_id and f.created_by = auth.uid() and f.created_by = new.id
                        and f.kind = 'photo' and f.deleted_at is null) then
    raise exception 'a profile picture is a photo of your own' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_users_avatar_own() from public, anon, authenticated;
drop trigger if exists t08_avatar_own on public.users;
create trigger t08_avatar_own before insert or update of avatar_file_id on public.users
  for each row execute function app.tg_users_avatar_own();
