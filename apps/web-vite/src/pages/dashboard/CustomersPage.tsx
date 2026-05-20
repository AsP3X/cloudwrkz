// Human: Customer register overview aligned with EmployeesPage—filter card, data table, pagination, and CRUD dialogs.
// Agent: FETCH /customers paginated; STATE create/edit/delete dialogs; OverviewContextMenu; permission gates customers.*.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { ROUTES } from "@/lib/constants/routes";
import type { Customer, CustomerStatus, CustomerType } from "@/lib/types";

const CUSTOMER_STATUSES: CustomerStatus[] = ["ACTIVE", "INACTIVE"];
const CUSTOMER_TYPES: CustomerType[] = ["INDIVIDUAL", "COMPANY"];

const STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
};

const getStatusBadgeVariant = (status: string) => {
  switch (status as CustomerStatus) {
    case "ACTIVE":
      return "success" as const;
    case "INACTIVE":
      return "default" as const;
    default:
      return "default" as const;
  }
};

const getTypeBadgeVariant = (type: string) => {
  return type === "COMPANY" ? ("info" as const) : ("default" as const);
};

function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${rate.toFixed(2)} €/h`;
}

// ---------------------------------------------------------------------------
// Form types & helpers
// ---------------------------------------------------------------------------

interface CustomerFormData {
  customerType: CustomerType;
  status: CustomerStatus;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  notes: string;
  defaultHourlyRate: string;
}

const EMPTY_FORM: CustomerFormData = {
  customerType: "INDIVIDUAL",
  status: "ACTIVE",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "",
  notes: "",
  defaultHourlyRate: "",
};

function formFromCustomer(c: Customer): CustomerFormData {
  return {
    customerType: c.customerType,
    status: c.status,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    companyName: c.companyName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    addressLine1: c.addressLine1 ?? "",
    addressLine2: c.addressLine2 ?? "",
    city: c.city ?? "",
    postalCode: c.postalCode ?? "",
    country: c.country ?? "",
    notes: c.notes ?? "",
    defaultHourlyRate: c.defaultHourlyRate != null ? String(c.defaultHourlyRate) : "",
  };
}

function buildPayload(form: CustomerFormData, isCreate: boolean) {
  const defaultHourlyRate = form.defaultHourlyRate.trim()
    ? parseFloat(form.defaultHourlyRate)
    : null;

  const base = {
    status: form.status,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    addressLine1: form.addressLine1.trim() || undefined,
    addressLine2: form.addressLine2.trim() || undefined,
    city: form.city.trim() || undefined,
    postalCode: form.postalCode.trim() || undefined,
    country: form.country.trim() || undefined,
    notes: form.notes.trim() || undefined,
    defaultHourlyRate: defaultHourlyRate ?? undefined,
  };

  if (isCreate) {
    return {
      customerType: form.customerType,
      ...base,
      firstName: form.customerType === "INDIVIDUAL" ? form.firstName.trim() : undefined,
      lastName: form.customerType === "INDIVIDUAL" ? form.lastName.trim() : undefined,
      companyName: form.customerType === "COMPANY" ? form.companyName.trim() : undefined,
    };
  }

  return {
    ...base,
    firstName: form.firstName.trim() || undefined,
    lastName: form.lastName.trim() || undefined,
    companyName: form.companyName.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// CustomerFormFields — reusable fields block (mirrors EmployeeFormFields layout)
// ---------------------------------------------------------------------------

function CustomerFormFields({
  form,
  onChange,
  isCreate,
}: {
  form: CustomerFormData;
  onChange: (patch: Partial<CustomerFormData>) => void;
  isCreate?: boolean;
}) {
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

      {isIndividual ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              First name <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              placeholder="Jane"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Last name <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              placeholder="Smith"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Company name <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Acme GmbH"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Status</label>
          <Select
            value={form.status}
            onChange={(e) => onChange({ status: e.target.value as CustomerStatus })}
            options={CUSTOMER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Default hourly rate <span className="text-neutral-400 text-xs">(€/h)</span>
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.defaultHourlyRate}
            onChange={(e) => onChange({ defaultHourlyRate: e.target.value })}
            placeholder="95.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Email</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="contact@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Phone</label>
          <Input
            value={form.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+49 123 456789"
          />
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
          Address
        </p>
        <div className="space-y-3">
          <Input
            value={form.addressLine1}
            onChange={(e) => onChange({ addressLine1: e.target.value })}
            placeholder="Street address line 1"
          />
          <Input
            value={form.addressLine2}
            onChange={(e) => onChange({ addressLine2: e.target.value })}
            placeholder="Street address line 2"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={form.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="City"
            />
            <Input
              value={form.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value })}
              placeholder="Postal code"
            />
          </div>
          <Input
            value={form.country}
            onChange={(e) => onChange({ country: e.target.value })}
            placeholder="Country"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Notes</label>
        <textarea
          className="w-full min-h-[80px] rounded-lg border-2 border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400"
          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Internal notes about this customer…"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateCustomerDialog
// ---------------------------------------------------------------------------

function CreateCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<CustomerFormData>) => setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.customerType === "INDIVIDUAL") {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        setError("First name and last name are required for individual customers.");
        return;
      }
    } else if (!form.companyName.trim()) {
      setError("Company name is required for company customers.");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/customers", buildPayload(form, true));
      onCreated();
      setForm(EMPTY_FORM);
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      title="Create customer"
      className="max-w-3xl sm:max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
        <section className="space-y-4">
          <CustomerFormFields form={form} onChange={patch} isCreate />
        </section>

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

// ---------------------------------------------------------------------------
// EditCustomerDialog
// ---------------------------------------------------------------------------

function EditCustomerDialog({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    setIsLoading(true);
    try {
      await api.patch(`/customers/${customer.id}`, buildPayload(form, false));
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      title="Edit customer"
      className="max-w-3xl sm:max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-6">
        <section className="space-y-4">
          <CustomerFormFields form={form} onChange={patch} />
        </section>

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
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DeleteCustomerDialog
// ---------------------------------------------------------------------------

function DeleteCustomerDialog({
  open,
  customer,
  onClose,
  onDeleted,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (!customer) return;
    setIsLoading(true);
    try {
      await api.delete(`/customers/${customer.id}`);
      onDeleted();
    } catch {
      /* ignore */
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Delete customer"
      className="max-w-lg sm:max-w-lg"
    >
      <div className="px-6 pb-6 pt-2 space-y-5">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Are you sure you want to delete{" "}
          <strong>{customer?.displayName}</strong>
          {customer?.customerNumber ? (
            <span className="text-neutral-500"> ({customer.customerNumber})</span>
          ) : null}
          ? This action cannot be undone.
        </p>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Linked tickets, todos, and time entries will remain but lose their customer association.
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={isLoading}>
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// CustomersPage
// ---------------------------------------------------------------------------

export default function CustomersPage() {
  const { can, permissions } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; customer: Customer } | null>(null);

  const caps = useMemo(() => {
    if (permissions.length === 0) {
      return { canCreate: true, canUpdate: true, canDelete: true };
    }
    return {
      canCreate: can("customers.create"),
      canUpdate: can("customers.update"),
      canDelete: can("customers.delete"),
    };
  }, [permissions, can]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("page", String(page));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("customerType", typeFilter);

      const data = await api.get<{
        customers: Customer[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/customers?${params.toString()}`);

      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setCustomers([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const getContextMenuItems = useCallback(
    (customer: Customer): OverviewContextMenuItem[] => {
      const items: OverviewContextMenuItem[] = [
        {
          id: "view",
          label: "View details",
          onClick: () => navigate(ROUTES.CUSTOMER_DETAIL.replace(":id", customer.id)),
        },
      ];
      if (caps.canUpdate) {
        items.push({
          id: "edit",
          label: "Edit",
          onClick: () => {
            setSelectedCustomer(customer);
            setEditOpen(true);
          },
        });
      }
      if (caps.canDelete) {
        items.push({
          id: "delete",
          label: "Delete",
          onClick: () => {
            setSelectedCustomer(customer);
            setDeleteOpen(true);
          },
          destructive: true,
          separatorAbove: true,
        });
      }
      return items;
    },
    [navigate, caps],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Customer Management</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage individual and company customers ({total} total)
          </p>
        </div>
        {caps.canCreate && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New customer
          </Button>
        )}
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            label="Search"
            placeholder="Name, number, email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Status"
            options={[
              { value: "", label: "All statuses" },
              ...CUSTOMER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Type"
            options={[
              { value: "", label: "All types" },
              ...CUSTOMER_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
            ]}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setTypeFilter("");
                setPage(1);
              }}
              disabled={!search && !statusFilter && !typeFilter}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <svg
              className="w-16 h-16 text-neutral-300 dark:text-neutral-700 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <p className="text-neutral-500 dark:text-neutral-400">
              {search || statusFilter || typeFilter
                ? "No customers match your filters"
                : "No customers found"}
            </p>
            {caps.canCreate && !search && !statusFilter && !typeFilter && (
              <Button variant="primary" className="mt-4" onClick={() => setCreateOpen(true)}>
                Create your first customer
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Number
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Default rate
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-context-menu"
                    onContextMenu={(e) => {
                      const items = getContextMenuItems(customer);
                      if (items.length === 0) return;
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, customer });
                    }}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.CUSTOMER_DETAIL.replace(":id", customer.id))}
                        className="text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:text-primary-600 dark:hover:text-primary-400 text-left"
                      >
                        {customer.displayName}
                      </button>
                      {customer.phone && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-neutral-600 dark:text-neutral-400">
                      {customer.customerNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getTypeBadgeVariant(customer.customerType)} size="sm">
                        {TYPE_LABELS[customer.customerType]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">
                      {customer.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100">
                      {formatHourlyRate(customer.defaultHourlyRate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusBadgeVariant(customer.status)} size="sm">
                        {STATUS_LABELS[customer.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(ROUTES.CUSTOMER_DETAIL.replace(":id", customer.id))}
                        >
                          View
                        </Button>
                        {caps.canUpdate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setEditOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {caps.canDelete && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setDeleteOpen(true);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <OverviewContextMenu
        open={!!contextMenu}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        items={contextMenu ? getContextMenuItems(contextMenu.customer) : []}
      />

      <CreateCustomerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fetchCustomers();
        }}
      />
      <EditCustomerDialog
        open={editOpen}
        customer={selectedCustomer}
        onClose={() => {
          setEditOpen(false);
          setSelectedCustomer(null);
        }}
        onSaved={() => {
          setEditOpen(false);
          setSelectedCustomer(null);
          fetchCustomers();
        }}
      />
      <DeleteCustomerDialog
        open={deleteOpen}
        customer={selectedCustomer}
        onClose={() => {
          setDeleteOpen(false);
          setSelectedCustomer(null);
        }}
        onDeleted={() => {
          setDeleteOpen(false);
          setSelectedCustomer(null);
          fetchCustomers();
        }}
      />
    </div>
  );
}
