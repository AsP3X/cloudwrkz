// Human: Confirms permanent customer delete; loads usage counts and supports force when time entries exist.
// Agent: FETCH getCustomerUsage; DELETE deleteCustomer(force); SHOWS time entry count warning.

import { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { deleteCustomer, getCustomerUsage } from "@/api/customers";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { Customer } from "@/lib/types";

interface DeleteCustomerDialogProps {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteCustomerDialog({ open, customer, onClose, onDeleted }: DeleteCustomerDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [timeEntries, setTimeEntries] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !customer) {
      setTimeEntries(0);
      setError(null);
      return;
    }
    getCustomerUsage(customer.id)
      .then((u) => setTimeEntries(u.timeEntries ?? 0))
      .catch(() => setTimeEntries(0));
  }, [open, customer]);

  const handleDelete = async (force: boolean) => {
    if (!customer) return;
    setIsLoading(true);
    setError(null);
    try {
      await deleteCustomer(customer.id, force);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete customer.");
    } finally {
      setIsLoading(false);
    }
  };

  const needsForce = timeEntries > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Delete customer" className="max-w-lg sm:max-w-lg">
      <div className="px-6 pb-6 pt-2 space-y-5">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Permanently delete <strong>{customer?.displayName}</strong>
          {customer?.customerNumber ? (
            <span className="text-neutral-500"> ({customer.customerNumber})</span>
          ) : null}
          ? This cannot be undone.
        </p>
        {needsForce && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            This customer is linked to {timeEntries} time{" "}
            {timeEntries === 1 ? "entry" : "entries"}. Deleting will remove the customer link from those entries.
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => handleDelete(needsForce)}
            disabled={isLoading}
          >
            {isLoading ? "Deleting…" : needsForce ? "Delete anyway" : "Delete"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
