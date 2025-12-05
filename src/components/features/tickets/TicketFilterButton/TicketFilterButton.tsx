"use client";

import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getTicketFilterConfig, type TicketFilterConfigOptions } from "../TicketFilterConfig";

interface TicketFilterButtonProps extends TicketFilterConfigOptions {}

export const TicketFilterButton = (props: TicketFilterButtonProps) => {
  const config = React.useMemo(() => getTicketFilterConfig(props), [props]);
  return <FilterButton config={config} />;
};
