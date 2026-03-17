"use client";

import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getGroupPermissionsFilterConfig } from "./GroupPermissionsFilterConfig";

export const GroupPermissionsFilterButton = () => {
  const config = React.useMemo(() => getGroupPermissionsFilterConfig(), []);
  return <FilterButton config={config} />;
};
