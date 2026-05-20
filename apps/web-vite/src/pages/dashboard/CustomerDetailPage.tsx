// Human: Customer detail with contacts and per-contact employee hourly rate overrides for billing.
// Agent: FETCH /customers/:id + /employees; POST/PATCH/DELETE contact and rate routes; permission gates customers.update.

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Dialog } from "@/components/ui/Dialog";
import { ROUTES } from "@/lib/constants/routes";
import type { Customer, CustomerContact, Employee } from "@/lib/types";
import { formatDate } from "@/lib/utils/date";

const CARD_CLASS =
  "bg-transparent rounded-xl shadow-soft-lg border border-white/35 dark:border-white/10 p-6";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <dt className="w-44 shrink-0 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="flex-1 text-sm text-neutral-900 dark:text-neutral-100">
        {value ?? <span className="text-neutral-400 dark:text-neutral-600">—</span>}
      </dd>
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<CustomerContact | null>(null);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    title: "",
    isPrimary: false,
    notes: "",
  });
  const [rateEmployeeId, setRateEmployeeId] = useState("");
  const [rateHourly, setRateHourly] = useState("");
  const [saving, setSaving] = useState(false);

  const canUpdate = can("customers.update");

  const loadCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ customer: Customer }>(`/customers/${id}`);
      setCustomer(data.customer);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Customer not found.");
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await api.get<{ employees: Employee[] }>("/employees?limit=200");
      setEmployees(data.employees ?? []);
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => {
    loadCustomer();
    loadEmployees();
  }, [loadCustomer, loadEmployees]);

  const openAddContact = () => {
    setActiveContact(null);
    setContactForm({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      isPrimary: false,
      notes: "",
    });
    setContactDialogOpen(true);
  };

  const openEditContact = (contact: CustomerContact) => {
    setActiveContact(contact);
    setContactForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      title: contact.title ?? "",
      isPrimary: contact.isPrimary,
      notes: contact.notes ?? "",
    });
    setContactDialogOpen(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const payload = {
        firstName: contactForm.firstName.trim(),
        lastName: contactForm.lastName.trim(),
        email: contactForm.email.trim() || undefined,
        phone: contactForm.phone.trim() || undefined,
        title: contactForm.title.trim() || undefined,
        isPrimary: contactForm.isPrimary,
        notes: contactForm.notes.trim() || undefined,
      };
      if (activeContact) {
        await api.put(`/customers/${id}/contacts/${activeContact.id}`, payload);
      } else {
        await api.post(`/customers/${id}/contacts`, payload);
      }
      setContactDialogOpen(false);
      loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save contact.");
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (contact: CustomerContact) => {
    if (!id || !window.confirm(`Remove contact ${contact.firstName} ${contact.lastName}?`)) return;
    try {
      await api.delete(`/customers/${id}/contacts/${contact.id}`);
      loadCustomer();
    } catch {
      /* ignore */
    }
  };

  const openAddRate = (contact: CustomerContact) => {
    setActiveContact(contact);
    setRateEmployeeId("");
    setRateHourly("");
    setRateDialogOpen(true);
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !activeContact || !rateEmployeeId) return;
    setSaving(true);
    try {
      await api.post(`/customers/${id}/contacts/${activeContact.id}/employee-rates`, {
        employeeId: rateEmployeeId,
        hourlyRate: parseFloat(rateHourly),
      });
      setRateDialogOpen(false);
      loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save rate.");
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async (contact: CustomerContact, employeeId: string) => {
    if (!id) return;
    try {
      await api.delete(`/customers/${id}/contacts/${contact.id}/employee-rates/${employeeId}`);
      loadCustomer();
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return <p className="text-neutral-500">Loading customer…</p>;
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error ?? "Customer not found."}</p>
        <Button variant="outline" onClick={() => navigate(ROUTES.CUSTOMERS)}>Back to customers</Button>
      </div>
    );
  }

  const address = [customer.addressLine1, customer.addressLine2, customer.city, customer.postalCode, customer.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link to={ROUTES.CUSTOMERS} className="text-xs text-primary-600 hover:underline">
            ← Customers
          </Link>
          <h1 className="text-2xl font-bold mt-2">{customer.displayName}</h1>
          <p className="text-sm text-neutral-500 font-mono">{customer.customerNumber}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={customer.status === "ACTIVE" ? "success" : "default"}>{customer.status}</Badge>
          <Badge variant="info">{customer.customerType === "COMPANY" ? "Company" : "Individual"}</Badge>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Details">
          <dl>
            <DetailRow label="Default hourly rate" value={customer.defaultHourlyRate != null ? `${customer.defaultHourlyRate.toFixed(2)}` : null} />
            <DetailRow label="Email" value={customer.email} />
            <DetailRow label="Phone" value={customer.phone} />
            <DetailRow label="Address" value={address || null} />
            <DetailRow label="Notes" value={customer.notes} />
            <DetailRow label="Created" value={formatDate(customer.createdAt)} />
            <DetailRow label="Updated" value={formatDate(customer.updatedAt)} />
          </dl>
        </SectionCard>

        <SectionCard
          title="Contacts & billing rates"
          action={canUpdate && customer.customerType === "COMPANY" ? (
            <Button size="sm" variant="outline" onClick={openAddContact}>Add contact</Button>
          ) : undefined}
        >
          {customer.contacts.length === 0 ? (
            <p className="text-sm text-neutral-500">No contacts yet.</p>
          ) : (
            <div className="space-y-6">
              {customer.contacts.map((contact) => (
                <div key={contact.id} className="border border-neutral-100 dark:border-neutral-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {contact.firstName} {contact.lastName}
                        {contact.isPrimary && (
                          <Badge variant="info" className="ml-2 text-[10px]">Primary</Badge>
                        )}
                      </p>
                      {contact.title && <p className="text-xs text-neutral-500">{contact.title}</p>}
                      {contact.email && <p className="text-xs text-neutral-500">{contact.email}</p>}
                    </div>
                    {canUpdate && customer.customerType === "COMPANY" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditContact(contact)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteContact(contact)}>Remove</Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-neutral-500 uppercase">Employee hourly rates</p>
                      {canUpdate && (
                        <Button size="sm" variant="outline" onClick={() => openAddRate(contact)}>Add rate</Button>
                      )}
                    </div>
                    {contact.employeeRates.length === 0 ? (
                      <p className="text-xs text-neutral-400">Uses customer default rate when no override is set.</p>
                    ) : (
                      <ul className="space-y-2">
                        {contact.employeeRates.map((rate) => (
                          <li key={rate.id} className="flex items-center justify-between text-sm">
                            <span>
                              {rate.employee.firstName} {rate.employee.lastName}
                              <span className="text-neutral-400 ml-2">{rate.employee.email}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-mono">{rate.hourlyRate.toFixed(2)}/h</span>
                              {canUpdate && (
                                <Button size="sm" variant="ghost" onClick={() => removeRate(contact, rate.employeeId)}>
                                  Remove
                                </Button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={contactDialogOpen} onOpenChange={(v) => !v && setContactDialogOpen(false)} title={activeContact ? "Edit contact" : "Add contact"}>
        <form onSubmit={saveContact} className="px-6 pb-6 pt-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input value={contactForm.firstName} onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name *" />
            <Input value={contactForm.lastName} onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name *" />
            <Input value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" />
            <Input value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" />
            <Input value={contactForm.title} onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))} placeholder="Job title" className="col-span-2" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))} />
            Primary contact
          </label>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={rateDialogOpen} onOpenChange={(v) => !v && setRateDialogOpen(false)} title="Set employee hourly rate">
        <form onSubmit={saveRate} className="px-6 pb-6 pt-2 space-y-4">
          <p className="text-sm text-neutral-500">
            Override the customer default rate for {activeContact?.firstName} {activeContact?.lastName} when this employee works for them.
          </p>
          <Select value={rateEmployeeId} onChange={(e) => setRateEmployeeId(e.target.value)}>
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.email})
              </option>
            ))}
          </Select>
          <Input type="number" min="0" step="0.01" value={rateHourly} onChange={(e) => setRateHourly(e.target.value)} placeholder="Hourly rate" />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !rateEmployeeId}>Save rate</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
