// Human: Modal to create a new individual or company customer (optional first contact for companies).
// Agent: STATE CustomerFormData; CALLS createCustomer; EMITS onCreated on success.

import React, { useState } from "react";
import { ApiError } from "@/api/client";
import { createCustomer } from "@/api/customers";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CustomerFormFields } from "./CustomerFormFields";
import type { Customer } from "@/lib/types";
import {
  EMPTY_FORM,
  buildCreatePayload,
  validateCustomerForm,
  type CustomerFormData,
} from "./customerFormUtils";

interface CreateCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** When set, receives the created customer (e.g. to select it on a time entry). */
  onCreatedCustomer?: (customer: Customer) => void;
}

export function CreateCustomerDialog({
  open,
  onClose,
  onCreated,
  onCreatedCustomer,
}: CreateCustomerDialogProps) {
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<CustomerFormData>) => setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationError = validateCustomerForm(form, true);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsLoading(true);
    try {
      const customer = await createCustomer(buildCreatePayload(form));
      setForm(EMPTY_FORM);
      onCreatedCustomer?.(customer);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create customer. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()} title="Create customer" className="max-w-3xl sm:max-w-3xl">
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
        <CustomerFormFields form={form} onChange={patch} isCreate />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create customer"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
