-- Seed employee module and permissions for already-migrated databases.
-- Needed because historical seed migration (002) does not re-run after checksum repair.

INSERT INTO modules (id, key, name, description, enabled, config, created_at, updated_at)
VALUES
  (
    gen_random_uuid()::text,
    'employees',
    'Employees',
    'ERP-ERM employee management',
    false,
    '{}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  config = EXCLUDED.config,
  updated_at = NOW();

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'modules.employees.view', 'View Employees Module', 'Access to the Employees module in navigation and dashboard', 'modules', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.view', 'View Employees', 'View employee records', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.view_all', 'View All Employees', 'View all employee records across departments', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.create', 'Create Employees', 'Create employee records', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.update', 'Update Employees', 'Update employee records', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.delete', 'Delete Employees', 'Delete employee records', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.compensation.view', 'View Compensation', 'View compensation placeholders and bands', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.compensation.manage', 'Manage Compensation', 'Manage compensation placeholders and updates', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.assets.manage', 'Manage Employee Assets', 'Assign and manage employee assets and equipment', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.skills.manage', 'Manage Employee Skills', 'Manage employee skills and certifications', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.performance.manage', 'Manage Performance', 'Manage employee performance reviews and goals', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.lifecycle.manage', 'Manage Employee Lifecycle', 'Manage onboarding and offboarding lifecycle events', 'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.export', 'Export Employees', 'Export employee module data for reporting', 'employees', 'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();
