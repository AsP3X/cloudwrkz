-- Scoped customer permissions for time entry billing without full Customers module access.

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (
    gen_random_uuid()::text,
    'time_tracking.customers.view',
    'View Customers for Time Entries',
    'Search and select customers when linking billing on time entries',
    'time_tracking',
    'timetracking',
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid()::text,
    'time_tracking.customers.create',
    'Create Customers for Time Entries',
    'Create new customer records when logging time entries (no Customers module required)',
    'time_tracking',
    'timetracking',
    NOW(),
    NOW()
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Admin' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'time_tracking.customers.view',
  'time_tracking.customers.create'
)
ON CONFLICT (id) DO NOTHING;
