"use client";

import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig, type TicketFilterConfigOptions } from "../TicketFilterConfig";

interface TicketFilterLoaderProps extends TicketFilterConfigOptions {}

/**
 * Client component that automatically applies the last used filter preset
 * when the agent accesses the ticket overview page
 */
export const TicketFilterLoader = (props: TicketFilterLoaderProps) => {
  const config = React.useMemo(() => getTicketFilterConfig(props), [props]);
  // Only enable for agents
  return <FilterLoader config={config} enabled={props.isAgent} />;
};
