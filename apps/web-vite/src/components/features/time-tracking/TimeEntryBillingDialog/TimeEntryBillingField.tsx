import React from "react";
import { Button } from "@/components/ui/Button";
import { TimeEntryBillingDialog, type TimeEntryBillingState } from "./TimeEntryBillingDialog";
import { formatCurrencyAmount, shouldShowTimeEntryBillingAmount } from "@/lib/utils/time-tracking";

// Human: Inline trigger + summary for billing on timer create/edit forms; opens the company/rate dialog on click.
// Agent: PROPS billing+onChange+customersModuleEnabled; LOCAL dialog open state; RENDERS summary chip + TimeEntryBillingDialog.

interface TimeEntryBillingFieldProps {
  billing: TimeEntryBillingState;
  onChange: (billing: TimeEntryBillingState) => void;
  customersModuleEnabled: boolean;
}

export function TimeEntryBillingField({
  billing,
  onChange,
  customersModuleEnabled,
}: TimeEntryBillingFieldProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const showRate =
    billing.hourlyRate != null &&
    shouldShowTimeEntryBillingAmount({ billable: true, hourly_rate: billing.hourlyRate });
  const hasBilling = billing.customerId != null || showRate;
  const summary = (() => {
    if (billing.customerDisplayName && showRate) {
      return `${billing.customerDisplayName} · ${formatCurrencyAmount(billing.hourlyRate!)}/h`;
    }
    if (billing.customerDisplayName) {
      return billing.customerDisplayName;
    }
    if (showRate) {
      return `Manual rate · ${formatCurrencyAmount(billing.hourlyRate!)}/h`;
    }
    return null;
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Billing</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {customersModuleEnabled
              ? "Optional customer link and hourly rate for earned amount."
              : "Optional hourly rate for earned amount."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          {hasBilling ? "Edit billing" : "Set billing"}
        </Button>
      </div>
      {summary && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 bg-neutral-50/80 dark:bg-neutral-900/40 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200">
          {summary}
        </div>
      )}
      <TimeEntryBillingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={billing}
        onConfirm={onChange}
        customersModuleEnabled={customersModuleEnabled}
      />
    </div>
  );
}
