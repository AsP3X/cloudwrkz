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
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
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

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketType = "QUESTION" | "BUG" | "FEATURE_REQUEST" | "TASK";
export type TodoStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TodoPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TimeEntryStatus = "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED";
