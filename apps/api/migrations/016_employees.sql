-- Employee management schema: employees, additional emails, and manager relationships.
-- Idempotent: uses IF NOT EXISTS / DO $$ checks so re-running on an existing DB is safe.

DO $$ BEGIN
  CREATE TYPE employee_status_enum AS ENUM (
    'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'PROBATION', 'TERMINATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS employees (
  id                 TEXT PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  -- Primary / canonical e-mail for the employee record
  email              TEXT NOT NULL,
  title              TEXT,
  employee_status    employee_status_enum NOT NULL DEFAULT 'ACTIVE',
  company_role       TEXT,
  -- Placeholder: will be replaced by a departments table
  department         TEXT,
  -- Financial placeholders (cents-precision via NUMERIC)
  monthly_salary     NUMERIC(12, 2),
  monthly_expenses   NUMERIC(12, 2),
  -- Hours placeholder: will be connected to time-tracking later
  hours_worked       NUMERIC(10, 2),
  -- Vacation tracking (days)
  vacation_available INT NOT NULL DEFAULT 0,
  vacation_used      INT NOT NULL DEFAULT 0,
  vacation_planned   INT NOT NULL DEFAULT 0,
  -- Sick-day tracking
  sick_days_total     INT NOT NULL DEFAULT 0,
  sick_days_available INT NOT NULL DEFAULT 0,
  -- Optional link to a platform user account
  linked_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_email          ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_employee_status ON employees(employee_status);
CREATE INDEX IF NOT EXISTS idx_employees_linked_user_id ON employees(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_employees_last_name      ON employees(last_name);

-- Additional e-mail addresses for an employee (the primary is on the employees row itself)
CREATE TABLE IF NOT EXISTS employee_emails (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_emails_employee_id ON employee_emails(employee_id);

-- Many-to-many self-join: an employee can have multiple managers, who are also employees
CREATE TABLE IF NOT EXISTS employee_managers (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, manager_employee_id),
  CONSTRAINT no_self_manage CHECK (employee_id <> manager_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_managers_employee_id         ON employee_managers(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_managers_manager_employee_id ON employee_managers(manager_employee_id);
