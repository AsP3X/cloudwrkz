import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig } from "../TicketFilterConfig";

interface TicketFilterLoaderProps {
  isAgent?: boolean;
  groups?: Array<{ id: string; name: string }>;
}

export const TicketFilterLoader = ({ isAgent = false, groups = [] }: TicketFilterLoaderProps) => {
  const config = React.useMemo(() => getTicketFilterConfig({ isAgent, groups }), [isAgent, groups]);
  return <FilterLoader config={config} enabled={isAgent} />;
};
