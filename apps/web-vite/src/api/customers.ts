// Human: Typed helpers for customer register API calls (list, CRUD, usage, related time entries).
// Agent: WRAPS api client; RETURNS camelCase envelopes; USED CustomersPage CustomerDetailPage billing picker.

import { api } from "@/api/client";
import type { Customer } from "@/lib/types";

export interface CustomerListResponse {
  customers: Customer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  moduleDisabled?: boolean;
}

export interface CustomerUsage {
  timeEntries: number;
}

export interface CustomerTimeEntrySummary {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  totalDuration: number;
  hourlyRate: number | null;
  archivedAt: string | null;
}

export async function listCustomers(params: URLSearchParams): Promise<CustomerListResponse> {
  return api.get<CustomerListResponse>(`/customers?${params.toString()}`);
}

export async function getCustomer(id: string): Promise<Customer> {
  const data = await api.get<{ customer: Customer }>(`/customers/${id}`);
  return data.customer;
}

export async function getCustomerUsage(id: string): Promise<CustomerUsage> {
  const data = await api.get<{ usage: CustomerUsage }>(`/customers/${id}/usage`);
  return data.usage;
}

export async function listCustomerTimeEntries(
  id: string,
  page = 1,
  limit = 10,
): Promise<{ timeEntries: CustomerTimeEntrySummary[]; total: number; totalPages: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return api.get(`/customers/${id}/time-entries?${params.toString()}`);
}

export async function createCustomer(payload: Record<string, unknown>): Promise<Customer> {
  const data = await api.post<{ customer: Customer }>("/customers", payload);
  return data.customer;
}

export async function updateCustomer(id: string, payload: Record<string, unknown>): Promise<Customer> {
  const data = await api.patch<{ customer: Customer }>(`/customers/${id}`, payload);
  return data.customer;
}

export async function deleteCustomer(id: string, force = false): Promise<void> {
  const q = force ? "?force=true" : "";
  await api.delete(`/customers/${id}${q}`);
}

export async function archiveCustomer(id: string): Promise<Customer> {
  return updateCustomer(id, { archivedAt: "now" });
}

export async function restoreCustomer(id: string): Promise<Customer> {
  return updateCustomer(id, { archivedAt: null });
}
