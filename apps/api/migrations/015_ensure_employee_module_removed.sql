-- Idempotent cleanup: legacy HR/Employees module (tables, enums, permissions) if present.
-- New installs: most statements are no-ops. Databases that previously had the module: removes artifacts.

DELETE FROM group_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view'
);

DELETE FROM user_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view'
);

DELETE FROM permissions
WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view';

DROP TABLE IF EXISTS department_managers CASCADE;
DROP TABLE IF EXISTS employee_leave_requests CASCADE;
DROP TABLE IF EXISTS employee_documents CASCADE;
DROP TABLE IF EXISTS employee_employment_history CASCADE;
DROP TABLE IF EXISTS employee_compensation CASCADE;
DROP TABLE IF EXISTS employee_assets CASCADE;
DROP TABLE IF EXISTS employee_skills CASCADE;
DROP TABLE IF EXISTS employee_certifications CASCADE;
DROP TABLE IF EXISTS employee_performance_reviews CASCADE;
DROP TABLE IF EXISTS employee_goals CASCADE;
DROP TABLE IF EXISTS employee_lifecycle_events CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

DROP TYPE IF EXISTS "LeaveType" CASCADE;
DROP TYPE IF EXISTS "LeaveRequestStatus" CASCADE;
DROP TYPE IF EXISTS "DocumentStatus" CASCADE;
DROP TYPE IF EXISTS "EmploymentStatus" CASCADE;
DROP TYPE IF EXISTS "EmploymentType" CASCADE;
DROP TYPE IF EXISTS "CompensationPayFrequency" CASCADE;
DROP TYPE IF EXISTS "AssetAssignmentStatus" CASCADE;
DROP TYPE IF EXISTS "LifecycleEventType" CASCADE;
DROP TYPE IF EXISTS "LifecycleEventStatus" CASCADE;

DELETE FROM modules WHERE key = 'employees';
