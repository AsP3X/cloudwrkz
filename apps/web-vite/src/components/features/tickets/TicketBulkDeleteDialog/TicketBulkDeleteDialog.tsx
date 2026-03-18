import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface TicketBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  selectedCount: number;
}

export function TicketBulkDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
}: TicketBulkDeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Tickets"
      description={`Are you sure you want to delete ${selectedCount} ticket(s)?`}
    >
      <div className="p-6 space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
