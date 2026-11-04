-- Old-shape data right before the L1 migration: a company with two leads, last touched long ago.
insert into public.companies (id, name) values ('cf000000-0000-0000-0000-000000000000', 'Upgrade Co');
insert into public.leads (id, company_id, source_id, contact_name, phone, received_at)
select v.id::uuid, 'cf000000-0000-0000-0000-000000000000', s.id, v.name, v.phone, v.at::timestamptz
  from (values ('cf100000-0000-0000-0000-000000000001', 'Old first', '(818) 555-0301', '2026-01-02T10:00:00Z'),
               ('cf100000-0000-0000-0000-000000000002', 'Old second', '(818) 555-0302', '2026-02-03T10:00:00Z')) v(id, name, phone, at),
       lateral (select id from public.lead_sources where company_id = 'cf000000-0000-0000-0000-000000000000' order by position, name limit 1) s;
-- (the service trigger would stamp now(); switch it off to plant an old timestamp)
alter table public.leads disable trigger user;
update public.leads set updated_at = '2026-03-01T00:00:00Z' where company_id = 'cf000000-0000-0000-0000-000000000000';
alter table public.leads enable trigger user;
