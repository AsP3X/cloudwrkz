import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig } from "../TicketFilterConfig";

// Human: Builds filter-dialog field definitions for support tickets and related tooling, driven by lists such as users or groups passed in from the parent screen.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; PURE builder; RETURNS FilterConfig; READS options only; NO HTTP.
interface TicketFilterLoaderProps {
  isAgent?: boolean;
  groups?: Array<{ id: string; name: string }>;
}

export const TicketFilterLoader = ({ isAgent = false, groups = [] }: TicketFilterLoaderProps) => {
  const config = React.useMemo(() => getTicketFilterConfig({ isAgent, groups }), [isAgent, groups]);
  return <FilterLoader config={config} enabled={isAgent} />;
};
