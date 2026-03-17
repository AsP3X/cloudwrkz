import { useAuth } from "@/components/providers/AuthProvider";
import { Badge } from "@/components/ui/Badge";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  const displayName = user.name || user.email.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Profile</h1>
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-white text-2xl font-bold">
            {initials}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {displayName}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">{user.email}</p>
            <div className="flex gap-2">
              <Badge variant="info">{user.role}</Badge>
              <Badge variant={user.status === "ACTIVE" ? "success" : "default"}>
                {user.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
