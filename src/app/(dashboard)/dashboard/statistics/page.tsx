import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { ROUTES } from "@/lib/constants/routes";
import { getAgentStatistics } from "@/server/actions/agent/statistics";
import { AgentStatisticsPage } from "@/components/features/agent/AgentStatistics/AgentStatisticsPage";

export const dynamic = "force-dynamic";

export default async function AgentStatisticsRoutePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const stats = await getAgentStatistics();

  return <AgentStatisticsPage stats={stats} />;
}

