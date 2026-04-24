-- Employees module + permissions.
-- Idempotent: ON CONFLICT DO UPDATE / DO NOTHING so re-running is safe.

-- Module entry
INSERT INTO modules (id, key, name, description, enabled, config, created_at, updated_at)
VALUES (
  gen_random_uuid()::text,
  'employees',
  'Employees',
  'Employee register and HR management',
  true,
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled     = EXCLUDED.enabled,
  updated_at  = NOW();

-- Permissions
INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'employees.view',         'View Employees',         'View the employee register',               'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.create',       'Create Employees',       'Create new employee records',              'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.update',       'Update Employees',       'Edit existing employee records',           'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.delete',       'Delete Employees',       'Delete employee records',                  'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.employees.view', 'View Employees Module',  'Access to the Employees module in the nav', 'modules',   'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();

-- Grant all five permissions to the default admin group
INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Admin' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'employees.view',
  'employees.create',
  'employees.update',
  'employees.delete',
  'modules.employees.view'
)
AND EXISTS (SELECT 1 FROM groups WHERE name = 'Admin')
ON CONFLICT (id) DO NOTHING;
