import { NextRequest } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/utils/auth-server";
import { auditLogEvents } from "@/lib/utils/audit-log-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await requirePermission("audit.view");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(data));
      };

      // Initial connection message (can be used by clients for debugging).
      send(
        `data: ${JSON.stringify({
          type: "connected",
          userId: user.id,
        })}\n\n`
      );

      const eventHandler = (log: any) => {
        send(
          `data: ${JSON.stringify({
            type: "audit-log-created",
            log,
          })}\n\n`
        );
      };

      auditLogEvents.on("audit-log-created", eventHandler);

      // Keep connection alive with periodic ping.
      const pingInterval = setInterval(() => {
        try {
          send(`: ping\n\n`);
        } catch {
          // If sending fails, assume the connection is dead and close.
          clearInterval(pingInterval);
          if (!closed) {
            closed = true;
            auditLogEvents.off("audit-log-created", eventHandler);
            try {
              controller.close();
            } catch {
              // ignore
            }
          }
        }
      }, 30000);

      const closeStream = () => {
        if (closed) return;
        closed = true;
        clearInterval(pingInterval);
        auditLogEvents.off("audit-log-created", eventHandler);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // Handle client disconnect.
      request.signal.addEventListener("abort", () => {
        closeStream();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

