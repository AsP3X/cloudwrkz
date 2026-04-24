-- Initial schema exported from Prisma (apps/web/prisma/schema.prisma).
-- This migration creates all tables if they don't already exist.
-- For existing databases (migrated from Prisma), tables will already be present;
-- use IF NOT EXISTS so the migration is idempotent.

-- Enums
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MODERATOR', 'AGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TicketType" AS ENUM ('BUG', 'FEATURE', 'QUESTION', 'SUPPORT', 'TASK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TimeEntryStatus" AS ENUM ('RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TodoStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TodoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TodoDependencyType" AS ENUM ('FINISH_TO_START', 'START_TO_START', 'FINISH_TO_FINISH', 'START_TO_FINISH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LinkType" AS ENUM ('WEBSITE', 'FILE', 'DOCUMENT', 'VIDEO', 'IMAGE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CollectionRole" AS ENUM ('VIEWER', 'EDITOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('TICKET_ASSIGNED', 'TICKET_STATUS_CHANGED', 'TICKET_COMMENT_ADDED', 'TODO_ASSIGNED', 'UNBAN_REVIEWED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TicketActivityType" AS ENUM (
    'CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'TYPE_CHANGED',
    'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'ASSIGNED_TO_AGENT',
    'UNASSIGNED_FROM_AGENT', 'ASSIGNED_TO_GROUP', 'UNASSIGNED_FROM_GROUP',
    'TAGS_CHANGED', 'RESOLVED', 'CLOSED', 'REOPENED', 'COMMENT_ADDED',
    'TIMER_CREATED', 'TIMER_ASSIGNED', 'TIMER_UNASSIGNED',
    'TIMER_STARTED', 'TIMER_PAUSED', 'TIMER_RESUMED', 'TIMER_STOPPED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  password TEXT NOT NULL,
  role "Role" NOT NULL DEFAULT 'USER',
  status "UserStatus" NOT NULL DEFAULT 'PENDING',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  theme TEXT NOT NULL DEFAULT 'system',
  locale TEXT NOT NULL DEFAULT 'en',
  filter_preferences JSONB,
  view_preferences JSONB,
  email_verification_token TEXT,
  email_verification_expires TIMESTAMP,
  password_reset_token TEXT,
  password_reset_expires TIMESTAMP,
  avatar TEXT,
  bio TEXT,
  last_login_at TIMESTAMP,
  last_login_ip TEXT,
  cookie_consent_accepted BOOLEAN NOT NULL DEFAULT false,
  cookie_consent_accepted_at TIMESTAMP,
  scheduled_for_deletion_at TIMESTAMP,
  original_email TEXT,
  banned_at TIMESTAMP,
  ban_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_scheduled_for_deletion_at ON users(scheduled_for_deletion_at);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  device_id TEXT,
  device_name TEXT,
  device_type TEXT,
  device_os TEXT,
  device_browser TEXT,
  user_agent TEXT,
  ip_address TEXT,
  recently_viewed JSONB
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);

-- QR Login Requests
CREATE TABLE IF NOT EXISTS qr_login_requests (
  id TEXT PRIMARY KEY,
  browser_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMP NOT NULL,
  user_id TEXT,
  session_token TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_login_requests_browser_token ON qr_login_requests(browser_token);
CREATE INDEX IF NOT EXISTS idx_qr_login_requests_expires_at ON qr_login_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_qr_login_requests_status ON qr_login_requests(status);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Modules
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modules_key ON modules(key);
CREATE INDEX IF NOT EXISTS idx_modules_enabled ON modules(enabled);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  module TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);

-- Group Permissions
CREATE TABLE IF NOT EXISTS group_permissions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id ON group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_permissions_permission_id ON group_permissions(permission_id);

-- User Permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id);

-- Group Memberships
CREATE TABLE IF NOT EXISTS group_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  description_plain TEXT,
  type "TicketType" NOT NULL DEFAULT 'BUG',
  status "TicketStatus" NOT NULL DEFAULT 'OPEN',
  priority "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
  created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  attachments TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  due_date TIMESTAMP,
  archived_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_id ON tickets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_id ON tickets(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to_group_id ON tickets(assigned_to_group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_archived_at ON tickets(archived_at);

-- Ticket Comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  content_html TEXT,
  content_plain TEXT,
  merged_from_ticket_number TEXT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,
  is_agent_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON ticket_comments(user_id);

-- Ticket Activities
CREATE TABLE IF NOT EXISTS ticket_activities (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  activity_type "TicketActivityType" NOT NULL,
  merged_from_ticket_number TEXT,
  changed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_changed_by_id ON ticket_activities(changed_by_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_activity_type ON ticket_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_created_at ON ticket_activities(created_at);

-- Time Entries
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status "TimeEntryStatus" NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMP,
  stopped_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_duration INTEGER NOT NULL DEFAULT 0,
  last_resumed_at TIMESTAMP,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  merged_from_ticket_number TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  billable BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  timezone TEXT,
  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_status ON time_entries(status);
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id ON time_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_created_at ON time_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_time_entries_archived_at ON time_entries(archived_at);

-- Time Entry Breaks
CREATE TABLE IF NOT EXISTS time_entry_breaks (
  id TEXT PRIMARY KEY,
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entry_breaks_time_entry_id ON time_entry_breaks(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_breaks_started_at ON time_entry_breaks(started_at);

-- Location History
CREATE TABLE IF NOT EXISTS location_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, address)
);
CREATE INDEX IF NOT EXISTS idx_location_history_user_id ON location_history(user_id);

-- Todos
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  todo_number TEXT UNIQUE,
  parent_todo_id TEXT REFERENCES todos(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  description_html TEXT,
  description_plain TEXT,
  status "TodoStatus" NOT NULL DEFAULT 'NOT_STARTED',
  priority "TodoPriority" NOT NULL DEFAULT 'MEDIUM',
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  estimated_hours DOUBLE PRECISION,
  actual_hours DOUBLE PRECISION,
  start_date TIMESTAMP,
  due_date TIMESTAMP,
  completed_date TIMESTAMP,
  archived_at TIMESTAMP,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todos_parent_todo_id ON todos(parent_todo_id);
CREATE INDEX IF NOT EXISTS idx_todos_assigned_to_id ON todos(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);
CREATE INDEX IF NOT EXISTS idx_todos_ticket_id ON todos(ticket_id);
CREATE INDEX IF NOT EXISTS idx_todos_todo_number ON todos(todo_number);
CREATE INDEX IF NOT EXISTS idx_todos_archived_at ON todos(archived_at);

-- Todo Dependencies
CREATE TABLE IF NOT EXISTS todo_dependencies (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  depends_on_todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  type "TodoDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(todo_id, depends_on_todo_id)
);
CREATE INDEX IF NOT EXISTS idx_todo_dependencies_todo_id ON todo_dependencies(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_dependencies_depends_on_todo_id ON todo_dependencies(depends_on_todo_id);

-- Unban Requests
CREATE TABLE IF NOT EXISTS unban_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  admin_notes TEXT,
  ticket_id TEXT UNIQUE REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unban_requests_user_id ON unban_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_unban_requests_status ON unban_requests(status);
CREATE INDEX IF NOT EXISTS idx_unban_requests_created_at ON unban_requests(created_at);

-- Links
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT,
  description TEXT,
  favicon TEXT,
  link_type "LinkType" NOT NULL DEFAULT 'WEBSITE',
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  rating INTEGER,
  metadata JSONB,
  metadata_extracted_at TIMESTAMP,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id_normalized_url ON links(user_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_links_link_type ON links(link_type);
CREATE INDEX IF NOT EXISTS idx_links_archived_at ON links(archived_at);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);
CREATE INDEX IF NOT EXISTS idx_links_is_favorite ON links(is_favorite);
CREATE INDEX IF NOT EXISTS idx_links_rating ON links(rating);
CREATE INDEX IF NOT EXISTS idx_links_url ON links(url);

-- Link Shares
CREATE TABLE IF NOT EXISTS link_shares (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role "CollectionRole" NOT NULL DEFAULT 'VIEWER',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(link_id, shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS idx_link_shares_link_id ON link_shares(link_id);
CREATE INDEX IF NOT EXISTS idx_link_shares_shared_with_user_id ON link_shares(shared_with_user_id);

-- Collections
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archived_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_collections_owner_id ON collections(owner_id);
CREATE INDEX IF NOT EXISTS idx_collections_archived_at ON collections(archived_at);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at);

-- Link Collections (join table)
CREATE TABLE IF NOT EXISTS link_collections (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(link_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_link_collections_link_id ON link_collections(link_id);
CREATE INDEX IF NOT EXISTS idx_link_collections_collection_id ON link_collections(collection_id);

-- Collection Members
CREATE TABLE IF NOT EXISTS collection_members (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role "CollectionRole" NOT NULL DEFAULT 'VIEWER',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collection_members_collection_id ON collection_members(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_members_user_id ON collection_members(user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type "NotificationType" NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  resource_type TEXT,
  resource_id TEXT,
  resource_url TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_resource_type_resource_id ON notifications(resource_type, resource_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  context JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Consolidated migration baseline
-- The SQL below inlines former migrations 002..017 so new environments only need one migration file.

-- Former 002_seed_data.sql
-- Seed default modules and permissions for the CloudWrkz API.
-- Idempotent: re-running (e.g. migrate) will upsert by key.
INSERT INTO modules (id, key, name, description, enabled, config, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'tickets', 'Tickets', 'Support ticket tracking', true, '{}'::jsonb, NOW(), NOW()),
  (gen_random_uuid()::text, 'timetracking', 'Time Tracking', 'Time entries and timers', true, '{}'::jsonb, NOW(), NOW()),
  (gen_random_uuid()::text, 'todos', 'Todos', 'Task and todo management', true, '{}'::jsonb, NOW(), NOW()),
  (gen_random_uuid()::text, 'links', 'Links', 'Bookmarks and link collections', true, '{}'::jsonb, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  config = EXCLUDED.config,
  updated_at = NOW();

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'tickets.view', 'View Tickets', 'View tickets assigned to user or user''s groups', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.view_all', 'View All Tickets', 'View all tickets regardless of assignment', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.create', 'Create Tickets', 'Create new support tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.update', 'Update Tickets', 'Update existing tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.delete', 'Delete Tickets', 'Delete tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.assign', 'Assign Tickets', 'Assign tickets to users or groups', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.comment', 'Comment on Tickets', 'Add comments to tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.time_entries.view', 'View Ticket Time Entries', 'View time entries in ticket detail view', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.time_entries.create', 'Create Ticket Time Entries', 'Create time entries from ticket detail view', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.merge', 'Merge Tickets', 'Merge one ticket into another', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.bulk_update', 'Bulk Update Tickets', 'Perform bulk update operations on multiple tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.bulk_delete', 'Bulk Delete Tickets', 'Delete multiple tickets in a single operation', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.bulk_archive', 'Bulk Archive Tickets', 'Archive multiple tickets in a single operation', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.bulk_unarchive', 'Bulk Unarchive Tickets', 'Unarchive multiple tickets in a single operation', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.archive', 'Archive Tickets', 'Archive and unarchive individual tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.comments.agent_only', 'Create Internal Ticket Comments', 'Create agent-only/internal comments on tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.comments.view_internal', 'View Internal Ticket Comments', 'View agent-only/internal comments on tickets', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.export', 'Export Tickets', 'Export ticket data for reporting or backup', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'tickets.reports.view', 'View Ticket Reports', 'View ticket analytics and reports', 'tickets', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.view', 'View Time Entries', 'View own time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.view_all', 'View All Time Entries', 'View all time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.create', 'Create Time Entries', 'Create new time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.update', 'Update Time Entries', 'Update time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'time_tracking.delete', 'Delete Time Entries', 'Delete time entries', 'time_tracking', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'todos.view', 'View Todos', 'View todos', 'todos', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'todos.create', 'Create Todos', 'Create new todos', 'todos', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'todos.update', 'Update Todos', 'Update existing todos', 'todos', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'todos.delete', 'Delete Todos', 'Delete todos', 'todos', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'todos.assign', 'Assign Todos', 'Assign todos to other users', 'todos', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'issues.view', 'View Issues', 'View issues', 'issues', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'issues.create', 'Create Issues', 'Create issues', 'issues', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'issues.update', 'Update Issues', 'Update issues', 'issues', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'issues.delete', 'Delete Issues', 'Delete issues', 'issues', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'notes.view', 'View Notes', 'View notes', 'notes', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'notes.create', 'Create Notes', 'Create notes', 'notes', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'notes.update', 'Update Notes', 'Update notes', 'notes', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'notes.delete', 'Delete Notes', 'Delete notes', 'notes', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.view', 'View Users', 'View user list', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.create', 'Create Users', 'Create new users', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.update', 'Update Users', 'Update user details', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.users.delete', 'Delete Users', 'Delete users', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.groups.manage', 'Manage Groups', 'Create/edit/delete groups and assign permissions', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.permissions.view', 'View Permissions', 'View user and group permissions (read-only)', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.permissions.manage', 'Manage Permissions', 'View and manage user and group permissions', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.settings.manage', 'Modify System Settings', 'Modify system settings', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.jobs.view', 'View Background Jobs', 'View the background job queue and job details in admin', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'search.jobs.view', 'Search Background Jobs', 'Include background jobs in global fuzzy search (when implemented)', 'search', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.modules.manage', 'Manage Modules', 'Enable/disable modules', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.sessions.view', 'View Sessions', 'View user sessions', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.statistics.view', 'View Statistics', 'View system statistics', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.tickets.manage', 'Manage All Tickets', 'Full ticket management (admin view)', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.db.view', 'View Database Explorer', 'Access to the database explorer page', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.db.view_entries', 'View Database Entries', 'View entries in database tables', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.db.edit_entries', 'Edit Database Entries', 'Edit entries in database tables', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.db.delete_entries', 'Delete Database Entries', 'Delete entries from database tables', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'admin.db.query', 'Execute Database Queries', 'Execute SQL queries in the database explorer', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'audit.view', 'View Audit Log', 'View application audit log (who did what, when)', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'audit.export', 'Export Audit Log', 'Export audit log data', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.tickets.view', 'View Tickets Module', 'Access to the Tickets module in navigation and dashboard', 'modules', 'tickets', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.timetracking.view', 'View Time Tracking Module', 'Access to the Time Tracking module in navigation and dashboard', 'modules', 'timetracking', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.todos.view', 'View ToDo Module', 'Access to the ToDo module in navigation and dashboard', 'modules', 'todos', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.view', 'View Links', 'View bookmarks and links', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.view_all', 'View All Links', 'View all links regardless of ownership', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.create', 'Create Links', 'Create new bookmarks', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.update', 'Update Links', 'Update existing bookmarks', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.delete', 'Delete Links', 'Delete bookmarks', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.share', 'Share Links', 'Share individual links with other users', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.import', 'Import Links', 'Bulk import links from JSON or CSV', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.export', 'Export Links', 'Bulk export links to JSON or CSV', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'links.archive', 'Archive Links', 'Archive and unarchive links', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'collections.view', 'View Collections', 'View link collections', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'collections.create', 'Create Collections', 'Create new link collections', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'collections.update', 'Update Collections', 'Update existing collections', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'collections.delete', 'Delete Collections', 'Delete collections', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'collections.share', 'Share Collections', 'Share collections with other users', 'links', 'links', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.links.view', 'View Links Module', 'Access to the Links module in navigation and dashboard', 'modules', 'links', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();

-- Former 003_default_group_and_assign_permissions.sql
INSERT INTO groups (id, name, description, created_at, updated_at)
VALUES (
  'default-group-id',
  'Default',
  'Default group for standard user access. Add users to this group to grant module and ticket access.',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Default' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'modules.tickets.view',
  'modules.todos.view',
  'modules.links.view',
  'modules.timetracking.view',
  'tickets.view',
  'tickets.create',
  'tickets.comment',
  'todos.view',
  'todos.create',
  'time_tracking.view',
  'time_tracking.create',
  'links.view',
  'links.create',
  'collections.view'
)
ON CONFLICT (id) DO NOTHING;

-- Former 004_pg_trgm_fuzzy_search.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Former 005_ticket_todo_number_sequences.sql
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq;

WITH m AS (
  SELECT MAX((regexp_match(ticket_number, '^TSK-([0-9]+)$'))[1]::bigint) AS max_n
  FROM tickets
  WHERE ticket_number ~ '^TSK-[0-9]+$'
)
SELECT setval(
  'ticket_number_seq',
  GREATEST(1, COALESCE((SELECT max_n FROM m), 0)),
  COALESCE((SELECT max_n FROM m), 0) >= 1
);

CREATE SEQUENCE IF NOT EXISTS todo_number_seq;

WITH m AS (
  SELECT MAX((regexp_match(todo_number, '^#TDO-([0-9]+)$'))[1]::bigint) AS max_n
  FROM todos
  WHERE todo_number IS NOT NULL
    AND todo_number ~ '^#TDO-[0-9]+$'
)
SELECT setval(
  'todo_number_seq',
  GREATEST(1, COALESCE((SELECT max_n FROM m), 0)),
  COALESCE((SELECT max_n FROM m), 0) >= 1
);

-- Former 006_link_github_metadata_jobs.sql
CREATE TABLE IF NOT EXISTS link_github_metadata_jobs (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lgmj_pending_created
  ON link_github_metadata_jobs (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lgmj_link_status
  ON link_github_metadata_jobs (link_id, status, created_at DESC);

-- Former 007_background_jobs.sql
CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority SMALLINT NOT NULL DEFAULT 0,
  dedupe_key TEXT,
  error_message TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue
  ON background_jobs (status, priority DESC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status
  ON background_jobs (job_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_dedupe
  ON background_jobs (job_type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.link_github_metadata_jobs') IS NOT NULL THEN
    INSERT INTO background_jobs (
      id,
      job_type,
      payload,
      status,
      error_message,
      created_by_user_id,
      created_at,
      updated_at,
      started_at,
      completed_at,
      dedupe_key
    )
    SELECT
      j.id,
      'github_link_metadata',
      jsonb_build_object('link_id', j.link_id),
      CASE
        WHEN j.status = 'processing' THEN 'pending'
        ELSE j.status
      END,
      j.error_message,
      j.user_id,
      j.created_at::timestamptz,
      j.updated_at::timestamptz,
      NULL::timestamptz,
      j.completed_at::timestamptz,
      'github_link_metadata:' || j.link_id
    FROM link_github_metadata_jobs j
    WHERE NOT EXISTS (SELECT 1 FROM background_jobs b WHERE b.id = j.id);

    DROP TABLE link_github_metadata_jobs;
  END IF;
END $$;

-- Former 008_background_jobs_run_after.sql
ALTER TABLE background_jobs
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ;

COMMENT ON COLUMN background_jobs.run_after IS
  'If set on a pending job, the global worker will not claim it until now() >= run_after. NULL means eligible immediately.';

CREATE INDEX IF NOT EXISTS idx_background_jobs_pending_run_after
  ON background_jobs (status, run_after, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Former 009_admin_jobs_permissions.sql
INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'admin.jobs.view', 'View Background Jobs', 'View the background job queue and job details in admin', 'admin', NULL, NOW(), NOW()),
  (gen_random_uuid()::text, 'search.jobs.view', 'Search Background Jobs', 'Include background jobs in global fuzzy search (when implemented)', 'search', NULL, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  module = EXCLUDED.module,
  updated_at = NOW();

-- Former 010_grant_admin_jobs_view_where_settings_manage.sql
INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'mig010-gp-' || gp.id,
  gp.group_id,
  (SELECT id FROM permissions WHERE key = 'admin.jobs.view' LIMIT 1),
  NOW()
FROM group_permissions gp
JOIN permissions p ON p.id = gp.permission_id
WHERE p.key = 'admin.settings.manage'
  AND NOT EXISTS (
    SELECT 1
    FROM group_permissions gp2
    JOIN permissions p2 ON p2.id = gp2.permission_id
    WHERE gp2.group_id = gp.group_id AND p2.key = 'admin.jobs.view'
  );

INSERT INTO user_permissions (id, user_id, permission_id, created_at)
SELECT
  'mig010-up-' || up.id,
  up.user_id,
  (SELECT id FROM permissions WHERE key = 'admin.jobs.view' LIMIT 1),
  NOW()
FROM user_permissions up
JOIN permissions p ON p.id = up.permission_id
WHERE p.key = 'admin.settings.manage'
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions up2
    JOIN permissions p2 ON p2.id = up2.permission_id
    WHERE up2.user_id = up.user_id AND p2.key = 'admin.jobs.view'
  );

-- Former 011_search_result_accesses.sql
CREATE TABLE IF NOT EXISTS search_result_accesses (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_access_user_entity_time
  ON search_result_accesses (user_id, entity_type, entity_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_access_user_time
  ON search_result_accesses (user_id, accessed_at DESC);

COMMENT ON TABLE search_result_accesses IS 'Per-user opens of search results; used to boost ranking within a sliding window.';

-- Former 012_remove_links_view_all_permission.sql
DELETE FROM permissions WHERE key = 'links.view_all';

-- Former 013_default_group_collections_create.sql
INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Default' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key = 'collections.create'
ON CONFLICT (id) DO NOTHING;

-- Former 014_http_request_logs.sql
CREATE TABLE IF NOT EXISTS http_request_logs (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_string TEXT,
  status_code SMALLINT NOT NULL,
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  client_ip TEXT,
  user_agent TEXT,
  category TEXT NOT NULL,
  outcome TEXT NOT NULL,
  client_class TEXT NOT NULL,
  anomaly_signals JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_occurred_at
  ON http_request_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_category_time
  ON http_request_logs (category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_outcome_time
  ON http_request_logs (outcome, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_request_logs_client_class_time
  ON http_request_logs (client_class, occurred_at DESC);

COMMENT ON TABLE http_request_logs IS 'Classified HTTP access log for security analytics; written async after each response.';

-- Former 015_ensure_employee_module_removed.sql
DELETE FROM group_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view'
);

DELETE FROM user_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view'
);

DELETE FROM permissions
WHERE module = 'employees' OR key LIKE 'employees.%' OR key = 'modules.employees.view';

DO $$
BEGIN
  IF to_regclass('public.department_managers') IS NOT NULL THEN
    DROP TABLE public.department_managers CASCADE;
  END IF;
  IF to_regclass('public.employee_leave_requests') IS NOT NULL THEN
    DROP TABLE public.employee_leave_requests CASCADE;
  END IF;
  IF to_regclass('public.employee_documents') IS NOT NULL THEN
    DROP TABLE public.employee_documents CASCADE;
  END IF;
  IF to_regclass('public.employee_employment_history') IS NOT NULL THEN
    DROP TABLE public.employee_employment_history CASCADE;
  END IF;
  IF to_regclass('public.employee_compensation') IS NOT NULL THEN
    DROP TABLE public.employee_compensation CASCADE;
  END IF;
  IF to_regclass('public.employee_assets') IS NOT NULL THEN
    DROP TABLE public.employee_assets CASCADE;
  END IF;
  IF to_regclass('public.employee_skills') IS NOT NULL THEN
    DROP TABLE public.employee_skills CASCADE;
  END IF;
  IF to_regclass('public.employee_certifications') IS NOT NULL THEN
    DROP TABLE public.employee_certifications CASCADE;
  END IF;
  IF to_regclass('public.employee_performance_reviews') IS NOT NULL THEN
    DROP TABLE public.employee_performance_reviews CASCADE;
  END IF;
  IF to_regclass('public.employee_goals') IS NOT NULL THEN
    DROP TABLE public.employee_goals CASCADE;
  END IF;
  IF to_regclass('public.employee_lifecycle_events') IS NOT NULL THEN
    DROP TABLE public.employee_lifecycle_events CASCADE;
  END IF;
  IF to_regclass('public.departments') IS NOT NULL THEN
    DROP TABLE public.departments CASCADE;
  END IF;
  IF to_regclass('public.employees') IS NOT NULL THEN
    DROP TABLE public.employees CASCADE;
  END IF;
END
$$;

DO $$
DECLARE
  type_name text;
  type_names text[] := ARRAY[
    'LeaveType',
    'LeaveRequestStatus',
    'DocumentStatus',
    'EmploymentStatus',
    'EmploymentType',
    'CompensationPayFrequency',
    'AssetAssignmentStatus',
    'LifecycleEventType',
    'LifecycleEventStatus'
  ];
BEGIN
  FOREACH type_name IN ARRAY type_names
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = type_name
    ) THEN
      EXECUTE format('DROP TYPE public.%I CASCADE', type_name);
    END IF;
  END LOOP;
END
$$;

DELETE FROM modules WHERE key = 'employees';

-- Former 016_employees.sql
DO $$ BEGIN
  CREATE TYPE employee_status_enum AS ENUM (
    'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'PROBATION', 'TERMINATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS employees (
  id                 TEXT PRIMARY KEY,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  title              TEXT,
  employee_status    employee_status_enum NOT NULL DEFAULT 'ACTIVE',
  company_role       TEXT,
  department         TEXT,
  monthly_salary     NUMERIC(12, 2),
  monthly_expenses   NUMERIC(12, 2),
  hours_worked       NUMERIC(10, 2),
  vacation_available INT NOT NULL DEFAULT 0,
  vacation_used      INT NOT NULL DEFAULT 0,
  vacation_planned   INT NOT NULL DEFAULT 0,
  sick_days_total     INT NOT NULL DEFAULT 0,
  sick_days_available INT NOT NULL DEFAULT 0,
  linked_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_email          ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_employee_status ON employees(employee_status);
CREATE INDEX IF NOT EXISTS idx_employees_linked_user_id ON employees(linked_user_id);
CREATE INDEX IF NOT EXISTS idx_employees_last_name      ON employees(last_name);

CREATE TABLE IF NOT EXISTS employee_emails (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_emails_employee_id ON employee_emails(employee_id);

CREATE TABLE IF NOT EXISTS employee_managers (
  id                  TEXT PRIMARY KEY,
  employee_id         TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  manager_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, manager_employee_id),
  CONSTRAINT no_self_manage CHECK (employee_id <> manager_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_managers_employee_id         ON employee_managers(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_managers_manager_employee_id ON employee_managers(manager_employee_id);

-- Former 017_employee_permissions.sql
INSERT INTO modules (id, key, name, description, enabled, config, created_at, updated_at)
VALUES (
  gen_random_uuid()::text,
  'employees',
  'Employees',
  'Employee register and HR management',
  true,
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  enabled     = EXCLUDED.enabled,
  updated_at  = NOW();

INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'employees.view',         'View Employees',         'View the employee register',               'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.create',       'Create Employees',       'Create new employee records',              'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.update',       'Update Employees',       'Edit existing employee records',           'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'employees.delete',       'Delete Employees',       'Delete employee records',                  'employees', 'employees', NOW(), NOW()),
  (gen_random_uuid()::text, 'modules.employees.view', 'View Employees Module',  'Access to the Employees module in the nav', 'modules',   'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'admin-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Admin' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key IN (
  'employees.view',
  'employees.create',
  'employees.update',
  'employees.delete',
  'modules.employees.view'
)
AND EXISTS (SELECT 1 FROM groups WHERE name = 'Admin')
ON CONFLICT (id) DO NOTHING;

-- employees.view_self: lets any authenticated user view their own linked employment record
INSERT INTO permissions (id, key, name, description, category, module, created_at, updated_at)
VALUES
  (gen_random_uuid()::text, 'employees.view_self', 'View Own Employee Profile', 'View own linked employment profile details', 'employees', 'employees', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  module      = EXCLUDED.module,
  updated_at  = NOW();

INSERT INTO group_permissions (id, group_id, permission_id, created_at)
SELECT
  'default-group-' || p.key,
  (SELECT id FROM groups WHERE name = 'Default' LIMIT 1),
  p.id,
  NOW()
FROM permissions p
WHERE p.key = 'employees.view_self'
AND EXISTS (SELECT 1 FROM groups WHERE name = 'Default')
ON CONFLICT (id) DO NOTHING;
