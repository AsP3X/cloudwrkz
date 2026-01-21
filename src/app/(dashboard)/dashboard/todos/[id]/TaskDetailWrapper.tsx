"use client";

import * as React from "react";
import { SidebarContext } from "./TaskDetailLayout";

interface TaskDetailWrapperProps {
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}

export const TaskDetailWrapper = ({
  defaultSidebarOpen = true,
  children,
}: TaskDetailWrapperProps) => {
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultSidebarOpen);
  
  // Update state when defaultSidebarOpen prop changes
  React.useEffect(() => {
    setSidebarOpen(defaultSidebarOpen);
  }, [defaultSidebarOpen]);
  
  return (
    <SidebarContext.Provider value={{ isOpen: sidebarOpen, setIsOpen: setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
};
