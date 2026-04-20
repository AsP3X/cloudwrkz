-- Seed leave and document management permissions for the employee ERP-ERM module.

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'employees.leave.view',     'View Leave Requests',   'View employee leave requests',                           'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.leave.manage',   'Manage Leave Requests', 'Create and update employee leave requests',              'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.leave.approve',  'Approve Leave',         'Approve or deny employee leave requests',                'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.documents.view', 'View Employee Docs',    'View employee documents and attachments',                'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.documents.manage','Manage Employee Docs', 'Create, update and delete employee documents',          'employees', 'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();
