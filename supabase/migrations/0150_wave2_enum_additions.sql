-- =============================================================================
-- 0150 — Enum additions for Wave 2 (own file: new enum labels cannot be used
-- in the transaction that adds them, and the Supabase CLI wraps each file in one).
--
-- Reversal: enum labels cannot be dropped; the label grants nothing by itself.
-- =============================================================================

-- Development-only media location (files on the developer's disk). Production
-- media uses 'r2'. The application refuses 'local_dev' assets in production.
alter type public.storage_backend add value if not exists 'local_dev';
