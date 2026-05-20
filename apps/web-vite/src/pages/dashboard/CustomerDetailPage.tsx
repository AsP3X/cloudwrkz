// Human: Customer detail with contacts and per-contact employee hourly rate overrides for billing.
// Agent: FETCH /customers/:id + /employees; POST/PATCH/DELETE contact and rate routes; permission gates customers.update.

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { formatDateTimeFull } from "@/lib/utils/date";
import { formatCurrencyAmount } from "@/lib/utils/time-tracking";

const CARD_CLASS =
  "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-6";

// Human: Maps customer lifecycle status to badge variants consistent with admin detail pages.
// Agent: SWITCH ACTIVE|INACTIVE|default; RETURNS Badge variant token; PURE.
function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "INACTIVE":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function getTypeBadgeVariant(type: string) {
  return type === "COMPANY" ? ("info" as const) : ("default" as const);
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="text-base text-neutral-900 dark:text-neutral-100 mt-1">
        {value ?? <span className="text-neutral-400 dark:text-neutral-500">—</span>}
      </p>
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

  const stats = useMemo(() => {
    if (!customer) {
      return { contacts: 0, rateOverrides: 0, primaryContacts: 0, defaultRateLabel: "—" };
    }
    const rateOverrides = customer.contacts.reduce(
      (sum, c) => sum + (c.employeeRates?.length ?? 0),
      0,
    );
    const primaryContacts = customer.contacts.filter((c) => c.isPrimary).length;
    const defaultRateLabel =
      customer.defaultHourlyRate != null
        ? formatCurrencyAmount(customer.defaultHourlyRate)
        : "—";
    return {
      contacts: customer.contacts.length,
      rateOverrides,
      primaryContacts,
      defaultRateLabel,
    };
  }, [customer]);

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
    setError(null);
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
      await loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save contact.");
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (contact: CustomerContact) => {
    if (!id || !window.confirm(`Remove contact ${contact.firstName} ${contact.lastName}?`)) return;
    setError(null);
    try {
      await api.delete(`/customers/${id}/contacts/${contact.id}`);
      await loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove contact.");
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
    setError(null);
    try {
      await api.post(`/customers/${id}/contacts/${activeContact.id}/employee-rates`, {
        employeeId: rateEmployeeId,
        hourlyRate: parseFloat(rateHourly),
      });
      setRateDialogOpen(false);
      await loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save rate.");
    } finally {
      setSaving(false);
    }
  };

  const removeRate = async (contact: CustomerContact, employeeId: string) => {
    if (!id) return;
    setError(null);
    try {
      await api.delete(`/customers/${id}/contacts/${contact.id}/employee-rates/${employeeId}`);
      await loadCustomer();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove rate.");
    }
  };

  if (loading || !id) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-600 dark:text-neutral-400">{error ?? "Customer not found."}</p>
        <Button variant="outline" onClick={() => navigate(ROUTES.CUSTOMERS)}>
          Back to Customers
        </Button>
      </div>
    );
  }

  const addressLine = [customer.addressLine1, customer.addressLine2].filter(Boolean).join(", ");
  const cityLine = [customer.postalCode, customer.city, customer.country].filter(Boolean).join(" ");

  return (
    <div className="space-y-6">
      {/* Header — aligned with admin UserDetailPage */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            to={ROUTES.CUSTOMERS}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block"
          >
            ← Back to Customers
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {customer.displayName}
            </h1>
            <Badge variant={getStatusBadgeVariant(customer.status)} size="md">
              {customer.status}
            </Badge>
            <Badge variant={getTypeBadgeVariant(customer.customerType)} size="md">
              {customer.customerType === "COMPANY" ? "Company" : "Individual"}
            </Badge>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1 font-mono text-sm">
            {customer.customerNumber}
            {customer.email ? ` · ${customer.email}` : ""}
          </p>
        </div>
        {canUpdate && customer.customerType === "COMPANY" && (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={openAddContact}>
              Add Contact
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Contacts</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.contacts}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Rate overrides</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.rateOverrides}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Primary contacts</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.primaryContacts}</p>
        </div>
        <div className={CARD_CLASS}>
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Default hourly rate</p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">{stats.defaultRateLabel}</p>
        </div>
      </div>

      {/* Customer details */}
      <div className={CARD_CLASS}>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Customer Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DetailField label="Customer number" value={customer.customerNumber} />
          <DetailField
            label="Default hourly rate"
            value={
              customer.defaultHourlyRate != null
                ? `${formatCurrencyAmount(customer.defaultHourlyRate)}/h`
                : null
            }
          />
          {customer.customerType === "INDIVIDUAL" ? (
            <>
              <DetailField label="First name" value={customer.firstName} />
              <DetailField label="Last name" value={customer.lastName} />
            </>
          ) : (
            <DetailField label="Company name" value={customer.companyName} />
          )}
          <DetailField label="Email" value={customer.email} />
          <DetailField label="Phone" value={customer.phone} />
          <DetailField label="Address" value={addressLine || null} />
          <DetailField label="City / region" value={cityLine || null} />
          <DetailField label="Created at" value={formatDateTimeFull(customer.createdAt)} />
          <DetailField label="Updated at" value={formatDateTimeFull(customer.updatedAt)} />
        </div>

        {customer.notes && (
          <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Notes</h3>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        )}
      </div>

      {/* Contacts & billing rates */}
      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Contacts & billing rates</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {customer.customerType === "COMPANY"
                ? "Manage company contacts and per-employee hourly rate overrides for time tracking."
                : "Individual customers use the default hourly rate; contacts apply to companies only."}
            </p>
          </div>
          {canUpdate && customer.customerType === "COMPANY" && (
            <Button variant="outline" size="sm" onClick={openAddContact}>
              Add Contact
            </Button>
          )}
        </div>

        {customer.customerType !== "COMPANY" ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            Switch this record to a company customer to add contacts and employee-specific billing rates.
          </p>
        ) : customer.contacts.length === 0 ? (
          <p className="text-neutral-600 dark:text-neutral-400">
            No contacts yet.{canUpdate ? " Use Add Contact to create one." : ""}
          </p>
        ) : (
          <div className="space-y-4">
            {customer.contacts.map((contact) => (
              <div
                key={contact.id}
                className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3 p-4 bg-neutral-50/50 dark:bg-neutral-800/30">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        {contact.firstName} {contact.lastName}
                      </p>
                      {contact.isPrimary && (
                        <Badge variant="info" size="sm">
                          Primary
                        </Badge>
                      )}
                    </div>
                    {contact.title && (
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">{contact.title}</p>
                    )}
                    {(contact.email || contact.phone) && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        {[contact.email, contact.phone].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {canUpdate && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => openEditContact(contact)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => deleteContact(contact)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      Employee hourly rates
                    </h3>
                    {canUpdate && (
                      <Button size="sm" variant="primary" onClick={() => openAddRate(contact)}>
                        Add rate
                      </Button>
                    )}
                  </div>

                  {contact.employeeRates.length === 0 ? (
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Uses customer default rate when no override is set.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                      <table className="w-full">
                        <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                              Employee
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                              Email
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                              Rate
                            </th>
                            {canUpdate && <th className="px-4 py-3 w-24" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                          {contact.employeeRates.map((rate) => (
                            <tr
                              key={rate.id}
                              className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                            >
                              <td className="px-4 py-3 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {rate.employee.firstName} {rate.employee.lastName}
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400">
                                {rate.employee.email}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-right text-neutral-900 dark:text-neutral-100">
                                {formatCurrencyAmount(rate.hourlyRate)}/h
                              </td>
                              {canUpdate && (
                                <td className="px-4 py-3 text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeRate(contact, rate.employeeId)}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={contactDialogOpen}
        onOpenChange={(v) => !v && setContactDialogOpen(false)}
        title={activeContact ? "Edit contact" : "Add contact"}
        description={
          activeContact
            ? `Update ${activeContact.firstName} ${activeContact.lastName}`
            : "Add a new contact for this company"
        }
      >
        <form onSubmit={saveContact} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              value={contactForm.firstName}
              onChange={(e) => setContactForm((f) => ({ ...f, firstName: e.target.value }))}
              required
            />
            <Input
              label="Last name"
              value={contactForm.lastName}
              onChange={(e) => setContactForm((f) => ({ ...f, lastName: e.target.value }))}
              required
            />
            <Input
              label="Email"
              value={contactForm.email}
              onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Phone"
              value={contactForm.phone}
              onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Job title"
              value={contactForm.title}
              onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))}
              className="sm:col-span-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={contactForm.isPrimary}
              onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              className="rounded border-neutral-300"
            />
            Primary contact
          </label>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Save contact"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={rateDialogOpen}
        onOpenChange={(v) => !v && setRateDialogOpen(false)}
        title="Set employee hourly rate"
        description={
          activeContact
            ? `Override the default rate for ${activeContact.firstName} ${activeContact.lastName}'s billing context.`
            : undefined
        }
      >
        <form onSubmit={saveRate} className="p-6 space-y-4">
          <Select
            label="Employee"
            value={rateEmployeeId}
            onChange={(e) => setRateEmployeeId(e.target.value)}
          >
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName} ({emp.email})
              </option>
            ))}
          </Select>
          <Input
            label="Hourly rate"
            type="number"
            min="0"
            step="0.01"
            value={rateHourly}
            onChange={(e) => setRateHourly(e.target.value)}
            required
          />
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !rateEmployeeId}>
              {saving ? "Saving…" : "Save rate"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
