-- Align Default group with links: users who can use the Links module can create collections.
INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Default' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key = 'collections.create'
ON CONFLICT (id) DO NOTHING;
