-- Employee module baseline for ERP-ERM scope.
-- Adds core HRIS entities, compensation placeholders, assets, skills/certs,
-- performance tracking, and onboarding/offboarding lifecycle data.

DO $$ BEGIN
  CREATE TYPE "EmploymentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_LEAVE', 'TERMINATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'TEMPORARY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CompensationPayFrequency" AS ENUM ('HOURLY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AssetAssignmentStatus" AS ENUM ('ASSIGNED', 'RETURNED', 'LOST', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LifecycleEventType" AS ENUM ('ONBOARDING', 'OFFBOARDING', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LifecycleEventStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT,
  work_email TEXT,
  personal_email TEXT,
  phone TEXT,
  date_of_birth DATE,
  hire_date DATE NOT NULL,
  termination_date DATE,
  status "EmploymentStatus" NOT NULL DEFAULT 'DRAFT',
  employment_type "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  department TEXT,
  job_title TEXT,
  legal_entity TEXT,
  location TEXT,
  manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  emergency_contact JSONB,
  notes TEXT,
  payroll_external_id TEXT,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_location ON employees(location);
CREATE INDEX IF NOT EXISTS idx_employees_manager_employee_id ON employees(manager_employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date ON employees(hire_date);
CREATE INDEX IF NOT EXISTS idx_employees_work_email ON employees(work_email);

CREATE TABLE IF NOT EXISTS employee_employment_history (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT,
  department TEXT,
  location TEXT,
  manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  effective_date DATE NOT NULL,
  notes TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_employment_history_employee_id
  ON employee_employment_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_employment_history_effective_date
  ON employee_employment_history(effective_date);

CREATE TABLE IF NOT EXISTS employee_compensation (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_frequency "CompensationPayFrequency" NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  compensation_type TEXT NOT NULL DEFAULT 'BASE',
  pay_grade TEXT,
  pay_band TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_compensation_employee_id ON employee_compensation(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_compensation_is_current ON employee_compensation(is_current);
CREATE INDEX IF NOT EXISTS idx_employee_compensation_effective_from ON employee_compensation(effective_from);

CREATE TABLE IF NOT EXISTS employee_assets (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  asset_tag TEXT,
  serial_number TEXT,
  category TEXT,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  due_back_at TIMESTAMP,
  returned_at TIMESTAMP,
  status "AssetAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  notes TEXT,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_assets_employee_id ON employee_assets(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_assets_status ON employee_assets(status);
CREATE INDEX IF NOT EXISTS idx_employee_assets_asset_tag ON employee_assets(asset_tag);

CREATE TABLE IF NOT EXISTS employee_skills (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  level INTEGER,
  category TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  last_used_at DATE,
  notes TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_skills_employee_id ON employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_skills_skill_name ON employee_skills(skill_name);

CREATE TABLE IF NOT EXISTS employee_certifications (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  certification_name TEXT NOT NULL,
  issuer TEXT,
  issued_at DATE,
  expires_at DATE,
  credential_id TEXT,
  verification_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_certifications_employee_id ON employee_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_certifications_expires_at ON employee_certifications(expires_at);

CREATE TABLE IF NOT EXISTS employee_performance_reviews (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  cycle_name TEXT NOT NULL,
  rating NUMERIC(4, 2),
  summary TEXT,
  strengths TEXT,
  improvements TEXT,
  reviewed_at DATE,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_performance_reviews_employee_id
  ON employee_performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_performance_reviews_reviewed_at
  ON employee_performance_reviews(reviewed_at);

CREATE TABLE IF NOT EXISTS employee_goals (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  target_date DATE,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_goals_employee_id ON employee_goals(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_goals_status ON employee_goals(status);
CREATE INDEX IF NOT EXISTS idx_employee_goals_target_date ON employee_goals(target_date);

CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type "LifecycleEventType" NOT NULL,
  status "LifecycleEventStatus" NOT NULL DEFAULT 'NOT_STARTED',
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMP,
  completed_at TIMESTAMP,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_lifecycle_events_employee_id
  ON employee_lifecycle_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_lifecycle_events_status
  ON employee_lifecycle_events(status);
CREATE INDEX IF NOT EXISTS idx_employee_lifecycle_events_due_at
  ON employee_lifecycle_events(due_at);
