-- Create a "Default" group and assign standard permissions so admins can add users to it
-- to grant access when no permissions are assigned (matches Next.js: access via explicit assignment).
-- Idempotent: safe to run multiple times.

-- Create Default group if not exists (unique on name)
INSERT INTO groups (id, name, description, created_at, updated_at)
VALUES (
  'default-group-id',
  'Default',
  'Default group for standard user access. Add users to this group to grant module and ticket access.',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- Assign module view + tickets + todos + time_tracking + links permissions to Default group
INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Default' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'modules.tickets.view',
  'modules.todos.view',
  'modules.links.view',
  'modules.timetracking.view',
  'tickets.view',
  'tickets.create',
  'tickets.comment',
  'todos.view',
  'todos.create',
  'time_tracking.view',
  'time_tracking.create',
  'links.view',
  'links.create',
  'collections.view'
)
ON CONFLICT (id) DO NOTHING;
