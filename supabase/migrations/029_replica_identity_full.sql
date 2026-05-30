-- 029_replica_identity_full.sql
--
-- Without REPLICA IDENTITY FULL, Supabase Realtime UPDATE events only include
-- the primary key in payload.old — all other columns are NULL/undefined.
-- This causes every diff check in the notification hook (photo changed, name
-- changed, visibility changed, role changed) to fire incorrectly because
-- `undefined !== newValue` is always true.
--
-- Enabling FULL makes payload.old include every column's previous value,
-- allowing accurate before/after comparisons.

ALTER TABLE public.family_members REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
