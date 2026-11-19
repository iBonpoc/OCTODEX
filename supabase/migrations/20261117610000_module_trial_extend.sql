-- A ONE-TIME, TEMPORARY extension of the add-on modules' access (founder 18.11.2026; К1).
--
-- What happened: «Почему у нас исчез модуль… вместо Gutters появилась вкладка „План“». The 7-day trial of
-- 20261107160000 (module_enable) ran out for companies that switched Gutters on about a week ago; app.module_active became
-- false, the server refused the module's writes and the app hid its tab.
-- The founder's word (18.11, through the audit): «Цен в приложении нет, но подписка платная через 7 дней» — the trial,
-- the price and app.module_active / module_enable stay AS THEY ARE.
--
-- So this migration only gives every company whose module is switched on, and is not paid, 30 days from today: its
-- trial_ends_at moves to now() + 30 days (never earlier than it already was) — also a trial still running with fewer days
-- left, and a row with no trial end at all. It is a stopgap until payment (step
-- «Оплаты») exists — not a new rule: a module switched on for the first time after this migration gets the usual 7 days.
-- A module whose payment once ran out (paid_until in the past) counts as unpaid and gets the 30 days too.
-- A switched-off module is not touched (switching it on again keeps its own trial end, as before) — the lead's question
-- to the founder whether it should get them too (security-check №3).
-- paid_until is not touched: it stays billing's own column.
--
-- rule 16: nothing is renamed or dropped; an old build reads trial_ends_at as before and simply sees the trial running.
-- row_version is not moved: a phone's settings edit made against it stays valid (module_save_settings compares it).
-- rule 18: no function or table is created or replaced here — no grants change.

update public.company_modules
   set trial_ends_at = now() + interval '30 days',
       updated_at = now(),
       updated_by = null  -- the system, not the last person who changed the module (security-check)
 where enabled
   and (paid_until is null or paid_until <= now())
   and (trial_ends_at is null or trial_ends_at < now() + interval '30 days');
