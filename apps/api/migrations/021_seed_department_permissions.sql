-- Human: Seeds permissions for the departments management feature.

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'employees.departments.view',   'View Departments',   'List and view department details',            'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.departments.manage', 'Manage Departments', 'Create, update, and delete departments',      'employees', 'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();
