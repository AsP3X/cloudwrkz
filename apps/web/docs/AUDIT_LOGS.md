## Audit Logs

This project includes a global `AuditLog` model to capture important user and system actions across modules.

### Data model

The Prisma model is defined as:

- `id`: unique identifier
- `userId`: who performed the action (linked to `User` where possible)
- `action`: machine-friendly key (e.g. `auth.login`, `tickets.created`)
- `resourceType` / `resourceId`: what object was affected
- `context`: structured, sanitized JSON payload with additional details
- `ipAddress`, `userAgent`: optional request context
- `createdAt`: timestamp (stored in UTC)

The table is mapped to `auditLog` with indexes for common filters and search.

### Helper for writing audit logs

Use `auditLog` from `src/server/utils/audit-log.ts` in server actions when you want to persist an audit entry instead of (or in addition to) plain logging.

The helper is defensive: failures are logged with `logger.error` and do not throw or affect the main action. It also uses `sanitizeContext` to remove sensitive values from the stored JSON payload.

Example usage:

```ts
import { auditLog } from "@/server/utils/audit-log";

await auditLog({
  action: "tickets.updated",
  userId: user.id,
  resourceType: "ticket",
  resourceId: ticket.id,
  context: {
    changes: { status: { from: "open", to: "closed" } },
  },
  ipAddress: requestIp,
  userAgent: requestUserAgent,
});
```

### Querying and exporting audit logs

`src/server/actions/admin/audit.ts` provides:

- `getAuditLogEntries(filters)`: filterable, paginated list of audit entries (by action, user, resource type/id, date range, and free-text search over user name/email).
- `getAuditLogActionOptions()`: distinct `action` values for the filter dropdown.
- `exportAuditLog(filters, format)`: export matching entries as CSV or JSON.

These server actions back the admin UI at `/dashboard/admin/audit`, where entries can be listed, filtered, searched, and exported.

### Live updates via SSE

New audit entries can be pushed to admin clients in real time using Server-Sent Events (SSE).

- `src/lib/utils/audit-log-events.ts` defines a singleton `auditLogEvents` emitter.
- `src/server/utils/audit-log.ts` emits an `"audit-log-created"` event whenever a new entry is written.
- `src/app/api/admin/audit/events/route.ts` exposes an SSE endpoint that streams these events to authorized admins.
- `src/app/(dashboard)/dashboard/admin/audit/AuditLogPageClient.tsx` subscribes to this stream on the first page and prepends matching entries to the current table, so new activity appears without a manual refresh.

