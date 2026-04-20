import { log } from "@/lib/logger";
import { credentialsForApiFetch, getApiBaseUrl } from "@/lib/apiBaseUrl";
import {
  enqueueOfflineMutation,
  initOfflineMutationQueueListeners,
  pickReplayHeaders,
  registerOfflineMutationExecutor,
  shouldQueueOfflineMutation,
} from "@/api/offlineMutationQueue";
import { wrapFetchFailure } from "@/api/networkTransportError";

const API_BASE_URL = getApiBaseUrl();

// Search endpoints currently live on the legacy Next.js app under `/api`.
// This separate base URL allows us to reuse the full fuzzy search implementation there.
// In dev, we proxy `/next-api` to the Next.js app (see `vite.config.ts`).
const SEARCH_API_BASE_URL =
  import.meta.env.VITE_SEARCH_API_URL || "/next-api";

/** API error body: { error: { code, message, fields? } } */
function getErrorMessage(data: unknown, statusText: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error?: { message?: string } | string }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && typeof err.message === "string")
      return err.message;
  }
  return statusText || "Request failed";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * POST /auth/login and /auth/register return 202 + { queued, job_id } but use dedicated
 * status URLs (`/auth/login/status/...`, `/auth/register/status/...`). They must not go
 * through mutation-job polling (GET /mutation-jobs/:id), or AuthProvider never gets the
 * 202 JSON and the login form cannot show the queued sign-in banner.
 *
 * POST /auth/qr-login/finalize is the same shape while the browser has no session yet;
 * `QrLoginPanel` polls GET /auth/qr-login/finalize/status/{job_id} with `X-QR-Browser-Token`.
 * Mutation-job polling would send GET /mutation-jobs/:id without a Bearer token and fail
 * with 401, leaving the website stuck after the app approves the QR flow.
 */
const MUTATION_JOB_POLL_EXCLUDED_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/qr-login/finalize",
]);

/** API returned 202 when Postgres was briefly unreachable; same pattern as login/register. */
interface MutationQueuedPayload {
  queued?: boolean;
  job_id?: string;
  retry_deadline_secs?: number;
  message?: string;
  /** Present for ticket/todo/time/link persisted jobs: matches `background_jobs.job_type`. */
  job_type?: string;
}

interface MutationJobStatusPayload {
  status: "pending" | "completed" | "failed";
  message?: string;
  http_status?: number;
  body?: unknown;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollMutationJobUntilDone<T>(
  jobId: string,
  retryDeadlineSecs: number,
  path: string,
): Promise<T> {
  const maxWaitSecs = retryDeadlineSecs + 5;
  const deadline = Date.now() + maxWaitSecs * 1000;
  try {
    while (Date.now() < deadline) {
      await sleepMs(800);
      const st = await requestWithBase<MutationJobStatusPayload>(
        API_BASE_URL,
        `/mutation-jobs/${jobId}`,
        { method: "GET" },
      );
      if (st.status === "completed") {
        const code = st.http_status ?? 200;
        if (code >= 400) {
          const msg =
            typeof st.message === "string" ? st.message : "Request failed";
          throw new ApiError(code, msg, st.body);
        }
        return st.body as T;
      }
      if (st.status === "failed") {
        throw new ApiError(
          400,
          st.message || "Change could not be applied",
          st,
        );
      }
    }
    throw new ApiError(
      504,
      "The server took too long to apply your change. Please try again.",
      undefined,
    );
  } finally {
    window.dispatchEvent(new CustomEvent("cloudwrkz:mutation-finished", { detail: { path, jobId } }));
  }
}

async function requestWithBase<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const method = (options.method || "GET").toUpperCase();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = localStorage.getItem("auth_token");
  const hadAuthToken = Boolean(token);
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  log.info("API request", { method, path, url });

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: credentialsForApiFetch(url),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("API request failed (network)", {
      method,
      path,
      url,
      message,
      err: err instanceof Error ? err : String(err),
    });
    throw wrapFetchFailure(err);
  }

  const isMe401 = path === "/me" && response.status === 401;
  if (isMe401) {
    log.debug("API response", { method, path, status: 401 });
  } else {
    log.info("API response", {
      method,
      path,
      status: response.status,
      statusText: response.statusText,
    });
  }

  // Only invalidate local session when the failing request was sent with a token.
  // This prevents stale unauthenticated background calls (e.g. /me during login)
  // from clearing a freshly stored token due to race timing.
  if (response.status === 401 && hadAuthToken) {
    localStorage.removeItem("auth_token");
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }

  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    const message = getErrorMessage(data, response.statusText);
    if (isMe401) {
      log.debug("GET /me returned 401 (not logged in)", { path, status: 401 });
    } else {
      log.error("API error response", {
        method,
        path,
        status: response.status,
        message,
        body: data,
      });
    }
    throw new ApiError(response.status, message, data);
  }

  if (
    response.status === 202 &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
    !MUTATION_JOB_POLL_EXCLUDED_PATHS.has(path)
  ) {
    const data = (await response.json()) as MutationQueuedPayload;
    const jobId = data?.job_id;
    // Poll when the server returned a job id. Treat missing `queued` like true so proxies or
    // older clients still follow the mutation-jobs contract.
    if (typeof jobId === "string" && jobId.length > 0 && data?.queued !== false) {
      log.info("API mutation queued for DB retry", {
        path,
        jobId,
      });
      window.dispatchEvent(
        new CustomEvent("cloudwrkz:mutation-queued", {
          detail: {
            job_id: jobId,
            message: data.message,
            path,
            retry_deadline_secs: data.retry_deadline_secs ?? 30,
          },
        }),
      );
      return pollMutationJobUntilDone<T>(
        jobId,
        data.retry_deadline_secs ?? 30,
        path,
      );
    }
    return data as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

registerOfflineMutationExecutor(async (item) => {
  return requestWithBase(API_BASE_URL, item.path, {
    method: item.method,
    body: item.body ?? undefined,
    headers: item.headers,
  });
});

initOfflineMutationQueueListeners();

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  try {
    return await requestWithBase<T>(API_BASE_URL, path, options);
  } catch (err) {
    if (!shouldQueueOfflineMutation(path, method, err)) {
      throw err;
    }
    const body =
      typeof options.body === "string"
        ? options.body
        : options.body != null
          ? String(options.body)
          : null;
    return enqueueOfflineMutation<T>({
      path,
      method,
      body,
      headers: pickReplayHeaders(options.headers),
    });
  }
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: "DELETE" }),

  /** Multipart uploads are not persisted to the offline queue (body is not JSON-serializable). */
  upload: <T>(path: string, formData: FormData, options?: RequestInit) => {
    const url = `${API_BASE_URL}${path}`;
    const headers: Record<string, string> = {};
    const token = localStorage.getItem("auth_token");
    const hadAuthToken = Boolean(token);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    log.info("API request", { method: "POST", path, url });
    return fetch(url, {
      ...options,
      method: "POST",
      headers,
      body: formData,
      credentials: credentialsForApiFetch(url),
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error("API upload failed (network)", { path, url, message, err });
      throw wrapFetchFailure(err);
    })
    .then(async (response) => {
      log.info("API response", {
        method: "POST",
        path,
        status: response.status,
        statusText: response.statusText,
      });
      if (response.status === 401 && hadAuthToken) {
        localStorage.removeItem("auth_token");
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
      if (!response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          data = undefined;
        }
        const message = getErrorMessage(data, response.statusText);
        log.error("API error response", {
          method: "POST",
          path,
          status: response.status,
          message,
          body: data,
        });
        throw new ApiError(response.status, message, data);
      }
      return response.json() as Promise<T>;
    });
  },
};

export const searchApi = {
  get: <T>(path: string, options?: RequestInit) =>
    requestWithBase<T>(SEARCH_API_BASE_URL, path, {
      ...options,
      method: "GET",
    }),

  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    requestWithBase<T>(SEARCH_API_BASE_URL, path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
};
