"use client";

import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { TIME_TRACKING_FILTER_CONFIG } from "../TimeTrackingFilterConfig";

interface TimeTrackingFilterButtonProps {
  // Add any additional props if needed in the future
}

export const TimeTrackingFilterButton = ({}: TimeTrackingFilterButtonProps) => {
  return <FilterButton config={TIME_TRACKING_FILTER_CONFIG} />;
};
