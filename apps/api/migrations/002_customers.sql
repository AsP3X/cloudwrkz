-- Customers module: individuals and companies with contacts and per-contact employee hourly rates.
-- Optional nullable customer_id on tickets, todos, and time_entries for cross-module linking.

DO $$ BEGIN
  CREATE TYPE customer_type_enum AS ENUM ('INDIVIDUAL', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_status_enum AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS customer_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS customers (
  id                   TEXT PRIMARY KEY,
  customer_number      TEXT NOT NULL UNIQUE,
  customer_type        customer_type_enum NOT NULL,
  status               customer_status_enum NOT NULL DEFAULT 'ACTIVE',
  first_name           TEXT,
  last_name            TEXT,
  company_name         TEXT,
  email                TEXT,
  phone                TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  postal_code          TEXT,
  country              TEXT,
  notes                TEXT,
  default_hourly_rate  NUMERIC(12, 2),
  archived_at          TIMESTAMP,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_individual_name CHECK (
    customer_type != 'INDIVIDUAL'
    OR (first_name IS NOT NULL AND btrim(first_name) <> '' AND last_name IS NOT NULL AND btrim(last_name) <> '')
  ),
  CONSTRAINT customers_company_name CHECK (
    customer_type != 'COMPANY'
    OR (company_name IS NOT NULL AND btrim(company_name) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_type   ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_status          ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_email           ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_company_name    ON customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_last_name       ON customers(last_name);
CREATE INDEX IF NOT EXISTS idx_customers_archived_at     ON customers(archived_at);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  title       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email       ON customer_contacts(email);

CREATE TABLE IF NOT EXISTS customer_contact_employee_rates (
  id                  TEXT PRIMARY KEY,
  customer_contact_id TEXT NOT NULL REFERENCES customer_contacts(id) ON DELETE CASCADE,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  hourly_rate         NUMERIC(12, 2) NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (customer_contact_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_ccer_contact_id  ON customer_contact_employee_rates(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_ccer_employee_id ON customer_contact_employee_rates(employee_id);

-- Optional cross-module links (nullable; customers work standalone without these).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_todos_customer_id ON todos(customer_id);

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_customer_id ON time_entries(customer_id);

INSERT INTO modules (id, key, name, description, enabled, config, created_at, updated_at)
VALUES (
  gen_random_uuid()::text,
  'customers',
  'Customers',
  'Customer register for individuals and companies with billing rates',
  true,
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled     = EXCLUDED.enabled,
  updated_at  = NOW();

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'customers.view',         'View Customers',         'View the customer register',                'customers', 'customers', NOW(), NOW()),
  (gen_random_uuid()::text, 'customers.create',       'Create Customers',       'Create new customer records',               'customers', 'customers', NOW(), NOW()),
  (gen_random_uuid()::text, 'customers.update',       'Update Customers',       'Edit existing customer records',            'customers', 'customers', NOW(), NOW()),
  (gen_random_uuid()::text, 'customers.delete',       'Delete Customers',       'Delete customer records',                   'customers', 'customers', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.customers.view', 'View Customers Module',  'Access to the Customers module in the nav', 'modules',   'customers', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Admin' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'customers.view',
  'customers.create',
  'customers.update',
  'customers.delete',
  'modules.customers.view'
)
AND EXISTS (SELECT 1 FROM groups WHERE name = 'Admin')
ON CONFLICT (id) DO NOTHING;
