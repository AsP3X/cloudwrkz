import * as React from "react";
import {
  getOfflineMutationQueueLength,
  isOfflineMutationProcessing,
  subscribeOfflineMutationQueue,
} from "@/api/offlineMutationQueue";

/**
 * Shown when mutations could not reach the API and were stored locally; they replay in order
 * when the browser is back online (`offlineMutationQueue.ts`).
 */
export function LocalOfflineQueueNotice() {
  const [len, setLen] = React.useState(() => getOfflineMutationQueueLength());
  const [syncing, setSyncing] = React.useState(() => isOfflineMutationProcessing());
  const [online, setOnline] = React.useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const refresh = () => {
      setLen(getOfflineMutationQueueLength());
      setSyncing(isOfflineMutationProcessing());
    };
    const unsub = subscribeOfflineMutationQueue(refresh);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (len === 0 && !syncing) {
    return null;
  }

  const headline = syncing
    ? "Sending queued changes…"
    : online
      ? "Could not reach the server"
      : "You are offline";

  const detail =
    len === 1
      ? "One change is saved on this device and will be sent automatically when the connection is working again. Do not close this tab if you need it applied."
      : `${len} changes are saved on this device and will be sent in order when the connection is working again. Do not close this tab if you need them applied.`;

  return (
    <div
      className="mb-4 rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 shadow-sm px-3 py-2.5"
      role="status"
      aria-live="polite"
      aria-label="Offline save queue"
    >
      <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">{headline}</p>
      <p className="mt-1 text-sm text-sky-900/90 dark:text-sky-100/90">{detail}</p>
    </div>
  );
}
