"use client";

import * as React from "react";
import { SidebarContext } from "./LinkDetailLayout";

interface LinkDetailWrapperProps {
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}

export const LinkDetailWrapper = ({
  defaultSidebarOpen = true,
  children,
}: LinkDetailWrapperProps) => {
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
