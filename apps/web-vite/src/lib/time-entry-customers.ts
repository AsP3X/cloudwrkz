// Human: Permission helpers for linking customers on time entries without full Customers module access.
// Agent: READS modules[] + can(); GATES list/search vs create vs full register (customers.view / modules.customers.view).

import { PERM } from "@/lib/permissions";

/** Search/select customers on time entry billing when the customers module is enabled. */
export function canViewCustomersForTimeEntries(
  modules: readonly string[],
  can: (permission: string) => boolean,
): boolean {
  if (!modules.includes("customers")) {
    return false;
  }
  return (
    can(PERM.CUSTOMERS_VIEW) ||
    can(PERM.MODULES_CUSTOMERS_VIEW) ||
    can(PERM.TIME_TRACKING_CUSTOMERS_VIEW)
  );
}

/** Create customers from time entry flows without `customers.create` or the Customers nav module. */
export function canCreateCustomersForTimeEntries(can: (permission: string) => boolean): boolean {
  return can(PERM.CUSTOMERS_CREATE) || can(PERM.TIME_TRACKING_CUSTOMERS_CREATE);
}

/** Show customer billing UI (search and/or create) on time entry dialogs. */
export function canUseCustomerBillingOnTimeEntries(
  modules: readonly string[],
  can: (permission: string) => boolean,
): boolean {
  return (
    canViewCustomersForTimeEntries(modules, can) ||
    canCreateCustomersForTimeEntries(can)
  );
}
