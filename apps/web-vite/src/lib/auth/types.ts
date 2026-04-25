// Human: Auth/session user record as returned after login or `/me` refresh (role, modules, permissions).
// Agent: DEFINES User interface for client auth state; NO runtime; ALIGNS with API auth payloads.

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
