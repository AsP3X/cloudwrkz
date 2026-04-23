-- Idempotent cleanup: legacy HR/Employees module. Uses existence checks + DROP
-- (not DROP ... IF EXISTS) so PostgreSQL does not emit a NOTICE per missing object
-- on every clean startup.

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

DO $$
BEGIN
  IF to_regclass('public.department_managers') IS NOT NULL THEN
    DROP TABLE public.department_managers CASCADE;
  END IF;
  IF to_regclass('public.employee_leave_requests') IS NOT NULL THEN
    DROP TABLE public.employee_leave_requests CASCADE;
  END IF;
  IF to_regclass('public.employee_documents') IS NOT NULL THEN
    DROP TABLE public.employee_documents CASCADE;
  END IF;
  IF to_regclass('public.employee_employment_history') IS NOT NULL THEN
    DROP TABLE public.employee_employment_history CASCADE;
  END IF;
  IF to_regclass('public.employee_compensation') IS NOT NULL THEN
    DROP TABLE public.employee_compensation CASCADE;
  END IF;
  IF to_regclass('public.employee_assets') IS NOT NULL THEN
    DROP TABLE public.employee_assets CASCADE;
  END IF;
  IF to_regclass('public.employee_skills') IS NOT NULL THEN
    DROP TABLE public.employee_skills CASCADE;
  END IF;
  IF to_regclass('public.employee_certifications') IS NOT NULL THEN
    DROP TABLE public.employee_certifications CASCADE;
  END IF;
  IF to_regclass('public.employee_performance_reviews') IS NOT NULL THEN
    DROP TABLE public.employee_performance_reviews CASCADE;
  END IF;
  IF to_regclass('public.employee_goals') IS NOT NULL THEN
    DROP TABLE public.employee_goals CASCADE;
  END IF;
  IF to_regclass('public.employee_lifecycle_events') IS NOT NULL THEN
    DROP TABLE public.employee_lifecycle_events CASCADE;
  END IF;
  IF to_regclass('public.departments') IS NOT NULL THEN
    DROP TABLE public.departments CASCADE;
  END IF;
  IF to_regclass('public.employees') IS NOT NULL THEN
    DROP TABLE public.employees CASCADE;
  END IF;
END
$$;

DO $$
DECLARE
  type_name text;
  type_names text[] := ARRAY[
    'LeaveType',
    'LeaveRequestStatus',
    'DocumentStatus',
    'EmploymentStatus',
    'EmploymentType',
    'CompensationPayFrequency',
    'AssetAssignmentStatus',
    'LifecycleEventType',
    'LifecycleEventStatus'
  ];
BEGIN
  -- Types were created with double-quoted mixed-case names (e.g. "LeaveType").
  FOREACH type_name IN ARRAY type_names
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = type_name
    ) THEN
      EXECUTE format('DROP TYPE public.%I CASCADE', type_name);
    END IF;
  END LOOP;
END
$$;

DELETE FROM modules WHERE key = 'employees';
