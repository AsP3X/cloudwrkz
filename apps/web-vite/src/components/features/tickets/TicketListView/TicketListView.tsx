import { useTicketView } from "../TicketViewContext";
import { TicketList } from "../TicketList";
import type { Ticket } from "@/lib/types";

// Human: React UI for `TicketListView` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketListView; REACT component; READS props hooks; MAY CALL api client.
interface TicketListViewProps {
  tickets: Ticket[];
  isAgent?: boolean;
  showBulkSelect?: boolean;
  onRefresh?: () => void;
}

export function TicketListView({ tickets, isAgent = false, showBulkSelect = false, onRefresh }: TicketListViewProps) {
  const { viewMode } = useTicketView();
  return (
    <TicketList
      tickets={tickets}
      viewMode={viewMode}
      showBulkSelect={showBulkSelect}
      isAgent={isAgent}
      onRefresh={onRefresh}
    />
  );
}
