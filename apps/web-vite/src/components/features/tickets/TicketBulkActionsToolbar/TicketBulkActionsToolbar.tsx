import { Button } from "@/components/ui/Button";

// Human: React UI for `TicketBulkActionsToolbar` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketBulkActionsToolbar; REACT component; READS props hooks; MAY CALL api client.
interface TicketBulkActionsToolbarProps {
  selectedCount: number;
  onBulkStatusChange?: (status: string) => void;
  onBulkPriorityChange?: (priority: string) => void;
  onBulkAssign?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
}

export function TicketBulkActionsToolbar({
  selectedCount,
  onBulkArchive,
  onBulkDelete,
  onClearSelection,
}: TicketBulkActionsToolbarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex items-center gap-3 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800 rounded-lg p-3">
      <span className="text-sm font-medium text-primary-700 dark:text-primary-300">{selectedCount} selected</span>
      <div className="flex items-center gap-2 ml-auto">
        {onBulkArchive && (
          <Button variant="outline" size="sm" onClick={onBulkArchive}>
            Archive
          </Button>
        )}
        {onBulkDelete && (
          <Button variant="danger" size="sm" onClick={onBulkDelete}>
            Delete
          </Button>
        )}
        {onClearSelection && (
          <Button variant="outline" size="sm" onClick={onClearSelection}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
