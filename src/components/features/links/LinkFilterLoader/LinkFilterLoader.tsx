"use client";

import React from "react";
import { FilterLoader } from "@/components/ui/FilterDialog";
import { getLinkFilterConfig, type LinkFilterConfigOptions } from "../LinkFilterConfig";

interface LinkFilterLoaderProps extends LinkFilterConfigOptions {}

/**
 * Client component that automatically applies the last used filter preset
 * when the user accesses the links overview page
 */
export const LinkFilterLoader = (props: LinkFilterLoaderProps) => {
  const config = React.useMemo(() => getLinkFilterConfig(props), [props]);
  return <FilterLoader config={config} enabled={true} />;
};
