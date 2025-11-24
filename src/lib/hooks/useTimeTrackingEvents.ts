"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export type TimeTrackingEvent =
  | { type: "ENTRY_CREATED"; data: any }
  | { type: "ENTRY_UPDATED"; data: any }
  | { type: "ENTRY_DELETED"; data: { id: string } }
  | { type: "ENTRY_STATUS_CHANGED"; data: { id: string; status: string; entry: any } };

interface UseTimeTrackingEventsOptions {
  onEvent?: (event: TimeTrackingEvent) => void;
  enabled?: boolean;
}

export function useTimeTrackingEvents(options: UseTimeTrackingEventsOptions = {}) {
  const { onEvent, enabled = true } = options;
  const router = useRouter();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds
  const [isClient, setIsClient] = useState(false);

  // Check if we're on the client side
  useEffect(() => {
    setIsClient(typeof window !== "undefined");
  }, []);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined" || !window.EventSource) return;

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource("/api/time-tracking/events");
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("SSE connection opened");
        reconnectAttempts.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "connected") {
            console.log("SSE connected for user:", data.userId);
            return;
          }

          // Handle time tracking events
          const timeTrackingEvent: TimeTrackingEvent = {
            type: data.type,
            data: data.data,
          };

          // Call the callback if provided
          if (onEvent) {
            onEvent(timeTrackingEvent);
          }

          // Refresh the page to update the UI
          router.refresh();
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        eventSource.close();

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          console.error("Max reconnection attempts reached");
        }
      };
    } catch (error) {
      console.error("Error creating SSE connection:", error);
    }
  }, [enabled, onEvent, router]);

  useEffect(() => {
    if (enabled && isClient) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [enabled, isClient, connect]);

  return {
    connected: isClient && eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}
