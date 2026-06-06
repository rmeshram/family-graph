-- 034_wizard_skipped.sql
-- Persists which wizard steps the user permanently dismissed ("No" answers)
-- so they survive across devices and browser clears.

alter table public.profiles
  add column if not exists wizard_skipped text[] not null default '{}';

comment on column public.profiles.wizard_skipped is
  'Relationship types the user permanently dismissed in the SpeedWizard (e.g. spouse, child, sibling).';
