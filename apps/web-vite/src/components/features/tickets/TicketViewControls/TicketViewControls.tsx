import { TicketViewToggle } from "../TicketViewToggle";
import { useTicketView } from "../TicketViewContext";

export function TicketViewControls() {
  const { viewMode, setViewMode } = useTicketView();
  return <TicketViewToggle currentView={viewMode} onViewChange={setViewMode} />;
}
