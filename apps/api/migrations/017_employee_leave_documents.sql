-- Employee leave requests and document management tables for full ERP-ERM scope.
-- Leave requests cover vacation, sick leave, parental leave etc. with an approval flow.
-- Documents cover employee file attachments (URL-based; no blob storage required).

DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM (
    'VACATION', 'SICK', 'PERSONAL', 'MATERNITY', 'PATERNITY',
    'BEREAVEMENT', 'UNPAID', 'COMPENSATORY', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Employee leave requests: tracks requests, approvals, and denials.
-- The approved_by_user_id references the platform user (not employee) who approved/denied.
CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type "LeaveType" NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  notes TEXT,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_leave_requests_employee_id ON employee_leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_leave_requests_status ON employee_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_employee_leave_requests_leave_type ON employee_leave_requests(leave_type);
CREATE INDEX IF NOT EXISTS idx_employee_leave_requests_start_date ON employee_leave_requests(start_date);
CREATE INDEX IF NOT EXISTS idx_employee_leave_requests_end_date ON employee_leave_requests(end_date);

-- Employee documents: URL-based file references (contracts, IDs, certificates, etc).
-- No binary storage; url field holds the external or internal file path.
CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  file_name TEXT,
  status "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  expires_at DATE,
  metadata JSONB,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_doc_type ON employee_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_status ON employee_documents(status);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expires_at ON employee_documents(expires_at);
