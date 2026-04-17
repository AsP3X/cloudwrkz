-- Background jobs admin view + future global search permission (idempotent).
INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'admin.jobs.view', 'View Background Jobs', 'View the background job queue and job details in admin', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'search.jobs.view', 'Search Background Jobs', 'Include background jobs in global fuzzy search (when implemented)', 'search', NULL, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();
