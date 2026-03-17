"use server";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";
import { sanitizeContext, type SanitizableContext } from "@/lib/utils/sanitize-context";
import { auditLogEvents } from "@/lib/utils/audit-log-events";

type AuditContext = SanitizableContext;

export interface AuditLogRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface WriteAuditLogParams {
  action: string;
  userId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  context?: AuditContext | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write an audit log entry to the database. Fire-and-forget: errors are logged
 * but do not fail the caller. Optionally also logs to application log stream.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const {
    action,
    userId = null,
    resourceType = null,
    resourceId = null,
    context: rawContext = null,
    ipAddress = null,
    userAgent = null,
  } = params;

  const context = sanitizeContext(rawContext ?? {});

  try {
    const created = await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action,
        resourceType: resourceType ?? undefined,
        resourceId: resourceId ?? undefined,
        context: context ? JSON.parse(JSON.stringify(context)) : undefined,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Emit SSE event so connected admin clients can receive live updates.
    try {
      auditLogEvents.emit("audit-log-created", {
        ...created,
        createdAt: created.createdAt.toISOString(),
      });
    } catch (emitError) {
      logger.error("Failed to emit audit log SSE event", emitError, {
        action,
        userId: userId ?? undefined,
      });
    }

    if (userId) {
      logger.audit(action, userId, { resourceType: resourceType ?? undefined, resourceId: resourceId ?? undefined, ...context });
    } else {
      logger.audit(action, "(anonymous)", { resourceType: resourceType ?? undefined, resourceId: resourceId ?? undefined, ...context });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to write audit log", error, {
      action,
      userId: userId ?? undefined,
    });
  }
}

/**
 * Fire-and-forget wrapper: call without awaiting so failed audit writes do not fail the request.
 * Use at mutation points: auditLog({ ... }) or void auditLog({ ... })
 */
export async function auditLog(params: WriteAuditLogParams): Promise<void> {
  // Intentionally do not await writeAuditLog here so callers can
  // safely do `auditLog({...})` or `void auditLog({...})` without
  // blocking their request flow. Errors are handled inside writeAuditLog.
  void writeAuditLog(params);
}
