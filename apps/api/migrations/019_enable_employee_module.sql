-- Ensure employee module is enabled for existing environments.
-- Previous seed migration inserted employees with enabled=false.

UPDATE modules
SET enabled = true,
    updated_at = NOW()
WHERE key = 'employees';
