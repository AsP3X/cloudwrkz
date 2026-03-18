import { useTicketView } from "../TicketViewContext";
import { TicketList } from "../TicketList";
import type { Ticket } from "@/lib/types";

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
