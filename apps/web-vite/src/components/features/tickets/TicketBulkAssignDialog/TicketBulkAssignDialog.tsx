import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

// Human: React UI for `TicketBulkAssignDialog` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS TicketBulkAssignDialog; REACT component; READS props hooks; MAY CALL api client.
interface TicketBulkAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (assignedToId?: string | null, assignedToGroupId?: string | null) => void;
  selectedCount?: number;
}

export function TicketBulkAssignDialog({
  open,
  onOpenChange,
  onConfirm,
}: TicketBulkAssignDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Tickets"
      description="Assign selected tickets to a user or group"
    >
      <div className="p-6 space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Assignment coming soon.</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Assign
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
