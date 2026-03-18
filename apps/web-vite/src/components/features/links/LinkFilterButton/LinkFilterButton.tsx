import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getLinkFilterConfig, type LinkFilterConfigOptions } from "../LinkFilterConfig";

interface LinkFilterButtonProps extends LinkFilterConfigOptions {}

export const LinkFilterButton = (props: LinkFilterButtonProps) => {
  const config = React.useMemo(() => getLinkFilterConfig(props), [props]);
  return <FilterButton config={config} />;
};
