import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { timeTrackingEvents } from "@/lib/utils/event-emitter";

export async function GET(request: NextRequest) {
  // Authenticate user
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      send(`data: ${JSON.stringify({ type: "connected", userId: user.id })}\n\n`);

      // Create event handler for this user
      const eventHandler = (data: any) => {
        // Only send events for this user
        if (data.userId === user.id) {
          send(`data: ${JSON.stringify(data)}\n\n`);
        }
      };

      // Subscribe to time tracking events
      timeTrackingEvents.on("time-entry-update", eventHandler);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        timeTrackingEvents.off("time-entry-update", eventHandler);
        controller.close();
      });

      // Keep connection alive with periodic ping
      const pingInterval = setInterval(() => {
        try {
          send(`: ping\n\n`);
        } catch (error) {
          clearInterval(pingInterval);
          timeTrackingEvents.off("time-entry-update", eventHandler);
          controller.close();
        }
      }, 30000); // Ping every 30 seconds

      // Cleanup on close
      const cleanup = () => {
        clearInterval(pingInterval);
        timeTrackingEvents.off("time-entry-update", eventHandler);
      };

      // Handle stream close
      const originalClose = controller.close.bind(controller);
      controller.close = () => {
        cleanup();
        return originalClose();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable buffering in nginx
    },
  });
}
