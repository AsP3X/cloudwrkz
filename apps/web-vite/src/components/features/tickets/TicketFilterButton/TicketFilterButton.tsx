import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig } from "../TicketFilterConfig";

// Human: Builds filter-dialog field definitions for support tickets and related tooling, driven by lists such as users or groups passed in from the parent screen.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; PURE builder; RETURNS FilterConfig; READS options only; NO HTTP.
interface TicketFilterButtonProps {
  isAgent?: boolean;
  groups?: Array<{ id: string; name: string }>;
}

export const TicketFilterButton = ({ isAgent = false, groups = [] }: TicketFilterButtonProps) => {
  const config = React.useMemo(() => getTicketFilterConfig({ isAgent, groups }), [isAgent, groups]);
  return <FilterButton config={config} />;
};
