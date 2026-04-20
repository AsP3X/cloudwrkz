-- Human: Creates the departments table for the employee management module.
-- Departments can be hierarchical (parent_department_id) and optionally owned by a manager employee.

CREATE TABLE IF NOT EXISTS departments (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    description           TEXT,
    manager_employee_id   TEXT REFERENCES employees(id) ON DELETE SET NULL,
    parent_department_id  TEXT REFERENCES departments(id) ON DELETE SET NULL,
    color                 TEXT,
    status                TEXT NOT NULL DEFAULT 'ACTIVE',
    created_by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique ON departments (name);
