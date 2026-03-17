import { redirect } from "next/navigation";
import { getCurrentUser, requireRole, requirePermissionOrRedirect } from "@/lib/utils/auth-server";
import {
  getUserStatistics,
  getTicketStatistics,
  getSystemStatistics,
} from "@/server/actions/admin/statistics";
import { StatisticsPage } from "@/components/features/admin/Statistics/StatisticsPage";
import { STATISTICS_TIMEFRAMES, type StatisticsTimeframe } from "@/lib/constants/statistics";

interface AdminStatisticsPageProps {
  searchParams: Promise<{
    timeframe?: string;
    ticketStatus?: string;
  }>;
}

export default async function AdminStatisticsPage({ searchParams }: AdminStatisticsPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect("/login");
  }

  const allowedTimeframes = STATISTICS_TIMEFRAMES.map((t) => t.value);
  const rawTimeframe = params.timeframe;
  const timeframe: StatisticsTimeframe = allowedTimeframes.includes(
    rawTimeframe as StatisticsTimeframe
  )
    ? (rawTimeframe as StatisticsTimeframe)
    : "30d";

  const allowedTicketStatuses = [
    "OPEN",
    "IN_PROGRESS",
    "PENDING",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ] as const;
  type TicketStatusFilter = (typeof allowedTicketStatuses)[number];
  const rawTicketStatus = params.ticketStatus;
  const ticketStatus: TicketStatusFilter | undefined = allowedTicketStatuses.includes(
    rawTicketStatus as TicketStatusFilter
  )
    ? (rawTicketStatus as TicketStatusFilter)
    : undefined;

  await Promise.all([requireRole("ADMIN"), requirePermissionOrRedirect("admin.statistics.view")]);

  const [userStats, ticketStats, systemStats] = await Promise.all([
    getUserStatistics({ timeframe }),
    getTicketStatistics({ timeframe, status: ticketStatus }),
    getSystemStatistics({ timeframe }),
  ]);

  return (
    <StatisticsPage
      userStatistics={userStats}
      ticketStatistics={ticketStats}
      systemStatistics={systemStats}
      timeframe={timeframe}
    />
  );
}
