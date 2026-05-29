import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getCustomer } from "@/api/customers";
import { listCustomers } from "@/api/customers";
import { CreateCustomerDialog } from "@/components/features/customers/CreateCustomerDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import type { Customer, CustomerContact } from "@/lib/types";
import {
  canCreateCustomersForTimeEntries,
  canViewCustomersForTimeEntries,
} from "@/lib/time-entry-customers";
import { formatCurrencyAmount } from "@/lib/utils/time-tracking";

// Human: Billing picker—search active customers, optional billing contact for companies, manual hourly rate.
// Agent: FETCH listCustomers status=ACTIVE; FETCH getCustomer for contacts; EMITS customerId+contactId+rate.

export interface TimeEntryBillingState {
  customerId: string | null;
  customerContactId: string | null;
  customerDisplayName: string | null;
  hourlyRate: number | null;
}

interface TimeEntryBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: TimeEntryBillingState;
  onConfirm: (value: TimeEntryBillingState) => void;
  customersModuleEnabled: boolean;
}

export function TimeEntryBillingDialog({
  open,
  onOpenChange,
  value,
  onConfirm,
  customersModuleEnabled,
}: TimeEntryBillingDialogProps) {
  const { modules, can } = useAuth();
  const canSearchCustomers = canViewCustomersForTimeEntries(modules, can);
  const canCreateCustomer = canCreateCustomersForTimeEntries(can);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Customer[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [draftCustomerId, setDraftCustomerId] = React.useState<string | null>(value.customerId);
  const [draftContactId, setDraftContactId] = React.useState<string | null>(value.customerContactId);
  const [contacts, setContacts] = React.useState<CustomerContact[]>([]);
  const [draftCustomerName, setDraftCustomerName] = React.useState<string | null>(value.customerDisplayName);
  const [rateInput, setRateInput] = React.useState(
    value.hourlyRate != null ? String(value.hourlyRate) : "",
  );

  React.useEffect(() => {
    if (!open) return;
    setDraftCustomerId(value.customerId);
    setDraftContactId(value.customerContactId);
    setDraftCustomerName(value.customerDisplayName);
    setRateInput(value.hourlyRate != null ? String(value.hourlyRate) : "");
    setSearch("");
    setResults([]);
    setContacts([]);
    setSearchError(null);
  }, [open, value.customerId, value.customerContactId, value.customerDisplayName, value.hourlyRate]);

  React.useEffect(() => {
    if (!open || !canSearchCustomers) return;
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          search: trimmed,
          limit: "10",
          page: "1",
          status: "ACTIVE",
          archive: "unarchived",
        });
        const data = await listCustomers(params);
        setResults(data.customers ?? []);
      } catch (err: unknown) {
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "Customer search failed");
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, search, canSearchCustomers]);

  const loadContactsForCustomer = async (customerId: string, contactIdToKeep: string | null) => {
    try {
      const full = await getCustomer(customerId);
      setContacts(full.contacts ?? []);
      if (full.contacts.length === 1) {
        setDraftContactId(full.contacts[0].id);
      } else if (contactIdToKeep && full.contacts.some((c) => c.id === contactIdToKeep)) {
        setDraftContactId(contactIdToKeep);
      } else {
        const primary = full.contacts.find((c) => c.isPrimary);
        setDraftContactId(primary?.id ?? full.contacts[0]?.id ?? null);
      }
    } catch {
      setContacts([]);
      setDraftContactId(null);
    }
  };

  // Human: An empty rate field means "keep the current snapshot" so clearing the input does not wipe billing on save.
  // Agent: CONFIRM empty→value.hourlyRate; CONFIRM numeric parse including 0; INVALID only when non-empty and NaN or negative.
  const resolveHourlyRateOnConfirm = (): number | null => {
    const trimmed = rateInput.trim();
    if (trimmed === "") return value.hourlyRate;
    const parsed = Number.parseFloat(trimmed);
    if (Number.isNaN(parsed)) return value.hourlyRate;
    return parsed;
  };

  const rateInvalid = (() => {
    const trimmed = rateInput.trim();
    if (trimmed === "") return false;
    const parsed = Number.parseFloat(trimmed);
    return Number.isNaN(parsed) || parsed < 0;
  })();

  const handleSelectCustomer = async (customer: Customer) => {
    setDraftCustomerId(customer.id);
    setDraftCustomerName(customer.displayName);
    if (customer.defaultHourlyRate != null) {
      setRateInput(String(customer.defaultHourlyRate));
    }
    await loadContactsForCustomer(customer.id, null);
  };

  const handleClearCustomer = () => {
    setDraftCustomerId(null);
    setDraftContactId(null);
    setDraftCustomerName(null);
    setContacts([]);
  };

  const handleConfirm = () => {
    if (rateInvalid) return;
    onConfirm({
      customerId: draftCustomerId,
      customerContactId: draftCustomerId ? draftContactId : null,
      customerDisplayName: draftCustomerName,
      hourlyRate: resolveHourlyRateOnConfirm(),
    });
    onOpenChange(false);
  };

  const handleClearAll = () => {
    onConfirm({
      customerId: null,
      customerContactId: null,
      customerDisplayName: null,
      hourlyRate: null,
    });
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (open && draftCustomerId && contacts.length === 0) {
      loadContactsForCustomer(draftCustomerId, draftContactId);
    }
  }, [open, draftCustomerId]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      nested
      title="Customer & hourly rate"
      description={
        customersModuleEnabled
          ? "Link an active customer for billing or set a manual hourly rate."
          : "Set an hourly rate to calculate earned amount for this entry."
      }
    >
      <div className="px-5 sm:px-7 py-5 space-y-5">
        {(canSearchCustomers || canCreateCustomer) && (
          <div className="space-y-3">
            {canCreateCustomer && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                  New customer
                </Button>
              </div>
            )}
            {canSearchCustomers && (
              <>
                <Input
                  label="Search customer"
                  placeholder="Type at least 2 characters…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {searchError && (
                  <p className="text-sm text-error-600 dark:text-error-400">{searchError}</p>
                )}
                {draftCustomerName && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-200/70 dark:border-primary-800/50 bg-primary-50/60 dark:bg-primary-950/30 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{draftCustomerName}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Selected customer</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearCustomer}>
                      Remove
                    </Button>
                  </div>
                )}
                {draftCustomerId && contacts.length > 1 && (
                  <Select
                    label="Billing contact"
                    value={draftContactId ?? ""}
                    onChange={(e) => setDraftContactId(e.target.value || null)}
                  >
                    <option value="">Default (primary contact)</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                        {c.isPrimary ? " (primary)" : ""}
                      </option>
                    ))}
                  </Select>
                )}
                {searching && <p className="text-sm text-neutral-500 dark:text-neutral-400">Searching…</p>}
                {!searching && results.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-200/80 dark:divide-neutral-700/80">
                    {results.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
                          onClick={() => handleSelectCustomer(customer)}
                        >
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{customer.displayName}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {customer.customerNumber}
                            {customer.defaultHourlyRate != null
                              ? ` · ${formatCurrencyAmount(customer.defaultHourlyRate)}/h`
                              : ""}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <CreateCustomerDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
          onCreatedCustomer={(customer) => {
            void handleSelectCustomer(customer);
          }}
        />

        <Input
          label="Hourly rate"
          type="number"
          min={0}
          step="0.01"
          placeholder="e.g. 85.00"
          helperText="Used to calculate earned amount from hours worked."
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          error={rateInvalid ? "Enter a valid non-negative rate" : undefined}
        />

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-200/80 dark:border-neutral-700/60">
          <Button type="button" variant="ghost" onClick={handleClearAll}>
            Clear
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={rateInvalid}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
