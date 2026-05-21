-- Admin/Moderator permission groups and membership backfill for permission-only RBAC.
-- Roles remain display labels; access comes from group + direct permission grants.

INSERT INTO groups (id, name, description, created_at, updated_at)
VALUES (
  'admin-group-id',
  'Admin',
  'Full administrative permissions. Assign users with the Admin role label to this group.',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO groups (id, name, description, created_at, updated_at)
VALUES (
  'moderator-group-id',
  'Moderator',
  'Moderator permissions for user/group visibility and ticket administration.',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  'admin-group-id',
  p.id,
  NOW()
FROM permissions p
WHERE p.key LIKE 'admin.%'
   OR p.key LIKE 'audit.%'
   OR p.key = 'search.jobs.view'
   OR p.key LIKE 'employees.%'
   OR p.key = 'modules.employees.view'
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'moderator-group-' || p.key,
  'moderator-group-id',
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'admin.users.view',
  'admin.users.create',
  'admin.users.update',
  'admin.permissions.view',
  'admin.groups.manage',
  'admin.tickets.manage',
  'tickets.view_all',
  'tickets.assign',
  'tickets.update',
  'tickets.comments.agent_only',
  'tickets.comments.view_internal',
  'modules.tickets.view'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_memberships (id, user_id, group_id, created_at)
SELECT
  'backfill-admin-' || u.id,
  u.id,
  'admin-group-id',
  NOW()
FROM users u
WHERE u.role = 'ADMIN'
ON CONFLICT (user_id, group_id) DO NOTHING;

INSERT INTO group_memberships (id, user_id, group_id, created_at)
SELECT
  'backfill-moderator-' || u.id,
  u.id,
  'moderator-group-id',
  NOW()
FROM users u
WHERE u.role = 'MODERATOR'
ON CONFLICT (user_id, group_id) DO NOTHING;

INSERT INTO group_memberships (id, user_id, group_id, created_at)
SELECT
  'backfill-default-' || u.id,
  u.id,
  'default-group-id',
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM group_memberships gm WHERE gm.user_id = u.id
)
ON CONFLICT (user_id, group_id) DO NOTHING;
