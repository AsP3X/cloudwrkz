---
name: Employee Management
overview: Add a full employee management module accessible from both the admin and user sidebars, spanning a new DB schema, Rust API routes, and a React frontend with create/edit/delete dialogs including user-account linking.
todos:
  - id: migration-employees
    content: "Write migration 016_employees.sql: enums, employees, employee_emails, employee_managers tables"
    status: completed
  - id: migration-permissions
    content: "Write migration 017_employee_permissions.sql: employees module, 5 permissions, admin group grants"
    status: completed
  - id: api-employees-rs
    content: "Write apps/api/src/routes/employees.rs: full CRUD + check-email + link-user handlers"
    status: completed
  - id: api-mod-rs
    content: Register employees module and router in apps/api/src/routes/mod.rs
    status: completed
  - id: frontend-types
    content: Add Employee, EmployeeEmail, EmployeeManager interfaces to types.ts
    status: completed
  - id: frontend-routes
    content: Add EMPLOYEES and EMPLOYEE_DETAIL to routes.ts
    status: completed
  - id: frontend-employees-page
    content: Create EmployeesPage.tsx with list, search/filter, and create/edit/delete dialogs including user-account creation/linking flow
    status: completed
  - id: frontend-employee-detail
    content: Create EmployeeDetailPage.tsx with full field display, email list, manager list, and link/unlink user action
    status: completed
  - id: frontend-pages-index
    content: Export both new page components from pages/index.ts
    status: completed
  - id: frontend-app-routes
    content: Add employees and employees/:id routes to App.tsx
    status: completed
  - id: sidebar-user
    content: "Add HR section with Employees link (moduleKey: employees) to DashboardSidebar.tsx"
    status: completed
  - id: sidebar-admin
    content: Add canViewEmployees prop and HR section to AdminSidebar.tsx
    status: completed
  - id: layout-employees
    content: Pass canViewEmployees to AdminSidebar in DashboardLayout.tsx
    status: completed
  - id: verify-build
    content: Run cargo check on api and tsc/vite build on web-vite to verify no errors
    status: completed
isProject: false
---

# Employee Management Feature Plan

## Architecture Overview

```mermaid
flowchart LR
    subgraph frontend [Frontend - apps/web-vite]
        sidebar_user[DashboardSidebar\nmoduleKey: employees]
        sidebar_admin[AdminSidebar\ncanViewEmployees prop]
        EmployeesPage[EmployeesPage\n/dashboard/employees]
        EmployeeDetailPage[EmployeeDetailPage\n/dashboard/employees/:id]
        CreateDialog["CreateDialog\n(+ user-account flow)"]
    end
    subgraph api [API - apps/api]
        emp_routes[employees.rs\nGET/POST/PATCH/DELETE]
        check_user[POST /employees/:id/link-user\nGET /employees/check-email]
        permissions[migration 017\npermissions + module]
    end
    subgraph db [Database]
        employees_table[employees]
        employee_emails[employee_emails]
        employee_managers[employee_managers]
        users_table[users]
    end
    EmployeesPage --> emp_routes
    CreateDialog --> check_user
    emp_routes --> employees_table
    employees_table --> employee_emails
    employees_table --> employee_managers
    employees_table -->|"linked_user_id FK"| users_table
    sidebar_user --> EmployeesPage
    sidebar_admin --> EmployeesPage
```

## 1. Database Migration `016_employees.sql`

New file: `apps/api/migrations/016_employees.sql`

- Enum `employee_status_enum`: `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `PROBATION`, `TERMINATED`
- `employees` table: `id TEXT PK`, `first_name`, `last_name`, `email TEXT NOT NULL`, `title`, `employee_status employee_status_enum`, `company_role`, `department TEXT` (placeholder), `monthly_salary NUMERIC(12,2)`, `monthly_expenses NUMERIC(12,2)` (placeholder), `hours_worked NUMERIC(10,2)` (placeholder), `vacation_available INT`, `vacation_used INT`, `vacation_planned INT`, `sick_days_total INT`, `sick_days_available INT`, `linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL`, `created_at`, `updated_at`
- `employee_emails` table: `id TEXT PK`, `employee_id FK`, `email TEXT NOT NULL`, `label TEXT` (e.g. "work", "personal"), `created_at`
- `employee_managers` join table: `employee_id FK`, `manager_employee_id FK`, `UNIQUE(employee_id, manager_employee_id)`

## 2. Permission Migration `017_employee_permissions.sql`

New file: `apps/api/migrations/017_employee_permissions.sql`

- Insert `employees` module (`key = 'employees'`, `enabled = true`)
- Insert permissions: `employees.view`, `employees.create`, `employees.update`, `employees.delete`, `modules.employees.view`
- Grant all five to the default admin group (mirrors pattern in `003_default_group_and_assign_permissions.sql`)

## 3. Rust API: `apps/api/src/routes/employees.rs`

New module. Pattern mirrors [`apps/api/src/routes/admin.rs`](apps/api/src/routes/admin.rs).

Routes exposed:
- `GET /employees` — list with `search`, `status`, `page`, `limit` params; requires `employees.view`
- `POST /employees` — create; requires `employees.create`; body includes optional `create_user_account: bool`
- `GET /employees/check-email?email=...` — checks `users` table for existing account; requires `employees.create`
- `GET /employees/:id` — single record with emails + managers; requires `employees.view`
- `PATCH /employees/:id` — update; requires `employees.update`
- `DELETE /employees/:id` — delete; requires `employees.delete`
- `POST /employees/:id/link-user` — set/clear `linked_user_id`; requires `employees.update`

Register in [`apps/api/src/routes/mod.rs`](apps/api/src/routes/mod.rs): `.merge(employees::router())`

## 4. Frontend Types

Add to [`apps/web-vite/src/lib/types.ts`](apps/web-vite/src/lib/types.ts):

```typescript
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  employeeStatus: string;
  companyRole: string | null;
  department: string | null;
  monthlySalary: number | null;
  monthlyExpenses: number | null;
  hoursWorked: number | null;
  vacationAvailable: number;
  vacationUsed: number;
  vacationPlanned: number;
  sickDaysTotal: number;
  sickDaysAvailable: number;
  linkedUserId: string | null;
  linkedUser?: { id: string; email: string; name: string | null } | null;
  emails: EmployeeEmail[];
  managers: EmployeeManager[];
  createdAt: string;
  updatedAt: string;
}
export interface EmployeeEmail { id: string; email: string; label: string | null; }
export interface EmployeeManager { id: string; firstName: string; lastName: string; email: string; }
```

## 5. Route Constants

Add to [`apps/web-vite/src/lib/constants/routes.ts`](apps/web-vite/src/lib/constants/routes.ts):

```typescript
EMPLOYEES: "/dashboard/employees",
EMPLOYEE_DETAIL: "/dashboard/employees/:id",
```

## 6. Frontend Pages

Both admins and regular users with the `employees` module see `/dashboard/employees`.

### `EmployeesPage.tsx`

New file: `apps/web-vite/src/pages/dashboard/EmployeesPage.tsx`

- Table/card list with search + status filter
- Create dialog with all employee fields + "Create user account" toggle:
  - If toggled on and email matches an existing user → show a second confirmation dialog warning about the existing account with option to link it
  - If toggled on and no existing user → API creates a user account automatically
- Edit dialog (same fields, minus account-creation logic)
- Delete confirmation dialog
- Context menu actions per row (view / edit / delete) following `OverviewContextMenu` pattern

### `EmployeeDetailPage.tsx`

New file: `apps/web-vite/src/pages/dashboard/EmployeeDetailPage.tsx`

- Detailed view: all fields, additional emails list, manager list, linked user account chip
- "Link / Unlink user account" action

## 7. Sidebar Updates

### `DashboardSidebar.tsx` (regular users)

Add a new `"HR"` section in [`apps/web-vite/src/components/layout/DashboardSidebar.tsx`](apps/web-vite/src/components/layout/DashboardSidebar.tsx):

```typescript
Object.freeze({
  kind: "flat" as const,
  title: "HR",
  icon: UsersIcon,
  items: Object.freeze([
    Object.freeze({ name: "Employees", href: ROUTES.EMPLOYEES, icon: UsersIcon, moduleKey: "employees" }),
  ]),
}),
```

### `AdminSidebar.tsx`

Add `canViewEmployees` prop to [`apps/web-vite/src/components/layout/AdminSidebar/AdminSidebar.tsx`](apps/web-vite/src/components/layout/AdminSidebar/AdminSidebar.tsx) and a new `"HR"` collapsible section with an Employees link.

### `DashboardLayout.tsx`

Pass `canViewEmployees={can("employees.view") || can("employees.create") || ...}` to `AdminSidebar` in [`apps/web-vite/src/components/layout/DashboardLayout.tsx`](apps/web-vite/src/components/layout/DashboardLayout.tsx).

## 8. App.tsx + pages/index.ts

Add routes to [`apps/web-vite/src/App.tsx`](apps/web-vite/src/App.tsx):

```tsx
<Route path="employees" element={<EmployeesPage />} />
<Route path="employees/:id" element={<EmployeeDetailPage />} />
```

Export both pages from [`apps/web-vite/src/pages/index.ts`](apps/web-vite/src/pages/index.ts).

## User-account creation flow (dialog states)

```mermaid
flowchart TD
    A[Create Employee Dialog] --> B{Create user account\ntoggle enabled?}
    B -->|No| C[POST /employees\ncreate_user_account: false]
    B -->|Yes| D[GET /employees/check-email]
    D -->|User not found| C2[POST /employees\ncreate_user_account: true]
    D -->|User exists| E[Show LinkExistingUserDialog\nwith existing user details]
    E -->|Cancel| F[Return to form]
    E -->|Link account| G[POST /employees\nlink_existing_user_id: userId]
```

## Key files changed / created

- `apps/api/migrations/016_employees.sql` — new
- `apps/api/migrations/017_employee_permissions.sql` — new
- `apps/api/src/routes/employees.rs` — new
- `apps/api/src/routes/mod.rs` — add employees module + router merge
- `apps/web-vite/src/lib/types.ts` — add Employee types
- `apps/web-vite/src/lib/constants/routes.ts` — add EMPLOYEES, EMPLOYEE_DETAIL
- `apps/web-vite/src/pages/dashboard/EmployeesPage.tsx` — new
- `apps/web-vite/src/pages/dashboard/EmployeeDetailPage.tsx` — new
- `apps/web-vite/src/pages/index.ts` — export new pages
- `apps/web-vite/src/App.tsx` — add routes
- `apps/web-vite/src/components/layout/DashboardSidebar.tsx` — HR section
- `apps/web-vite/src/components/layout/AdminSidebar/AdminSidebar.tsx` — HR section + prop
- `apps/web-vite/src/components/layout/DashboardLayout.tsx` — pass canViewEmployees
