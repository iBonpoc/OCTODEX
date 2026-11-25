-- #2630 (К1, the server side of #2406 / PR #2629): the client of an estimate changes only while it is a draft.
-- The app already keeps the client of a sent / signed / approved / declined estimate (canChangeEstimateClient); the server
-- now refuses it too, for every caller — an old build on a phone, a direct API call, the server's own jobs.
-- * Once the estimate left «draft» (old.status <> 'draft'), its customer_id stays. «draft» and another client in one
--   write is refused as well: the row was not a draft.
-- * The only way through: merge_customers (B → A inside the merge, app.merging_customer — the same door as the other guards).
-- * t01_follow_merged_customer runs first (trigger order by name): an old phone's merged client lands on the kept one,
--   no change, no refusal. The same client sent again (an echo) is no change either.
-- * Code 22023 + hint estimate_client_locked (not 42501: the app reads 42501 as «no rights» for the whole company). The
--   outbox counts it as a refusal (outboxRetry.classify) and drops the op after MAX_TRIES — no queue stuck on it. Today no
--   build sends another customer_id for an existing estimate at all (ops.ts ins = upsert … ignoreDuplicates).
-- * The signed estimate's freeze in t25_estimate_send_and_guard stays as it is.
-- Rule 16: only added (a function, a trigger). Rule 18: the trigger function is executed by no one.

create or replace function app.tg_estimate_client_lock()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_merge boolean := false;
begin
  if new.customer_id is distinct from old.customer_id and old.status <> 'draft' then
    -- merge_customers is a definer: the app's own role never passes (merging_customer is closed to it, as in t25; a
    -- separate if — EXECUTE is checked when the expression is prepared, an «or» would not keep the app from it)
    if current_user not in ('authenticated', 'anon') then
      v_merge := app.merging_customer(old.customer_id, new.customer_id);
    end if;
    if not v_merge then
      raise exception 'estimate_client_locked: the client of an estimate changes only in a draft (status %)', old.status
        using errcode = '22023', hint = 'estimate_client_locked';
    end if;
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_estimate_client_lock() from public, anon, authenticated;

drop trigger if exists t26_estimate_client_lock on public.estimates;
create trigger t26_estimate_client_lock before update of customer_id on public.estimates
  for each row execute function app.tg_estimate_client_lock();
