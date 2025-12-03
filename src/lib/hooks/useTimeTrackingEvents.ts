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
  const connectRef = useRef<(() => void) | null>(null);

  // Check if we're on the client side
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            connectRef.current?.();
          }, reconnectDelay);
        } else {
          console.error("Max reconnection attempts reached");
        }
      };
    } catch (error) {
      console.error("Error creating SSE connection:", error);
    }
  }, [enabled, onEvent, router]);

  // Keep a stable reference for reconnect logic to avoid accessing
  // the callback before it is declared.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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

  const [connected, setConnected] = useState(false);

  // Track connection state in a piece of React state instead of
  // reading the ref during render to satisfy React Compiler rules.
  useEffect(() => {
    if (!isClient) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnected(false);
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnected(eventSourceRef.current?.readyState === EventSource.OPEN);
  }, [isClient]);

  return {
    connected,
  };
}
