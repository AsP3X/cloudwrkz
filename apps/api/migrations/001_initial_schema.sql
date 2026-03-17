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

-- SQLx migrations table (mark this migration as the baseline)
