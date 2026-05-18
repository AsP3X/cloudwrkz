// Human: Application-wide authentication context: session restore, login and register flows (including queued 202 handling), permissions, and resilient behavior when the API is unreachable.
// Agent: HTTP api /auth/* and /me; READS WRITES localStorage auth_token and user cache; EXPOSES login, logout, refreshUser, can(); NAVIGATES via useNavigate on auth events.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { NetworkTransportError } from "@/api/networkTransportError";
import { log } from "@/lib/logger";
import { ROUTES } from "@/lib/constants/routes";
import { setStoredRegisterJobId } from "@/lib/auth/pendingRegistration";
import {
  clearUserCache,
  readCachedUser,
  writeUserCache,
} from "@/lib/auth/userCache";
import type { User } from "@/lib/auth/types";

export type { User };

/** Set while the API returned 202 and the client is polling `/auth/login/status/...`. */
export type LoginQueuedUiState = {
  headline: string;
  supportLines: string[];
  maxWaitSecs: number;
  startedAt: number;
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * True when the API could not be reached or returned a non-auth error while a token still exists.
   * The session is not cleared; user may be restored from cache or missing until the API is back.
   */
  needsConnection: boolean;
  modules: string[];
  /** Permission keys the user has (from API /me). Empty if not using permission system. */
  permissions: string[];
  /** Returns true if the user has the given permission key (or if they have no permissions set, for legacy behavior). */
  can: (permission: string) => boolean;
  /** When non-null, show queued-login progress in the UI (sign-in accepted, waiting on DB). */
  loginQueuedUi: LoginQueuedUiState | null;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<
    | { success: true; wasQueued: true }
    | { success: false; error: string; outageHint?: boolean; httpStatus?: number }
  >;
  register: (data: { name: string; email: string; password: string }) => Promise<
    | { success: true; queued: true; jobId: string; message: string }
    | { success: false; error: string; outageHint?: boolean; httpStatus?: number }
  >;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** After POST /setup succeeds, persist the session token and load `/me`. */
  completeSetupSession: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface MeResponse {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  avatar: string | null;
  timezone: string;
  theme: string;
  emailVerified: boolean;
  createdAt: string;
  bio?: string | null;
  lastLoginAt?: string | null;
  modules: string[];
  permissions?: string[];
}

interface LoginQueuedApiResponse {
  message: string;
  queued: boolean;
  job_id: string;
  retry_deadline_secs?: number;
}

interface LoginJobStatusPayload {
  status: "pending" | "completed" | "failed";
  message?: string;
  token?: string;
  user?: { name: string | null; email: string };
  client_hint?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ME_FETCH_MAX_ATTEMPTS = 3;

function isMeRetryable(err: unknown): boolean {
  if (err instanceof NetworkTransportError) return true;
  if (err instanceof ApiError) {
    return err.status === 502 || err.status === 503 || err.status === 504;
  }
  return false;
}

function hasAuthToken(): boolean {
  return Boolean(localStorage.getItem("auth_token"));
}

interface RegisterApiResponse {
  message: string;
  user_id?: string;
  email?: string;
  queued?: boolean;
  job_id?: string;
  retry_deadline_secs?: number;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [loginQueuedUi, setLoginQueuedUi] = useState<LoginQueuedUiState | null>(null);
  const navigate = useNavigate();

  // Match Next.js: no permissions = no access. Permissions must be assigned via groups or user_permissions.
  const can = useCallback((permission: string) => {
    return permissions.length > 0 && permissions.includes(permission);
  }, [permissions]);

  const fetchUser = useCallback(async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= ME_FETCH_MAX_ATTEMPTS; attempt++) {
      try {
        const data = await api.get<MeResponse>("/me");
        const perms = data.permissions ?? [];
        const next: User = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role as User["role"],
          status: data.status,
          avatar: data.avatar,
          timezone: data.timezone,
          theme: data.theme,
          emailVerified: data.emailVerified,
          createdAt: data.createdAt,
          bio: data.bio ?? null,
          lastLoginAt: data.lastLoginAt ?? null,
          modules: data.modules,
          permissions: perms,
        };
        setUser(next);
        setModules(data.modules);
        setPermissions(perms);
        writeUserCache(next);
        setNeedsConnection(false);
        setLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        if (err instanceof ApiError && err.status === 401) {
          break;
        }
        if (attempt < ME_FETCH_MAX_ATTEMPTS && isMeRetryable(err)) {
          await sleep(600 * attempt);
          continue;
        }
        break;
      }
    }

    const err = lastErr;
    if (err instanceof ApiError && err.status === 401) {
      log.debug("GET /me returned 401 (session invalid or logged out)", {
        status: err.status,
      });
      clearUserCache();
      setUser(null);
      setModules([]);
      setPermissions([]);
      setNeedsConnection(false);
    } else {
      const status = err instanceof ApiError ? err.status : undefined;
      const msg = err instanceof Error ? err.message : String(err);
      log.warn("GET /me failed (API unreachable or non-auth error)", {
        message: msg,
        status,
      });
      if (hasAuthToken()) {
        const cached = readCachedUser();
        if (cached) {
          setUser(cached);
          setModules(cached.modules);
          setPermissions(cached.permissions);
        } else {
          setUser(null);
          setModules([]);
          setPermissions([]);
        }
        setNeedsConnection(true);
      } else {
        setUser(null);
        setModules([]);
        setPermissions([]);
        setNeedsConnection(false);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearUserCache();
      setNeedsConnection(false);
      setUser(null);
      setModules([]);
      setPermissions([]);
      navigate(ROUTES.LOGIN + "?error=session_expired");
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [navigate]);

  const login = async (
    email: string,
    password: string,
    rememberMe = false,
  ): Promise<
    | { success: true; wasQueued: true }
    | { success: false; error: string; outageHint?: boolean; httpStatus?: number }
  > => {
    try {
      const result = await api.post<LoginQueuedApiResponse>("/auth/login", {
        email,
        password,
        remember_me: rememberMe,
      });

      if ("queued" in result && result.queued && result.job_id) {
        log.info("Login queued by API, polling status", { jobId: result.job_id });
        const maxWaitSecs = (result.retry_deadline_secs ?? 30) + 5;
        setLoginQueuedUi({
          headline: "Sign-in processing",
          supportLines: [
            "POST /auth/login always returns 202: the API processes sign-in in the background, whether the database is healthy or briefly unavailable.",
            "If Postgres was down when you submitted, the server retries for up to about 30 seconds—stay on this page.",
            "We poll job status about once per second—do not press Sign in again unless this times out or fails.",
            `If nothing completes within about ${result.retry_deadline_secs ?? 30} seconds, you will see an error below.`,
          ],
          maxWaitSecs,
          startedAt: Date.now(),
        });
        const deadline = Date.now() + maxWaitSecs * 1000;
        try {
          while (Date.now() < deadline) {
            try {
              const st = await api.get<LoginJobStatusPayload>(`/auth/login/status/${result.job_id}`);
              if (st.status === "completed" && st.token) {
                localStorage.setItem("auth_token", st.token);
                await fetchUser();
                return { success: true as const, wasQueued: true };
              }
              if (st.status === "failed") {
                if (st.client_hint === "BANNED") {
                  return { success: false as const, error: "BANNED" };
                }
                if (st.client_hint === "SUSPENDED") {
                  return {
                    success: false as const,
                    error: st.message || "Your account has been suspended.",
                  };
                }
                return {
                  success: false as const,
                  error: st.message || "Sign-in failed",
                };
              }
            } catch (pollErr) {
              if (pollErr instanceof ApiError && pollErr.status === 404) {
                return {
                  success: false as const,
                  error: "Sign-in job expired. Please try again.",
                };
              }
              log.warn("login job poll error", { pollErr });
            }
            await sleep(1000);
          }
          return {
            success: false as const,
            error: "Sign-in timed out. Please try again.",
          };
        } finally {
          setLoginQueuedUi(null);
        }
      }

      return {
        success: false as const,
        error: "Unexpected login response (expected 202 with job_id).",
      };
    } catch (err) {
      log.error("Login failed", { err, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof ApiError) {
        const outageHint = err.status === 502 || err.status === 503 || err.status === 504;
        return {
          success: false as const,
          error: err.message,
          outageHint,
          httpStatus: err.status,
        };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return {
        success: false as const,
        error: message || "An unexpected error occurred",
        outageHint: true,
      };
    }
  };

  const register = async (data: { name: string; email: string; password: string }) => {
    try {
      log.info("Register attempt", { email: data.email });
      const res = await api.post<RegisterApiResponse>("/auth/register", {
        name: data.name,
        email: data.email,
        password: data.password,
      });
      if (res.queued && res.job_id) {
        setStoredRegisterJobId(res.job_id);
        log.info("Register job accepted by API", { email: data.email, jobId: res.job_id });
        return {
          success: true as const,
          queued: true as const,
          jobId: res.job_id,
          message: res.message,
        };
      }
      return {
        success: false as const,
        error: res.message || "Registration did not return a job id (expected 202).",
      };
    } catch (err) {
      log.error("Register failed", {
        err,
        message: err instanceof Error ? err.message : String(err),
        email: data.email,
        status: err instanceof ApiError ? err.status : undefined,
      });
      if (err instanceof ApiError) {
        const outageHint = err.status === 502 || err.status === 503 || err.status === 504;
        return {
          success: false as const,
          error: err.message,
          outageHint,
          httpStatus: err.status,
        };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return {
        success: false as const,
        error: message || "An unexpected error occurred",
        outageHint: true,
      };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors during logout
    }
    localStorage.removeItem("auth_token");
    clearUserCache();
    setNeedsConnection(false);
    setUser(null);
    setModules([]);
    setPermissions([]);
    navigate(ROUTES.LOGIN);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  // Human: First-run setup returns a bearer token synchronously (unlike queued login); store it and hydrate `/me`.
  // Agent: WRITES localStorage auth_token; CALLS fetchUser; CLEARS needsConnection.
  const completeSetupSession = async (token: string) => {
    localStorage.setItem("auth_token", token);
    setNeedsConnection(false);
    await fetchUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsConnection,
        modules,
        permissions,
        can,
        loginQueuedUi,
        login,
        register,
        logout,
        refreshUser,
        completeSetupSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
