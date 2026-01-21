"use client";

import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getArchiveFilterConfig } from "./ArchiveFilterConfig";

type ArchiveCanView = { tickets: boolean; todos: boolean; time: boolean };

export function ArchiveFilterButton({ canView }: { canView: ArchiveCanView }) {
  const config = React.useMemo(() => getArchiveFilterConfig(canView), [canView]);
  return <FilterButton config={config} />;
}

