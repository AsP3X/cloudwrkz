// Human: Shared TypeScript shapes for API entities (tickets, employees, time entries, etc.) used across pages and hooks.
// Agent: DEFINES interfaces and unions only; NO runtime exports; CONSUMED by api client and React components.

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  status: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string | null;
  description_plain: string | null;
  type: string;
  status: string;
  priority: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by?: UserSummary | null;
  assigned_to?: UserSummary | null;
  assigned_to_group?: GroupSummary | null;
  comment_count: number;
}

/** Comment author from API (includes role for badge). */
export interface CommentAuthor {
  id: string;
  name: string | null;
  email: string;
  status: string;
  role?: string | null;
}

export interface TicketComment {
  id: string;
  content: string;
  content_html?: string | null;
  content_plain?: string | null;
  merged_from_ticket_number?: string | null;
  created_at: string;
  updated_at: string;
  is_agent_only: boolean;
  user_id?: string | null;
  author_name?: string | null;
  user?: CommentAuthor | null;
}

export type TicketActivityType =
  | "CREATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "TYPE_CHANGED"
  | "TITLE_CHANGED"
  | "DESCRIPTION_CHANGED"
  | "ASSIGNED_TO_AGENT"
  | "UNASSIGNED_FROM_AGENT"
  | "ASSIGNED_TO_GROUP"
  | "UNASSIGNED_FROM_GROUP"
  | "TAGS_CHANGED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "COMMENT_ADDED"
  | "TIMER_CREATED"
  | "TIMER_ASSIGNED"
  | "TIMER_UNASSIGNED"
  | "TIMER_STARTED"
  | "TIMER_PAUSED"
  | "TIMER_RESUMED"
  | "TIMER_STOPPED"
  | "MERGED_FROM_TICKET"
  | "MERGED_INTO_TICKET";

export interface TicketActivity {
  id: string;
  activity_type: string;
  merged_from_ticket_number?: string | null;
  changed_by_id?: string | null;
  changed_by_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  changed_by?: UserSummary | null;
}

export interface TodoParentSummary {
  id: string;
  title: string;
}

export interface TodoTicketSummary {
  id: string;
  ticket_number: string;
  title: string;
}

export interface TodoDependsOnSummary {
  id: string;
  title: string;
  status: string;
}

export interface TodoDependencyItem {
  depends_on_todo: TodoDependsOnSummary;
}

export interface Todo {
  id: string;
  todo_number: string | null;
  parent_todo_id: string | null;
  title: string;
  description: string | null;
  description_html: string | null;
  description_plain: string | null;
  status: string;
  priority: string;
  assigned_to_id: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  archived_at: string | null;
  ticket_id: string | null;
  order: number;
  created_at: string;
  updated_at: string;
  assigned_to?: UserSummary | null;
  subtodos: Todo[];
  parent_todo?: TodoParentSummary | null;
  ticket?: TodoTicketSummary | null;
  dependencies?: TodoDependencyItem[];
}

export interface Link {
  id: string;
  title: string;
  url: string;
  normalized_url: string | null;
  description: string | null;
  favicon: string | null;
  link_type: string;
  tags: string[];
  notes: string | null;
  is_favorite: boolean;
  rating: number | null;
  metadata: Record<string, unknown> | null;
  metadata_extracted_at: string | null;
  collections?: Array<{
    collection: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
  user_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  link_count: number;
  /** Present on list/detail from API for ownership checks in the collection filter bar. */
  owner?: { id: string; name: string | null; email: string };
}

export interface TimeEntry {
  id: string;
  name: string;
  description: string | null;
  status: string;
  started_at: string;
  paused_at: string | null;
  stopped_at: string | null;
  completed_at: string | null;
  total_duration: number;
  last_resumed_at: string | null;
  user_id: string;
  ticket_id: string | null;
  customer_id: string | null;
  hourly_rate: number | null;
  customer?: {
    id: string;
    customer_number: string;
    display_name: string;
  } | null;
  tags: string[];
  billable: boolean;
  location: string | null;
  timezone: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  breaks: TimeEntryBreak[];
}

export interface TimeEntryBreak {
  id: string;
  time_entry_id: string;
  started_at: string;
  ended_at: string | null;
  duration: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  resourceUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  context: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Audit log entry from GET /admin/audit/entries (includes user email/name when present). */
export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  context: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user: { email: string; name: string | null } | null;
}

export interface AuditEntriesResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  avatar: string | null;
  timezone: string | null;
  theme: string | null;
  locale: string | null;
  bio: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissionCount?: number;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  permissionCount?: number;
  createdAt: string;
  updatedAt: string;
  members?: Array<{ id: string; name: string | null; email: string; role: string }>;
}

export interface Module {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface AdminSession {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
}

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "PROBATION" | "TERMINATED";

export interface EmployeeEmail {
  id: string;
  email: string;
  label: string | null;
  createdAt: string;
}

export interface EmployeeManager {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  employeeStatus: EmployeeStatus;
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
  linkedUser: { id: string; email: string; name: string | null } | null;
  emails: EmployeeEmail[];
  managers: EmployeeManager[];
  createdAt: string;
  updatedAt: string;
}

export type CustomerType = "INDIVIDUAL" | "COMPANY";
export type CustomerStatus = "ACTIVE" | "INACTIVE";

export interface CustomerContactEmployeeRate {
  id: string;
  employeeId: string;
  hourlyRate: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface CustomerContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  notes: string | null;
  employeeRates: CustomerContactEmployeeRate[];
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  customerNumber: string;
  customerType: CustomerType;
  status: CustomerStatus;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  defaultHourlyRate: number | null;
  contacts: CustomerContact[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketType = "QUESTION" | "BUG" | "FEATURE_REQUEST" | "TASK";
export type TodoStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TodoPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TimeEntryStatus = "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED";
