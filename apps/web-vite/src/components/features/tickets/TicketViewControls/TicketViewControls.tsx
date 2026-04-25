import { TicketViewToggle } from "../TicketViewToggle";
import { useTicketView } from "../TicketViewContext";

// Human: React UI for `TicketViewControls` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketViewControls; REACT component; READS props hooks; MAY CALL api client.
export function TicketViewControls() {
  const { viewMode, setViewMode } = useTicketView();
  return <TicketViewToggle currentView={viewMode} onViewChange={setViewMode} />;
}
