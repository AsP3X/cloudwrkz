-- Anyone who could manage settings previously had implicit access to jobs UI/API via legacy checks.
-- Grant explicit admin.jobs.view so behavior stays the same after jobs became permission-only.

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'mig010-gp-' || gp.id,
  gp.group_id,
  (SELECT id FROM permissions WHERE key = 'admin.jobs.view' LIMIT 1),
  NOW()
FROM group_permissions gp
JOIN permissions p ON p.id = gp.permission_id
WHERE p.key = 'admin.settings.manage'
  AND NOT EXISTS (
    SELECT 1
    FROM group_permissions gp2
    JOIN permissions p2 ON p2.id = gp2.permission_id
    WHERE gp2.group_id = gp.group_id AND p2.key = 'admin.jobs.view'
  );

INSERT INTO user_permissions (id, user_id, permission_id, created_at)
SELECT
  'mig010-up-' || up.id,
  up.user_id,
  (SELECT id FROM permissions WHERE key = 'admin.jobs.view' LIMIT 1),
  NOW()
FROM user_permissions up
JOIN permissions p ON p.id = up.permission_id
WHERE p.key = 'admin.settings.manage'
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions up2
    JOIN permissions p2 ON p2.id = up2.permission_id
    WHERE up2.user_id = up.user_id AND p2.key = 'admin.jobs.view'
  );
