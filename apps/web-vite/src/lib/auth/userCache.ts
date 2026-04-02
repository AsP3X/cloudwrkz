import type { User } from "@/lib/auth/types";

export const AUTH_USER_CACHE_KEY = "auth_user_cache";

export function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.email !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeUserCache(user: User): void {
  try {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore quota / private mode
  }
}

export function clearUserCache(): void {
  try {
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
  } catch {
    // ignore
  }
}
