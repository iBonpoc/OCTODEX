-- Ядро не привязано к нише (решение основателя): новая компания больше не получает направление 'gutters' по умолчанию.
-- Полная замена на companies.trades[] — в волне 7 (docs/13-core-workflow-spec.md §7).
alter table public.companies alter column primary_trade set default 'other';
