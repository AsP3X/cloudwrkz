// Human: Archived customers list with restore action (mirrors active register layout).
// Agent: FETCH listCustomers archive=archived; PATCH restoreCustomer archivedAt null.

import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/AuthProvider";
import { listCustomers, restoreCustomer } from "@/api/customers";
import { TYPE_LABELS } from "@/components/features/customers";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ROUTES } from "@/lib/constants/routes";
import type { Customer } from "@/lib/types";
import { formatDateTimeFull } from "@/lib/utils/date";

export default function CustomersArchivePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canUpdate = can("customers.update");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page] = useState(1);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", page: String(page), archive: "archived" });
      const data = await listCustomers(params);
      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleRestore = async (customer: Customer) => {
    setRestoringId(customer.id);
    try {
      await restoreCustomer(customer.id);
      await fetchCustomers();
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link to={ROUTES.CUSTOMERS} className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
            ← Back to Customers
          </Link>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Archived Customers</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">{total} archived</p>
        </div>
      </div>

      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
          </div>
        ) : customers.length === 0 ? (
          <p className="p-12 text-center text-neutral-500 dark:text-neutral-400">No archived customers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Number</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Archived</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 text-sm font-medium">{c.displayName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-neutral-500">{c.customerNumber}</td>
                    <td className="px-4 py-3">
                      <Badge variant="default" size="sm">{TYPE_LABELS[c.customerType]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {c.archivedAt ? formatDateTimeFull(c.archivedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.CUSTOMER_DETAIL.replace(":id", c.id))}>
                        View
                      </Button>
                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restoringId === c.id}
                          onClick={() => handleRestore(c)}
                        >
                          {restoringId === c.id ? "Restoring…" : "Restore"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
