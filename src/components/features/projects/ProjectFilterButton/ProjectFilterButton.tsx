"use client";

import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { PROJECT_FILTER_CONFIG } from "../ProjectFilterConfig";

interface ProjectFilterButtonProps {
  // Add any additional props if needed in the future
}

export const ProjectFilterButton = ({}: ProjectFilterButtonProps) => {
  return <FilterButton config={PROJECT_FILTER_CONFIG} />;
};
