// Human: Confirms removal of a company contact (replaces window.confirm).
// Agent: PROPS contact+onConfirm; RENDERS Dialog destructive action.

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { CustomerContact } from "@/lib/types";

interface RemoveContactDialogProps {
  open: boolean;
  contact: CustomerContact | null;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function RemoveContactDialog({
  open,
  contact,
  onClose,
  onConfirm,
  isLoading,
}: RemoveContactDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Remove contact" className="max-w-md">
      <div className="px-6 pb-6 pt-2 space-y-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Remove contact{" "}
          <strong>
            {contact?.firstName} {contact?.lastName}
          </strong>
          ? Employee rate overrides for this contact will also be removed.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "Removing…" : "Remove"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
