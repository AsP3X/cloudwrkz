import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getNotifications } from "@/server/actions/notifications";
import { NotificationsPageClient } from "./NotificationsPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(ROUTES.LOGIN);

  const result = await getNotifications(50);
  const notifications = result.success && result.data ? result.data.notifications : [];
  const unreadCount = result.success && result.data ? result.data.unreadCount : 0;

  return (
    <NotificationsPageClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
    />
  );
}
