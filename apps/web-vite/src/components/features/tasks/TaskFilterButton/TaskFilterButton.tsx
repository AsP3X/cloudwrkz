import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getTaskFilterConfig } from "../TaskFilterConfig";

export const TaskFilterButton = () => {
  const config = React.useMemo(() => getTaskFilterConfig(), []);
  return <FilterButton config={config} />;
};
