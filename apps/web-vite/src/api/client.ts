import { log } from "@/lib/logger";

// In dev, always use the Vite proxy (relative URL) so CORS is not required when the app runs on a different port (e.g. 5174)
const API_BASE_URL =
  import.meta.env.DEV ? "/api/v1" : (import.meta.env.VITE_API_URL || "/api/v1");

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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = (options.method || "GET").toUpperCase();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = localStorage.getItem("auth_token");
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  log.info("API request", { method, path, url });

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
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
    throw err;
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

  if (response.status === 401) {
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

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
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

  upload: <T>(path: string, formData: FormData, options?: RequestInit) => {
    const url = `${API_BASE_URL}${path}`;
    const headers: Record<string, string> = {};
    const token = localStorage.getItem("auth_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    log.info("API request", { method: "POST", path, url });
    return fetch(url, {
      ...options,
      method: "POST",
      headers,
      body: formData,
      credentials: "include",
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error("API upload failed (network)", { path, url, message, err });
      throw err;
    })
    .then(async (response) => {
      log.info("API response", {
        method: "POST",
        path,
        status: response.status,
        statusText: response.statusText,
      });
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
