import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { getAgentStatistics } from "@/server/actions/agent/statistics";
import { AgentStatisticsPage } from "@/components/features/agent/AgentStatistics/AgentStatisticsPage";
import { STATISTICS_TIMEFRAMES, type StatisticsTimeframe } from "@/lib/constants/statistics";

export const dynamic = "force-dynamic";

interface AgentStatisticsRoutePageProps {
  searchParams: Promise<{
    timeframe?: string;
    ticketStatus?: string;
  }>;
}

export default async function AgentStatisticsRoutePage({
  searchParams,
}: AgentStatisticsRoutePageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user) {
    redirect(ROUTES.LOGIN);
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

  const stats = await getAgentStatistics({ timeframe, status: ticketStatus });

  return <AgentStatisticsPage stats={stats} timeframe={timeframe} />;
}

