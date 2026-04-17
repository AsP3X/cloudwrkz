import { log } from "@/lib/logger";
import { NetworkTransportError } from "@/api/networkTransportError";

const STORAGE_KEY = "cloudwrkz:offline-mutation-queue";
const MAX_QUEUED = 100;

/** Same exclusions as server-side mutation polling: auth flows have their own UX. */
const OFFLINE_QUEUE_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/qr-login/finalize",
]);

export type OfflineQueuedMutation = {
  id: string;
  path: string;
  method: string;
  /** JSON string or null for no body */
  body: string | null;
  headers?: Record<string, string>;
};

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let queue: OfflineQueuedMutation[] = [];
const pending = new Map<string, PendingEntry>();
const listeners = new Set<() => void>();
let processing = false;

/** When the browser stays "online" but the API is still unreachable, `online` never fires — retry drain on a timer. */
let drainRetryTimer: ReturnType<typeof setTimeout> | null = null;

const DRAIN_RETRY_MS = 5000;

function clearDrainRetryTimer(): void {
  if (drainRetryTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(drainRetryTimer);
    drainRetryTimer = null;
  }
}

function scheduleDrainRetryAfterTransportFailure(): void {
  if (typeof window === "undefined" || queue.length === 0) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  clearDrainRetryTimer();
  drainRetryTimer = window.setTimeout(() => {
    drainRetryTimer = null;
    void scheduleDrain();
  }, DRAIN_RETRY_MS);
}

type Executor = (item: OfflineQueuedMutation) => Promise<unknown>;

let executor: Executor | null = null;

function notify() {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent("cloudwrkz:offline-mutation-queue-changed"));
}

function loadFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      queue = [];
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      queue = [];
      return;
    }
    queue = parsed.filter(
      (x): x is OfflineQueuedMutation =>
        x &&
        typeof x === "object" &&
        typeof (x as OfflineQueuedMutation).id === "string" &&
        typeof (x as OfflineQueuedMutation).path === "string" &&
        typeof (x as OfflineQueuedMutation).method === "string",
    );
  } catch {
    queue = [];
  }
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    log.error("offline mutation queue: persist failed", { err: e });
  }
}

loadFromStorage();

export function registerOfflineMutationExecutor(fn: Executor): void {
  executor = fn;
}

export function subscribeOfflineMutationQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineMutationQueueLength(): number {
  return queue.length;
}

export function isOfflineMutationProcessing(): boolean {
  return processing;
}

export function pickReplayHeaders(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  const h = new Headers(headers);
  const idem = h.get("Idempotency-Key");
  if (!idem) return undefined;
  return { "Idempotency-Key": idem };
}

export function isLikelyNetworkFailure(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof NetworkTransportError) return true;
  if (typeof err === "object" && err !== null && "name" in err && (err as { name?: string }).name === "AbortError") {
    return false;
  }
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("Load failed") ||
    msg.includes("NetworkError") ||
    msg.includes("network") ||
    msg.includes("ECONNREFUSED")
  );
}

export function shouldQueueOfflineMutation(path: string, method: string, err: unknown): boolean {
  const m = method.toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(m)) return false;
  if (OFFLINE_QUEUE_EXCLUDED_PATHS.has(path)) return false;
  if (queue.length >= MAX_QUEUED) return false;
  // HTTP failures from the API must not be retried as "offline" replays (distinct from transport errors).
  if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ApiError") {
    return false;
  }
  return isLikelyNetworkFailure(err);
}

export async function enqueueOfflineMutation<T>(
  item: Omit<OfflineQueuedMutation, "id">,
): Promise<T> {
  if (!executor) {
    throw new Error("Offline mutation executor not registered");
  }
  const id = crypto.randomUUID();
  const full: OfflineQueuedMutation = { id, ...item };
  queue.push(full);
  persist();
  notify();
  log.info("offline mutation queue: enqueued", { path: item.path, method: item.method, id });
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("cloudwrkz:offline-mutation-enqueued", {
        detail: { path: item.path, method: item.method.toUpperCase(), id },
      }),
    );
  }

  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    void scheduleDrain();
  });
}

async function scheduleDrain(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }
  if (processing) return;
  if (!executor || queue.length === 0) {
    clearDrainRetryTimer();
    return;
  }

  processing = true;
  notify();

  try {
    while (queue.length > 0) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        break;
      }
      const item = queue[0];
      const exec = executor;
      if (!exec) break;

      try {
        log.info("offline mutation queue: replaying", { path: item.path, method: item.method, id: item.id });
        const result = await exec(item);
        queue.shift();
        persist();
        const entry = pending.get(item.id);
        pending.delete(item.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("cloudwrkz:offline-mutation-finished", {
              detail: { path: item.path, method: item.method.toUpperCase(), id: item.id },
            }),
          );
        }
        if (entry) {
          entry.resolve(result);
        }
      } catch (err) {
        if (isLikelyNetworkFailure(err)) {
          log.warn("offline mutation queue: replay failed (network), will retry", {
            path: item.path,
            id: item.id,
          });
          scheduleDrainRetryAfterTransportFailure();
          break;
        }
        queue.shift();
        persist();
        const entry = pending.get(item.id);
        pending.delete(item.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("cloudwrkz:offline-mutation-finished", {
              detail: { path: item.path, method: item.method.toUpperCase(), id: item.id },
            }),
          );
        }
        if (entry) {
          entry.reject(err);
        }
        log.error("offline mutation queue: replay failed", {
          path: item.path,
          id: item.id,
          err,
        });
      }
      notify();
    }
  } finally {
    processing = false;
    if (queue.length === 0) {
      clearDrainRetryTimer();
    }
    notify();
  }
}

export function initOfflineMutationQueueListeners(): void {
  if (typeof window === "undefined") return;

  const onOnline = () => {
    clearDrainRetryTimer();
    void scheduleDrain();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void scheduleDrain();
    }
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  queueMicrotask(() => {
    void scheduleDrain();
  });
}
