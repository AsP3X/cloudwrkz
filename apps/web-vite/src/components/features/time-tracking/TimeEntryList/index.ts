// Human: This barrel file re-exports TimeEntryList from the `TimeEntryList` folder so callers can import them through one path while working on time entries and live timers.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; RE-EXPORTS TimeEntryList; NO runtime logic in this file.
export { TimeEntryList } from "./TimeEntryList";
