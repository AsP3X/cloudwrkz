import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getTaskFilterConfig } from "../TaskFilterConfig";

// Human: Builds filter-dialog field definitions for tasks and todo lists, driven by lists such as users or groups passed in from the parent screen.
// Agent: SCOPE tasks; BULK filters forms; PURE builder; RETURNS FilterConfig; READS options only; NO HTTP.
export const TaskFilterLoader = () => {
  const config = React.useMemo(() => getTaskFilterConfig(), []);
  return <FilterLoader config={config} enabled={true} />;
};
