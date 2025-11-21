"use client";

// Import AdminSidebar directly - it's already a client component
// Using dynamic import was causing caching issues when modules changed
import { AdminSidebar } from "./AdminSidebar";

export const AdminSidebarWrapper = AdminSidebar;
