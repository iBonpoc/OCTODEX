-- docs/specs/33-gutters-canvas.md П20.16 (founder 08.11): how a gutter measurement was taken — one choice for the whole
-- drawing instead of «tape / drawn» at every line: 'tape' — measured with a tape, good to cut by; 'rough' — a satellite
-- image, a measuring wheel or by eye: good for an estimate, not for cutting.
-- Rule 16, step 1: only a column is added, with a default — old app versions do not write it and get 'rough'. The table
-- keeps its grants (select, insert, update to authenticated) and its row rules; no function is added or changed.
alter table public.gutter_measurements
  add column accuracy text not null default 'rough' check (accuracy in ('rough', 'tape'));
