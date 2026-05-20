import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/api/client";
import type { Customer } from "@/lib/types";
import { formatCurrencyAmount } from "@/lib/utils/time-tracking";

// Human: Optional billing picker — search customers when the module is on, or set a manual hourly rate for earned-amount math.
// Agent: FETCH GET /customers?search=; STATE customerId+hourlyRate; EMITS TimeEntryBillingState on confirm; GATED customersModuleEnabled.

export interface TimeEntryBillingState {
  customerId: string | null;
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
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Customer[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [draftCustomerId, setDraftCustomerId] = React.useState<string | null>(value.customerId);
  const [draftCustomerName, setDraftCustomerName] = React.useState<string | null>(value.customerDisplayName);
  const [rateInput, setRateInput] = React.useState(
    value.hourlyRate != null ? String(value.hourlyRate) : "",
  );

  React.useEffect(() => {
    if (!open) return;
    setDraftCustomerId(value.customerId);
    setDraftCustomerName(value.customerDisplayName);
    setRateInput(value.hourlyRate != null ? String(value.hourlyRate) : "");
    setSearch("");
    setResults([]);
    setSearchError(null);
  }, [open, value.customerId, value.customerDisplayName, value.hourlyRate]);

  React.useEffect(() => {
    if (!open || !customersModuleEnabled) return;
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ search: trimmed, limit: "10", page: "1" });
        const data = await api.get<{ customers: Customer[] }>(`/customers?${params.toString()}`);
        setResults(data.customers ?? []);
      } catch (err: unknown) {
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "Customer search failed");
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, search, customersModuleEnabled]);

  const parsedRate = rateInput.trim() === "" ? null : Number.parseFloat(rateInput);
  const rateInvalid = rateInput.trim() !== "" && (Number.isNaN(parsedRate!) || parsedRate! < 0);

  const handleSelectCustomer = (customer: Customer) => {
    setDraftCustomerId(customer.id);
    setDraftCustomerName(customer.displayName);
    if (customer.defaultHourlyRate != null) {
      setRateInput(String(customer.defaultHourlyRate));
    }
  };

  const handleClearCustomer = () => {
    setDraftCustomerId(null);
    setDraftCustomerName(null);
  };

  const handleConfirm = () => {
    if (rateInvalid) return;
    onConfirm({
      customerId: draftCustomerId,
      customerDisplayName: draftCustomerName,
      hourlyRate: parsedRate,
    });
    onOpenChange(false);
  };

  const handleClearAll = () => {
    onConfirm({
      customerId: null,
      customerDisplayName: null,
      hourlyRate: null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      nested
      title="Company & hourly rate"
      description={
        customersModuleEnabled
          ? "Link a customer for billing or set a manual hourly rate."
          : "Set an hourly rate to calculate earned amount for this entry."
      }
    >
      <div className="px-5 sm:px-7 py-5 space-y-5">
        {customersModuleEnabled && (
          <div className="space-y-3">
            <Input
              label="Search company / customer"
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
            {searching && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Searching…</p>
            )}
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
          </div>
        )}

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
