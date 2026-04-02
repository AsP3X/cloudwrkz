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
