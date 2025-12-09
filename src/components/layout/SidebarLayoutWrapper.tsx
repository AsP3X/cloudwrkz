"use client";

import { SidebarProvider } from "./SidebarContext";

interface SidebarLayoutWrapperProps {
  children: React.ReactNode;
}

export const SidebarLayoutWrapper = ({ children }: SidebarLayoutWrapperProps) => {
  return <SidebarProvider>{children}</SidebarProvider>;
};
