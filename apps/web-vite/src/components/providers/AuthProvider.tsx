import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { log } from "@/lib/logger";
import { ROUTES } from "@/lib/constants/routes";
import { setStoredRegisterJobId } from "@/lib/auth/pendingRegistration";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
  status: string;
  avatar: string | null;
  timezone: string | null;
  theme: string | null;
  emailVerified: boolean;
  createdAt: string;
  bio: string | null;
  lastLoginAt: string | null;
  modules: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  modules: string[];
  /** Permission keys the user has (from API /me). Empty if not using permission system. */
  permissions: string[];
  /** Returns true if the user has the given permission key (or if they have no permissions set, for legacy behavior). */
  can: (permission: string) => boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<{ success: true; wasQueued?: boolean } | { success: false; error: string }>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<
    | { success: true; queued?: false }
    | { success: true; queued: true; jobId: string; message: string }
    | { success: false; error: string }
  >;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

interface LoginApiResponse {
  token: string;
  user: { name: string | null; email: string };
}

interface LoginQueuedApiResponse {
  message: string;
  queued: boolean;
  job_id: string;
  retry_deadline_secs: number;
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
  const navigate = useNavigate();

  // Match Next.js: no permissions = no access. Permissions must be assigned via groups or user_permissions.
  const can = useCallback((permission: string) => {
    return permissions.length > 0 && permissions.includes(permission);
  }, [permissions]);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>("/me");
      const perms = data.permissions ?? [];
      setUser({
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
      });
      setModules(data.modules);
      setPermissions(perms);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      if (status !== 401) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn("GET /me failed (API unreachable or error)", {
          message: msg,
          status,
        });
      }
      setUser(null);
      setModules([]);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setModules([]);
      navigate(ROUTES.LOGIN + "?error=session_expired");
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [navigate]);

  const login = async (email: string, password: string, rememberMe = false) => {
    try {
      const result = await api.post<LoginApiResponse | LoginQueuedApiResponse>("/auth/login", {
        email,
        password,
        remember_me: rememberMe,
      });

      if ("queued" in result && result.queued && result.job_id) {
        log.info("Login queued by API, polling status", { jobId: result.job_id });
        const deadline = Date.now() + 35_000;
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
          error: "Sign-in timed out while waiting for the database. Please try again.",
        };
      }

      if ("token" in result && result.token) {
        localStorage.setItem("auth_token", result.token);
        await fetchUser();
        return { success: true as const };
      }
      return { success: false as const, error: "Login failed" };
    } catch (err) {
      log.error("Login failed", { err, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof ApiError) {
        return { success: false as const, error: err.message };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return {
        success: false as const,
        error: message || "An unexpected error occurred",
      };
    }
  };

  const register = async (data: { name: string; email: string; password: string; confirmPassword: string }) => {
    try {
      log.info("Register attempt", { email: data.email });
      const res = await api.post<RegisterApiResponse>("/auth/register", {
        name: data.name,
        email: data.email,
        password: data.password,
        confirm_password: data.confirmPassword,
      });
      if (res.queued && res.job_id) {
        setStoredRegisterJobId(res.job_id);
        log.info("Register queued by API", { email: data.email, jobId: res.job_id });
        return {
          success: true as const,
          queued: true as const,
          jobId: res.job_id,
          message: res.message,
        };
      }
      return { success: true as const };
    } catch (err) {
      log.error("Register failed", {
        err,
        message: err instanceof Error ? err.message : String(err),
        email: data.email,
        status: err instanceof ApiError ? err.status : undefined,
      });
      if (err instanceof ApiError) {
        return { success: false as const, error: err.message };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return {
        success: false as const,
        error: message || "An unexpected error occurred",
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
    setUser(null);
    setModules([]);
    setPermissions([]);
    navigate(ROUTES.LOGIN);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, modules, permissions, can, login, register, logout, refreshUser }}>
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
