-- M5d (20261107190000): the new keys and the check of public.files (a big table) validated in their own transaction —
-- SHARE UPDATE EXCLUSIVE, reads and the phones' writes go on (review security-check M5d №4). Old rows have no
-- measurement: they pass.
alter table public.files validate constraint files_measurement_fk;
alter table public.files validate constraint files_element_fk;
alter table public.files validate constraint files_measurement_shape_check;
