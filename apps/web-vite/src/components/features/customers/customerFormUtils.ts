// Human: Shared customer form state, labels, and API payload builders for create/edit dialogs.
// Agent: EXPORTS CustomerFormData EMPTY_FORM buildCreatePayload buildUpdatePayload; PURE validation helpers.

import type { Customer, CustomerStatus, CustomerType } from "@/lib/types";

export const CUSTOMER_STATUSES: CustomerStatus[] = ["ACTIVE", "INACTIVE"];
export const CUSTOMER_TYPES: CustomerType[] = ["INDIVIDUAL", "COMPANY"];

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const TYPE_LABELS: Record<CustomerType, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
};

export interface InitialContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  isPrimary: boolean;
}

export interface CustomerFormData {
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
  initialContact: InitialContactFormData;
}

export const EMPTY_INITIAL_CONTACT: InitialContactFormData = {
  firstName: "",
  lastName: "",
  email: "",
  isPrimary: true,
};

export const EMPTY_FORM: CustomerFormData = {
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
  initialContact: { ...EMPTY_INITIAL_CONTACT },
};

export function formFromCustomer(c: Customer): CustomerFormData {
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
    initialContact: { ...EMPTY_INITIAL_CONTACT },
  };
}

function parseRateInput(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

function isValidEmail(email: string): boolean {
  const t = email.trim();
  if (!t) return true;
  return t.includes("@") && !t.startsWith("@") && !t.endsWith("@") && t.length <= 254;
}

export function validateCustomerForm(form: CustomerFormData, isCreate: boolean): string | null {
  if (form.customerType === "INDIVIDUAL") {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return "First name and last name are required for individual customers.";
    }
  } else if (!form.companyName.trim()) {
    return "Company name is required for company customers.";
  }
  if (!isValidEmail(form.email)) {
    return "Enter a valid email address.";
  }
  const rate = parseRateInput(form.defaultHourlyRate);
  if (rate === undefined) {
    return "Default hourly rate must be a non-negative number.";
  }
  if (isCreate && form.customerType === "COMPANY" && form.initialContact.firstName.trim()) {
    if (!form.initialContact.lastName.trim()) {
      return "Contact last name is required when adding an initial contact.";
    }
    if (!isValidEmail(form.initialContact.email)) {
      return "Enter a valid contact email.";
    }
  }
  return null;
}

export function buildCreatePayload(form: CustomerFormData): Record<string, unknown> {
  const defaultHourlyRate = parseRateInput(form.defaultHourlyRate);
  const base: Record<string, unknown> = {
    customerType: form.customerType,
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
    firstName: form.customerType === "INDIVIDUAL" ? form.firstName.trim() : undefined,
    lastName: form.customerType === "INDIVIDUAL" ? form.lastName.trim() : undefined,
    companyName: form.customerType === "COMPANY" ? form.companyName.trim() : undefined,
  };

  if (form.customerType === "COMPANY" && form.initialContact.firstName.trim()) {
    base.contacts = [
      {
        firstName: form.initialContact.firstName.trim(),
        lastName: form.initialContact.lastName.trim(),
        email: form.initialContact.email.trim() || undefined,
        isPrimary: form.initialContact.isPrimary,
      },
    ];
  }

  return base;
}

/** Build PATCH body with explicit nulls for cleared optional fields. */
export function buildUpdatePayload(
  form: CustomerFormData,
  original: Customer,
): Record<string, unknown> {
  const defaultHourlyRate = parseRateInput(form.defaultHourlyRate);
  const payload: Record<string, unknown> = { status: form.status };

  const setOptional = (key: string, value: string, orig: string | null | undefined) => {
    const t = value.trim();
    if (t) payload[key] = t;
    else if (orig) payload[key] = null;
  };

  setOptional("firstName", form.firstName, original.firstName);
  setOptional("lastName", form.lastName, original.lastName);
  setOptional("companyName", form.companyName, original.companyName);
  setOptional("email", form.email, original.email);
  setOptional("phone", form.phone, original.phone);
  setOptional("addressLine1", form.addressLine1, original.addressLine1);
  setOptional("addressLine2", form.addressLine2, original.addressLine2);
  setOptional("city", form.city, original.city);
  setOptional("postalCode", form.postalCode, original.postalCode);
  setOptional("country", form.country, original.country);
  setOptional("notes", form.notes, original.notes);

  if (defaultHourlyRate != null) payload.defaultHourlyRate = defaultHourlyRate;
  else if (original.defaultHourlyRate != null) payload.defaultHourlyRate = null;

  return payload;
}
