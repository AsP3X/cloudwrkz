// Human: Reusable customer create/edit field block (type, identity, address, default rate, optional initial contact).
// Agent: PROPS form+onChange+isCreate; RENDERS CustomerFormData fields; COMPANY shows initialContact when isCreate.

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { CustomerType } from "@/lib/types";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
  type CustomerFormData,
} from "./customerFormUtils";

interface CustomerFormFieldsProps {
  form: CustomerFormData;
  onChange: (patch: Partial<CustomerFormData>) => void;
  isCreate?: boolean;
}

export function CustomerFormFields({ form, onChange, isCreate }: CustomerFormFieldsProps) {
  const isIndividual = form.customerType === "INDIVIDUAL";

  return (
    <div className="space-y-4">
      {isCreate && (
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Customer type <span className="text-red-500">*</span>
          </label>
          <Select
            value={form.customerType}
            onChange={(e) => onChange({ customerType: e.target.value as CustomerType })}
            options={CUSTOMER_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
        <Select
          value={form.status}
          onChange={(e) => onChange({ status: e.target.value as CustomerFormData["status"] })}
          options={CUSTOMER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
        />
      </div>

      {isIndividual ? (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            value={form.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Jane"
            required
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Smith"
            required
          />
        </div>
      ) : (
        <Input
          label="Company name"
          value={form.companyName}
          onChange={(e) => onChange({ companyName: e.target.value })}
          placeholder="Acme GmbH"
          required
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="contact@example.com"
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="+49 …"
        />
      </div>

      <Input
        label="Default hourly rate (per hour)"
        type="number"
        min={0}
        step="0.01"
        value={form.defaultHourlyRate}
        onChange={(e) => onChange({ defaultHourlyRate: e.target.value })}
        placeholder="e.g. 85.00"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Address line 1"
          value={form.addressLine1}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
        />
        <Input
          label="Address line 2"
          value={form.addressLine2}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
        />
        <Input label="City" value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        <Input
          label="Postal code"
          value={form.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value })}
        />
        <Input
          label="Country"
          value={form.country}
          onChange={(e) => onChange({ country: e.target.value })}
          className="sm:col-span-2"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes</label>
        <textarea
          className="w-full min-h-[80px] rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Internal notes about this customer…"
        />
      </div>

      {isCreate && !isIndividual && (
        <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 p-4 space-y-3">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">First contact (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="First name"
              value={form.initialContact.firstName}
              onChange={(e) =>
                onChange({
                  initialContact: { ...form.initialContact, firstName: e.target.value },
                })
              }
            />
            <Input
              label="Last name"
              value={form.initialContact.lastName}
              onChange={(e) =>
                onChange({
                  initialContact: { ...form.initialContact, lastName: e.target.value },
                })
              }
            />
            <Input
              label="Email"
              type="email"
              value={form.initialContact.email}
              onChange={(e) =>
                onChange({
                  initialContact: { ...form.initialContact, email: e.target.value },
                })
              }
              className="sm:col-span-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={form.initialContact.isPrimary}
              onChange={(e) =>
                onChange({
                  initialContact: { ...form.initialContact, isPrimary: e.target.checked },
                })
              }
              className="rounded border-neutral-300"
            />
            Primary contact
          </label>
        </div>
      )}
    </div>
  );
}
