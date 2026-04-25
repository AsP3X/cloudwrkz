import React from "react";
import { FilterButton } from "@/components/ui/FilterDialog";
import { getLinkFilterConfig, type LinkFilterConfigOptions } from "../LinkFilterConfig";

// Human: Builds filter-dialog field definitions for saved links and collections, driven by lists such as users or groups passed in from the parent screen.
// Agent: SCOPE links; COLLECTIONS metadata GitHub YouTube; PURE builder; RETURNS FilterConfig; READS options only; NO HTTP.
interface LinkFilterButtonProps extends LinkFilterConfigOptions {}

export const LinkFilterButton = (props: LinkFilterButtonProps) => {
  const config = React.useMemo(() => getLinkFilterConfig(props), [props]);
  return <FilterButton config={config} />;
};
