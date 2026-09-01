-- 015: grant the new spaces.manage capability to the built-in admin roles.
-- Roles live as data (JSONB capability arrays seeded by server/seed.js), so a
-- code-level addition to SEED_ROLES does not reach existing databases —
-- this backfill does. Custom roles are untouched; admins can grant the
-- capability from the Roles & Access page. Forward-only, idempotent.

UPDATE roles
   SET capabilities = capabilities || '["spaces.manage"]'::jsonb
 WHERE id IN ('role_superadmin', 'role_admin')
   AND NOT capabilities @> '["spaces.manage"]'::jsonb;
