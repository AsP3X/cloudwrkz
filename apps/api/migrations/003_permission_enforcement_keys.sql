-- Permission catalog cleanup and new atomic keys for enforcement splits.

DELETE FROM user_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE key LIKE 'issues.%' OR key LIKE 'notes.%'
);
DELETE FROM group_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE key LIKE 'issues.%' OR key LIKE 'notes.%'
);
DELETE FROM permissions WHERE key LIKE 'issues.%' OR key LIKE 'notes.%';

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'admin.sessions.revoke', 'Revoke Sessions', 'Force-logout users by deleting active sessions', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.ban', 'Ban Users', 'Ban and unban user accounts', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.reset_password', 'Reset User Passwords', 'Issue temporary passwords and invalidate sessions', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.groups.view', 'View Groups', 'View groups and members (read-only)', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'links.view_all', 'View All Links', 'View all users links (when cross-user access is enabled)', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.bulk_update', 'Bulk Update Time Entries', 'Bulk update own time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.bulk_archive', 'Bulk Archive Time Entries', 'Bulk archive own time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.bulk_delete', 'Bulk Delete Time Entries', 'Bulk delete own time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'archive.view', 'View Archive', 'Access the unified archive views', 'modules', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'search.use', 'Use Global Search', 'Use global and advanced search', 'search', NULL, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  'admin-group-id',
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'admin.sessions.revoke',
  'admin.users.ban',
  'admin.users.reset_password',
  'admin.groups.view',
  'links.view_all',
  'time_tracking.bulk_update',
  'time_tracking.bulk_archive',
  'time_tracking.bulk_delete',
  'archive.view',
  'search.use'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'moderator-group-' || p.key,
  'moderator-group-id',
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'admin.users.reset_password',
  'admin.groups.view',
  'admin.sessions.view',
  'search.use',
  'archive.view'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  'default-group-id',
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'search.use',
  'archive.view',
  'time_tracking.bulk_update',
  'time_tracking.bulk_archive',
  'time_tracking.bulk_delete'
)
ON CONFLICT (id) DO NOTHING;
