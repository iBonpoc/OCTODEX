-- spec 33 П23.9 (C5, debt 2): a line with quantity 0 is how a contractor leaves a part out (П23.8а №4). The app's
-- clientDoc drops it too (demo /p/, PDF; PR #394, the same pattern in zeroQty); the real client page reads
-- app.client_doc — the same rule here, so the client never sees a $0 row. Signed versions too: only the view changes,
-- the fingerprint keeps every line. Read-time only: calc_inputs, the signature fingerprint (sha256 of calc_inputs) and the
-- server's totals (app.estimate_option_totals) are untouched; a quantity-0 line bills nothing, so totals do not move.
-- Same signature, same whitelist — rule 16 not touched. Zero = the text of a plain decimal zero ("0", "-0", "0.", "00", "0.00", " .0 "); "0e5" is not (the app agrees).

revoke all on function app.client_doc(jsonb) from public, anon, authenticated;

create or replace function app.client_doc(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- hidden BOM lines go whole (also «false» as a string or 0)
                          and coalesce(lower(l.value ->> 'clientVisible'), 'true') not in ('false', '0')
                          -- a line the page cannot draw goes whole too (the page would fail on it)
                          and jsonb_typeof(l.value -> 'name') = 'string'
                          and jsonb_typeof(l.value -> 'group') = 'string'
                          and jsonb_typeof(l.value -> 'quantity') in ('string', 'number')
                          and jsonb_typeof(l.value -> 'unitPriceCents') = 'number'
                          -- quantity 0: the part is left out (spec 33 П23.9)
                          and (l.value ->> 'quantity') !~ '^[[:space:]]*[+-]?(0+([.]0*)?|[.]0+)[[:space:]]*$'), '[]'::jsonb))
                  order by o.ordinality)
           from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end)
                with ordinality o
          where jsonb_typeof(o.value) = 'object'), '[]'::jsonb))
    || case when jsonb_typeof(p -> 'settings') = 'object' then jsonb_build_object('settings',
         app.jsonb_scalars(p -> 'settings', array['caHic'])
         || case when (p -> 'settings') ? 'discount' then jsonb_build_object('discount',
              app.jsonb_scalars(p -> 'settings' -> 'discount', array['kind', 'value', 'cents'])) else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'tax') = 'object' then jsonb_build_object('tax',
              app.jsonb_scalars(p -> 'settings' -> 'tax', array['enabled', 'rateBps'])
              || case when jsonb_typeof(p -> 'settings' -> 'tax' -> 'groups') = 'object' then jsonb_build_object('groups',
                   app.jsonb_scalars(p -> 'settings' -> 'tax' -> 'groups', array['service', 'labor', 'material'])) else '{}'::jsonb end)
            else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'deposit') = 'object' then jsonb_build_object('deposit',
              app.jsonb_scalars(p -> 'settings' -> 'deposit', array['kind', 'bps', 'cents'])) else '{}'::jsonb end)
       else '{}'::jsonb end
  end;
$$;
-- rule 18: only the security definer page functions call it (as their owner)
revoke all on function app.client_doc(jsonb) from public, anon, authenticated;
