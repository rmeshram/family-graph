-- Migration 004: Add missing INSERT policy for families table.
-- Previously only SELECT and UPDATE policies existed, blocking onboarding
-- when the client tried to create a new family.

drop policy if exists "families: creator can insert" on public.families;
create policy "families: creator can insert"
  on public.families
  for insert
  with check (created_by = auth.uid());
