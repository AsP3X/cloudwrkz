// Human: This barrel file re-exports TimeEntryViewToggle, getInitialViewMode, saveViewMode, type from the `TimeEntryViewToggle` folder so callers can import them through one path while working on time entries and live timers.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; RE-EXPORTS TimeEntryViewToggle, getInitialViewMode, saveViewMode, type; NO runtime logic in this file.
export { TimeEntryViewToggle, getInitialViewMode, saveViewMode, type TimeEntryViewMode } from "./TimeEntryViewToggle";
