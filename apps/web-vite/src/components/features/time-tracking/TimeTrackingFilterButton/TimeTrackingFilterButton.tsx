import { FilterButton } from "@/components/ui/FilterDialog";
import { TIME_TRACKING_FILTER_CONFIG } from "../TimeTrackingFilterConfig";

// Human: React UI for `TimeTrackingFilterButton` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS TimeTrackingFilterButton; REACT component; READS props hooks; MAY CALL api client.
interface TimeTrackingFilterButtonProps {
  // Add any additional props if needed in the future
}

export const TimeTrackingFilterButton = ({}: TimeTrackingFilterButtonProps) => {
  return <FilterButton config={TIME_TRACKING_FILTER_CONFIG} />;
};
