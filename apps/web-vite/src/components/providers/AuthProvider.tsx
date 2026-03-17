import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { log } from "@/lib/logger";
import { ROUTES } from "@/lib/constants/routes";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "AGENT" | "ADMIN" | "MODERATOR";
  status: string;
  avatar: string | null;
  timezone: string | null;
  emailVerified: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  register: (data: { name: string; email: string; password: string; confirmPassword: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface MeResponse {
  name: string | null;
  email: string;
  modules: string[];
}

interface LoginApiResponse {
  token: string;
  user: { name: string | null; email: string };
}

interface RegisterApiResponse {
  message: string;
  user_id?: string;
  email?: string;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>("/me");
      setUser({
        id: "",
        email: data.email,
        name: data.name,
        role: "USER",
        status: "ACTIVE",
        avatar: null,
        timezone: null,
        emailVerified: true,
        createdAt: "",
      });
    } catch {
      setUser(null);
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
      navigate(ROUTES.LOGIN + "?error=session_expired");
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [navigate]);

  const login = async (email: string, password: string, rememberMe = false) => {
    try {
      const result = await api.post<LoginApiResponse>(
        "/auth/login",
        { email, password, remember_me: rememberMe },
      );
      if (result.token) {
        localStorage.setItem("auth_token", result.token);
        setUser({
          id: "",
          email: result.user.email,
          name: result.user.name,
          role: "USER",
          status: "ACTIVE",
          avatar: null,
          timezone: null,
          emailVerified: true,
          createdAt: "",
        });
        await fetchUser();
        return { success: true };
      }
      return { success: false, error: "Login failed" };
    } catch (err) {
      log.error("Login failed", { err, message: err instanceof Error ? err.message : String(err) });
      if (err instanceof ApiError) {
        return { success: false, error: err.message };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return { success: false, error: message || "An unexpected error occurred" };
    }
  };

  const register = async (data: { name: string; email: string; password: string; confirmPassword: string }) => {
    try {
      log.info("Register attempt", { email: data.email });
      await api.post<RegisterApiResponse>("/auth/register", {
        name: data.name,
        email: data.email,
        password: data.password,
        confirm_password: data.confirmPassword,
      });
      return { success: true };
    } catch (err) {
      log.error("Register failed", {
        err,
        message: err instanceof Error ? err.message : String(err),
        email: data.email,
        status: err instanceof ApiError ? err.status : undefined,
      });
      if (err instanceof ApiError) {
        return { success: false, error: err.message };
      }
      const message = err instanceof Error ? err.message : "Network or server error";
      return { success: false, error: message || "An unexpected error occurred" };
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
    navigate(ROUTES.LOGIN);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
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
