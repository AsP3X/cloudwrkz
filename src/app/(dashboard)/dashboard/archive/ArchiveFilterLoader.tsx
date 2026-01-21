"use client";

import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getArchiveFilterConfig } from "./ArchiveFilterConfig";

type ArchiveCanView = { tickets: boolean; todos: boolean; time: boolean };

export function ArchiveFilterLoader({ canView }: { canView: ArchiveCanView }) {
  const config = React.useMemo(() => getArchiveFilterConfig(canView), [canView]);
  return <FilterLoader config={config} enabled={true} />;
}

