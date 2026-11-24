-- =============================================================================
-- 0115 — Platform roles for Medical Chronicles editorial work
-- =============================================================================
-- Kept in its own migration: a new enum value cannot be used in the same
-- transaction that adds it, and the Supabase CLI wraps each file in one.
--
-- Reversal: PostgreSQL cannot drop enum values. To reverse, revoke every grant
-- of these roles (delete from platform_roles where role in (...)) and leave the
-- unused labels in place; they grant nothing on their own.
-- =============================================================================

alter type public.platform_role add value if not exists 'content_editor';
alter type public.platform_role add value if not exists 'medical_reviewer';
