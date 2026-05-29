import { FilterButton } from "@/components/ui/FilterDialog";
import { TIME_TRACKING_FILTER_CONFIG } from "../TimeTrackingFilterConfig";

// Human: React UI for `TimeTrackingFilterButton` in time entries and live timers: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; EXPORTS TimeTrackingFilterButton; REACT component; READS props hooks; MAY CALL api client.
interface TimeTrackingFilterButtonProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const TimeTrackingFilterButton = ({ open, onOpenChange }: TimeTrackingFilterButtonProps) => {
  return (
    <FilterButton
      config={TIME_TRACKING_FILTER_CONFIG}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
};
