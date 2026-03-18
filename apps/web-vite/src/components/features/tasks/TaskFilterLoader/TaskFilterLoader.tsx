import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getTaskFilterConfig } from "../TaskFilterConfig";

export const TaskFilterLoader = () => {
  const config = React.useMemo(() => getTaskFilterConfig(), []);
  return <FilterLoader config={config} enabled={true} />;
};
