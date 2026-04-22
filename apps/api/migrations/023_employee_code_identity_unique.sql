-- Case- and whitespace-insensitive uniqueness for employee_code so "EMP-1", "emp-1",
-- and "EMP  1" cannot coexist. Matches normalization in apps/api/src/models/employee_code.rs
-- and duplicate checks in routes / background jobs.

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_identity_uq
  ON employees (lower(regexp_replace(btrim(employee_code), '[[:space:]]+', ' ', 'g')));
