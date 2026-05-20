-- Optional billing contact on time entries (which company contact's employee rates apply).

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS customer_contact_id TEXT
  REFERENCES customer_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_customer_contact_id
  ON time_entries(customer_contact_id);
