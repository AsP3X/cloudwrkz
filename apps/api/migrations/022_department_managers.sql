-- Human: Allows assigning multiple managers to one department.
-- Keeps departments.manager_employee_id for backward compatibility as "primary manager".

CREATE TABLE IF NOT EXISTS department_managers (
    id                  TEXT PRIMARY KEY,
    department_id       TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    manager_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (department_id, manager_employee_id)
);

CREATE INDEX IF NOT EXISTS department_managers_department_idx
    ON department_managers (department_id);

CREATE INDEX IF NOT EXISTS department_managers_manager_idx
    ON department_managers (manager_employee_id);

-- Backfill from the previous single-manager column.
INSERT INTO department_managers (id, department_id, manager_employee_id, created_at)
SELECT gen_random_uuid()::text, d.id, d.manager_employee_id, NOW()
FROM departments d
WHERE d.manager_employee_id IS NOT NULL
ON CONFLICT (department_id, manager_employee_id) DO NOTHING;
