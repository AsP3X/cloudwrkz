-- Human: Seeds permissions for the departments management feature.

INSERT INTO permissions (key, label, description) VALUES
    ('employees.departments.view',   'View Departments',   'List and view department details'),
    ('employees.departments.manage', 'Manage Departments', 'Create, update, and delete departments')
ON CONFLICT (key) DO UPDATE
    SET label       = EXCLUDED.label,
        description = EXCLUDED.description;
