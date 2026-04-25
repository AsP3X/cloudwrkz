// Human: This barrel file re-exports TicketViewToggle, getInitialViewMode, saveViewMode, TicketViewMode from the `TicketViewToggle` folder so callers can import them through one path while working on support tickets and related tooling.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; RE-EXPORTS TicketViewToggle, getInitialViewMode, saveViewMode, TicketViewMode; NO runtime logic in this file.
export { TicketViewToggle, getInitialViewMode, saveViewMode } from "./TicketViewToggle";
export type { TicketViewMode } from "./TicketViewToggle";
