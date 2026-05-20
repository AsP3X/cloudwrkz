-- Time entry billing: snapshot hourly rate for earned-amount calculation (optional cross-module link with customers).

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2);
