# Шаг 2 «ссылки клиента из строки сметы»: построчный diff 12 функций против их последних версий

Миграция `supabase/migrations/20261110030000_estimate_tokens.sql` (спека 35 §4е, PR руководителю). Строки `$$` в конце каждого блока — разница только в записи конца тела.

```diff
--- app.estimate_client_accept (last version)
+++ app.estimate_client_accept (20261110030000)
@@ -14,3 +14,3 @@
   select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
-  if not found or (p_token is not null and e.public_token is distinct from p_token) then
+  if not found or (p_token is not null and not exists (select 1 from app.estimate_tokens k where k.token = p_token and k.estimate_id = e.id)) then
     raise exception 'estimate not found' using errcode = 'P0002';
@@ -78,2 +78,2 @@
 end;
-$$+$$;
--- app.portal_estimate_base (last version)
+++ app.portal_estimate_base (20261110030000)
@@ -14,3 +14,3 @@
 begin
-  select * into e from public.estimates where public_token = p_token and deleted_at is null;
+  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
   if not found or p_token is null then
@@ -99,2 +99,2 @@
 end;
-$$+$$;
--- public.portal_estimate (last version)
+++ public.portal_estimate (20261110030000)
@@ -15,3 +15,3 @@
   end if;
-  select id, company_id into v_id, v_company from public.estimates where public_token = p_token and deleted_at is null;
+  select id, company_id into v_id, v_company from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
   if r ->> 'status' = 'closed' then
@@ -34,2 +34,2 @@
 end;
-$$+$$;
--- public.portal_accept (last version)
+++ public.portal_accept (20261110030000)
@@ -8,3 +8,3 @@
 begin
-  select id into v_id from public.estimates where public_token = p_token and deleted_at is null;
+  select id into v_id from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
   if not found or p_token is null then
@@ -15,2 +15,2 @@
 end;
-$$+$$;
--- public.portal_pay_simulated (last version)
+++ public.portal_pay_simulated (20261110030000)
@@ -12,3 +12,3 @@
 begin
-  select * into e from public.estimates where public_token = p_token and deleted_at is null;
+  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
   if not found or p_token is null then
@@ -42,2 +42,2 @@
 end;
-$$+$$;
--- public.stripe_pay_open (last version)
+++ public.stripe_pay_open (20261110030000)
@@ -15,3 +15,3 @@
   end if;
-  select * into e from public.estimates where public_token = p_token and deleted_at is null;
+  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
   if not found then
@@ -47,2 +47,2 @@
 end;
-$$+$$;
--- public.send_estimate (last version)
+++ public.send_estimate (20261110030000)
@@ -13,3 +13,3 @@
   if e.status not in ('draft', 'sent', 'viewed') then
-    return e.public_token;                                -- signed or closed: nothing to send, keep the link
+    return app.estimate_current_token(e.id);              -- signed or closed: nothing to send, keep the link
   end if;
@@ -24,12 +24,26 @@
   end if;
-  v_token := e.public_token;
-  if v_token is null then
-    if p_token is not null and length(p_token) >= 20 and p_token ~ '^[A-Za-z0-9_-]+$'
-       and not exists (select 1 from public.revoked_link_tokens r where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
-       and not exists (select 1 from public.estimates where public_token = p_token) then
-      v_token := p_token;
-    else
-      v_token := encode(extensions.gen_random_bytes(24), 'hex');
+  v_token := app.estimate_current_token(e.id);
+  -- the phone's own token (an older app shows and copies the link it made itself): kept as one more live link of this
+  -- estimate, so what the office already sent works (spec 35 §4е, step 2); a new estimate's first link is the same
+  if p_token is not null and length(p_token) between 20 and 128 and p_token ~ '^[A-Za-z0-9_-]+$' and p_token is distinct from v_token
+     and not exists (select 1 from public.revoked_link_tokens r where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
+     and not exists (select 1 from app.estimate_tokens k where k.token = p_token) then
+    -- no endless pile: at most 5 live links — the OLDEST one ends (its hash kept: «no longer valid»), the new one always
+    -- works (an older app sends the link it made; the client must never get a dead one — director's check of #464)
+    if (select count(*) from app.estimate_tokens k where k.estimate_id = e.id) >= 5 then
+      with old as (
+        delete from app.estimate_tokens k
+         where k.token = (select x.token from app.estimate_tokens x where x.estimate_id = e.id order by x.created_at, x.token limit 1)
+        returning k.token, k.company_id, k.estimate_id)
+      insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
+      select encode(sha256(convert_to(old.token, 'UTF8')), 'hex'), old.company_id, old.estimate_id from old
+      on conflict (token_hash) do nothing;
     end if;
-    update public.estimates set public_token = v_token, link_revoked_at = null where id = e.id;
+    insert into app.estimate_tokens (token, estimate_id, company_id) values (p_token, e.id, e.company_id);
+    v_token := p_token;                          -- the newest: the one the office sees (estimate_link, estimate_links)
+    update public.estimates set link_revoked_at = null where id = e.id;
+  elsif v_token is null then
+    v_token := encode(extensions.gen_random_bytes(24), 'hex');
+    insert into app.estimate_tokens (token, estimate_id, company_id) values (v_token, e.id, e.company_id);
+    update public.estimates set link_revoked_at = null where id = e.id;
   end if;
@@ -38,2 +52,2 @@
 end;
-$$+$$;
--- public.revoke_estimate_link (last version)
+++ public.revoke_estimate_link (20261110030000)
@@ -12,3 +12,3 @@
   end if;
-  if e.public_token is null then
+  if not exists (select 1 from app.estimate_tokens k where k.estimate_id = e.id) then
     return;                                               -- already revoked: nothing to do
@@ -19,5 +19,3 @@
   end if;
-  insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
-  values (encode(sha256(convert_to(e.public_token, 'UTF8')), 'hex'), e.company_id, e.id)
-  on conflict (token_hash) do nothing;
+  perform app.estimate_tokens_revoke(e.id);              -- every live link of it (an older app may have added its own)
   perform set_config('app.signing_estimate', e.id::text, true);
@@ -28,2 +26,2 @@
 end;
-$$+$$;
--- public.reissue_estimate_link (last version)
+++ public.reissue_estimate_link (20261110030000)
@@ -15,10 +15,7 @@
   end if;
-  if e.public_token is not null then
-    insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
-    values (encode(sha256(convert_to(e.public_token, 'UTF8')), 'hex'), e.company_id, e.id)
-    on conflict (token_hash) do nothing;
-  end if;
+  perform app.estimate_tokens_revoke(e.id);
   v_token := encode(extensions.gen_random_bytes(24), 'hex');
+  insert into app.estimate_tokens (token, estimate_id, company_id) values (v_token, e.id, e.company_id);
   perform set_config('app.signing_estimate', e.id::text, true);
-  update public.estimates set public_token = v_token, link_revoked_at = null where id = e.id;
+  update public.estimates set public_token = null, link_revoked_at = null where id = e.id;
   perform set_config('app.signing_estimate', '', true);
@@ -28,2 +25,2 @@
 end;
-$$+$$;
--- app.revoke_customer_links (last version)
+++ app.revoke_customer_links (20261110030000)
@@ -8,10 +8,9 @@
 begin
-  for e in select id, company_id, public_token from public.estimates
-            where company_id = p_company_id and customer_id = p_customer_id   -- also deleted ones: a restore must not bring a link back
-              and public_token is not null and status in ('draft', 'sent', 'viewed', 'declined', 'expired')
+  for e in select x.id, x.company_id from public.estimates x
+            where x.company_id = p_company_id and x.customer_id = p_customer_id   -- also deleted ones: a restore must not bring a link back
+              and exists (select 1 from app.estimate_tokens k where k.estimate_id = x.id)
+              and x.status in ('draft', 'sent', 'viewed', 'declined', 'expired')
             for update
   loop
-    insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
-    values (encode(sha256(convert_to(e.public_token, 'UTF8')), 'hex'), e.company_id, e.id)
-    on conflict (token_hash) do nothing;
+    perform app.estimate_tokens_revoke(e.id);
     perform set_config('app.signing_estimate', e.id::text, true);
@@ -23,2 +22,2 @@
 end;
-$$+$$;
--- public.email_claim (last version)
+++ public.email_claim (20261110030000)
@@ -22,3 +22,3 @@
   if not exists (select 1 from public.estimates e where e.id = r.estimate_id and e.deleted_at is null
-                    and e.status = 'approved' and e.public_token is not null) then
+                    and e.status = 'approved' and exists (select 1 from app.estimate_tokens k where k.estimate_id = e.id)) then
     update public.email_outbox set status = 'expired', updated_at = now() where id = r.id;
@@ -39,2 +39,2 @@
 end;
-$$+$$;
--- public.estimate_link (last version)
+++ public.estimate_link (20261110030000)
@@ -12,4 +12,4 @@
   end if;
-  return e.public_token;
+  return app.estimate_current_token(e.id);
 end;
-$$+$$;
```
