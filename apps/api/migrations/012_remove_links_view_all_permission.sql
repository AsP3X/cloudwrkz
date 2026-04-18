-- links.view_all allowed cross-user link visibility in search and was a data-protection risk.
-- Remove the permission; FKs cascade assignments.
DELETE FROM permissions WHERE key = 'links.view_all';
