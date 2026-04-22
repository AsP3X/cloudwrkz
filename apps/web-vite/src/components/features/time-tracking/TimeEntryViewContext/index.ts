// Human: This barrel file re-exports TimeEntryViewProvider, useTimeEntryView from the `TimeEntryViewContext` folder so callers can import them through one path while working on time entries and live timers.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; RE-EXPORTS TimeEntryViewProvider, useTimeEntryView; NO runtime logic in this file.
export { TimeEntryViewProvider, useTimeEntryView } from "./TimeEntryViewContext";
