import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig } from "../TicketFilterConfig";

interface TicketFilterButtonProps {
  isAgent?: boolean;
  groups?: Array<{ id: string; name: string }>;
}

export const TicketFilterButton = ({ isAgent = false, groups = [] }: TicketFilterButtonProps) => {
  const config = React.useMemo(() => getTicketFilterConfig({ isAgent, groups }), [isAgent, groups]);
  return <FilterButton config={config} />;
};
