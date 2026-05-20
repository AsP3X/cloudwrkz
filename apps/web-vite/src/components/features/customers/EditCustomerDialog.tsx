// Human: Modal to edit customer fields with PATCH null-clearing for removed optional values.
// Agent: PROPS customer; CALLS updateCustomer(buildUpdatePayload); EMITS onSaved.

import React, { useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { updateCustomer } from "@/api/customers";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { Customer } from "@/lib/types";
import { CustomerFormFields } from "./CustomerFormFields";
import {
  EMPTY_FORM,
  formFromCustomer,
  buildUpdatePayload,
  validateCustomerForm,
  type CustomerFormData,
} from "./customerFormUtils";

interface EditCustomerDialogProps {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditCustomerDialog({ open, customer, onClose, onSaved }: EditCustomerDialogProps) {
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) setForm(formFromCustomer(customer));
  }, [customer]);

  const patch = (p: Partial<CustomerFormData>) => setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setError(null);
    const validationError = validateCustomerForm(form, false);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    try {
      await updateCustomer(customer.id, buildUpdatePayload(form, customer));
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Edit customer" className="max-w-3xl sm:max-w-3xl">
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
        <CustomerFormFields form={form} onChange={patch} />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
