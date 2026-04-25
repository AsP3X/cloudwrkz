import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getTaskFilterConfig } from "../TaskFilterConfig";

// Human: Builds filter-dialog field definitions for tasks and todo lists, driven by lists such as users or groups passed in from the parent screen.
// Agent: SCOPE tasks; BULK filters forms; PURE builder; RETURNS FilterConfig; READS options only; NO HTTP.
export const TaskFilterButton = () => {
  const config = React.useMemo(() => getTaskFilterConfig(), []);
  return <FilterButton config={config} />;
};
