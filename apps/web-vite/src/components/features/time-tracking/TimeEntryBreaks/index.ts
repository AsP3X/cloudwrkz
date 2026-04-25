// Human: This barrel file re-exports TimeEntryBreaks from the `TimeEntryBreaks` folder so callers can import them through one path while working on time entries and live timers.
// Agent: SCOPE time-tracking; ENTRIES breaks floating-timer; RE-EXPORTS TimeEntryBreaks; NO runtime logic in this file.
export { TimeEntryBreaks, type TimeEntryBreakDraftRow } from "./TimeEntryBreaks";
