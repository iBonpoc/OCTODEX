-- =============================================================================
-- OCTODEX волна 8: лид → смета → клиент (docs/13-core-workflow-spec.md §3, решения §6 по умолчанию).
--   * Перевести лид в клиенты вручную можно из любого открытого статуса (won_via = 'manual', причина в заметке);
--     раньше won разрешался только из estimate_sent. Отчёт об окупаемости различает won_via.
--   * Отправка сметы из лида: открытый лид → estimate_sent (переходы вперёд уже разрешены).
--   * portal_accept: подпись переводит лид в won (won_via = 'approval'), клиента prospect → active.
-- =============================================================================

insert into app.status_transitions (entity_type, from_status, to_status)
select 'lead', s, 'won' from (values ('new'), ('contacted'), ('qualified'), ('inspection_scheduled')) x(s)
on conflict do nothing;

create or replace function public.portal_accept(
  p_token      text,
  p_option_id  uuid,
  p_addon_ids  uuid[],
  p_signer     text,
  p_svg        text,
  p_consent    boolean,
  p_channel    text default 'portal',
  p_job_id     uuid default null,
  p_visit_id   uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e        public.estimates;
  v        public.estimate_versions;
  o        public.estimate_options;
  member   boolean;
  sub      bigint;
  taxable  bigint;
  disc     bigint := 0;
  tdisc    bigint := 0;
  tax      bigint := 0;
  total    bigint;
  dep      bigint := 0;
  rule     jsonb;
  v_job    uuid;
  v_cust   text;
begin
  if coalesce(p_consent, false) is not true or coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'E-SIGN consent, name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where public_token = p_token and deleted_at is null for update;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  member := app.is_member(e.company_id);
  if p_channel = 'on_site' and not member then
    raise exception 'on-site signature requires a company member' using errcode = '42501';
  end if;
  if e.status = 'approved' then
    return public.portal_estimate(p_token);              -- повтор (сеть) — без дублей
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into o from public.estimate_options where id = p_option_id and version_id = v.id and deleted_at is null;
  if not found then
    raise exception 'option does not belong to the sent version' using errcode = '22023';
  end if;

  -- Итог считает сервер по строкам (как @octo/estimating-engine: round half up, скидка пропорционально на налоговую базу).
  select coalesce(sum(li.line_total_cents), 0), coalesce(sum(li.line_total_cents) filter (where li.taxable), 0)
    into sub, taxable
    from public.estimate_line_items li
   where li.option_id = o.id and li.deleted_at is null and li.client_visible
     and (not li.is_optional or li.id = any (coalesce(p_addon_ids, '{}')));
  if o.discount_mode = 'pct' then
    disc := floor(sub * o.discount_value / 10000.0 + 0.5);
  elsif o.discount_mode = 'fixed' then
    disc := least(o.discount_value, sub);
  end if;
  if sub > 0 then
    tdisc := floor(disc::numeric * taxable / sub + 0.5);
  end if;
  if v.tax_enabled then
    tax := floor((taxable - tdisc)::numeric * coalesce(v.tax_rate_bps, 0) / 10000 + 0.5);
  end if;
  total := sub - disc + tax;
  rule := coalesce(v.deposit_rule, '{}'::jsonb);
  if rule ->> 'kind' = 'pct' then
    dep := floor(total * least(greatest((rule ->> 'bps')::numeric, 0), 10000) / 10000 + 0.5);
  elsif rule ->> 'kind' = 'fixed' then
    dep := least(greatest((rule ->> 'cents')::bigint, 0), total);
  end if;

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name,
                                         signature_svg, esign_consent, channel, selection)
  values (e.company_id, e.id, v.id, o.id, 'approved', trim(p_signer), p_svg, true,
          case when p_channel = 'on_site' then 'on_site' else 'portal' end,
          jsonb_build_object('addon_ids', coalesce(p_addon_ids, '{}'), 'subtotal', sub, 'discount', disc, 'tax', tax,
                             'total', total, 'deposit', dep));
  update public.estimates set status = 'approved' where id = e.id;
  -- Лид → клиент при подписи (won_via = approval); «потенциальный» клиент становится действующим.
  if e.lead_id is not null then
    update public.leads set status = 'won', won_via = 'approval', customer_id = coalesce(customer_id, e.customer_id)
     where id = e.lead_id and status not in ('won', 'lost', 'archived');
  end if;
  update public.customers set status = 'active' where id = e.customer_id and status = 'prospect';

  -- Работа создаётся без даты (status draft = «ждёт даты»); дату и мастера назначает подрядчик по уведомлению.
  v_job := case when member and p_job_id is not null then p_job_id else public.uuid_generate_v7() end;
  insert into public.jobs (id, company_id, number, title, customer_id, property_id, estimate_id, approved_version_id, option_id, contract_total_cents)
  values (v_job, e.company_id, '', coalesce(nullif(e.title, ''), o.name), e.customer_id, e.property_id, e.id, v.id, o.id, total)
  on conflict (estimate_id) do nothing;
  select id into v_job from public.jobs where estimate_id = e.id;

  select display_name into v_cust from public.customers where id = e.customer_id;
  insert into public.notifications (company_id, kind, estimate_id, job_id, payload)
  values (e.company_id, 'estimate.approved', e.id, v_job,
          jsonb_build_object('customer', v_cust, 'number', e.number, 'option', o.name, 'total', total, 'deposit', dep,
                             'channel', p_channel));
  return public.portal_estimate(p_token);
end;
$$;

