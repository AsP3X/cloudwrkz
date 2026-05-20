// Human: Customer register overview—filters, table, pagination, CRUD dialogs, module-disabled state.
// Agent: FETCH listCustomers; STATE dialogs; permission gates customers.*; LINK archive route.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { listCustomers } from "@/api/customers";
import {
  CreateCustomerDialog,
  DeleteCustomerDialog,
  EditCustomerDialog,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/components/features/customers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { OverviewContextMenu, type OverviewContextMenuItem } from "@/components/ui/OverviewContextMenu";
import { ROUTES } from "@/lib/constants/routes";
import type { Customer, CustomerStatus } from "@/lib/types";
import { formatCurrencyAmount } from "@/lib/utils/time-tracking";

function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${formatCurrencyAmount(rate)}/h`;
}

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

export default function CustomersPage() {
  const { can, permissions } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; customer: Customer } | null>(null);

  const caps = useMemo(() => {
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
      params.set("archive", "unarchived");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("customerType", typeFilter);

      const data = await listCustomers(params);
      setModuleDisabled(!!data.moduleDisabled);
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
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={ROUTES.CUSTOMERS_ARCHIVE}>
            <Button variant="outline" size="sm">
              Archived customers
            </Button>
          </Link>
          {caps.canCreate && !moduleDisabled && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              New customer
            </Button>
          )}
        </div>
      </div>

      {moduleDisabled && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          The Customers module is disabled. Enable it under Admin → Modules to manage customers.
        </div>
      )}

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
            <p className="text-neutral-500 dark:text-neutral-400">
              {moduleDisabled
                ? "Customers module is not available."
                : search || statusFilter || typeFilter
                  ? "No customers match your filters"
                  : "No customers found"}
            </p>
            {caps.canCreate && !moduleDisabled && !search && !statusFilter && !typeFilter && (
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
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Number</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Default rate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
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
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-neutral-600 dark:text-neutral-400">
                      {customer.customerNumber}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getTypeBadgeVariant(customer.customerType)} size="sm">
                        {TYPE_LABELS[customer.customerType]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{customer.email ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{formatHourlyRate(customer.defaultHourlyRate)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusBadgeVariant(customer.status)} size="sm">
                        {STATUS_LABELS[customer.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(ROUTES.CUSTOMER_DETAIL.replace(":id", customer.id))}
                      >
                        View
                      </Button>
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
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
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

      <CreateCustomerDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); fetchCustomers(); }} />
      <EditCustomerDialog
        open={editOpen}
        customer={selectedCustomer}
        onClose={() => { setEditOpen(false); setSelectedCustomer(null); }}
        onSaved={() => { setEditOpen(false); setSelectedCustomer(null); fetchCustomers(); }}
      />
      <DeleteCustomerDialog
        open={deleteOpen}
        customer={selectedCustomer}
        onClose={() => { setDeleteOpen(false); setSelectedCustomer(null); }}
        onDeleted={() => { setDeleteOpen(false); setSelectedCustomer(null); fetchCustomers(); }}
      />
    </div>
  );
}
