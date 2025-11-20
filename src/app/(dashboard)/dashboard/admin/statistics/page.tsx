import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { requireRole } from "@/lib/utils/auth-server";
import { getUserStatistics, getTicketStatistics, getSystemStatistics } from "@/server/actions/admin/statistics";
import { StatisticsPage } from "@/components/features/admin/Statistics/StatisticsPage";

export default async function AdminStatisticsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  await requireRole("ADMIN");

  const [userStats, ticketStats, systemStats] = await Promise.all([
    getUserStatistics(),
    getTicketStatistics(),
    getSystemStatistics(),
  ]);

  return (
    <StatisticsPage
      userStatistics={userStats}
      ticketStatistics={ticketStats}
      systemStatistics={systemStats}
    />
  );
}
