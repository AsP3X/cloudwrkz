// Human: Holds mobile drawer open state and a compact-toolbar flag derived from window scroll so dashboard chrome can shrink consistently.
// Agent: CONTEXT isMobileOpen, setIsMobileOpen, toolbarCompact; LISTENS window scroll passive; THROWS if useSidebar outside provider.
import React from "react";

/** Same threshold as dashboard chrome (header + sidebar rails). */
export const DASHBOARD_TOOLBAR_COMPACT_SCROLL_PX = 24;

interface SidebarContextType {
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  /** True while scrolled down: header + sidebar top rails use compact (~75%) height. */
  toolbarCompact: boolean;
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

interface SidebarProviderProps {
  children: React.ReactNode;
}

export const SidebarProvider = ({ children }: SidebarProviderProps) => {
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [toolbarCompact, setToolbarCompact] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      setToolbarCompact(window.scrollY > DASHBOARD_TOOLBAR_COMPACT_SCROLL_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <SidebarContext.Provider value={{ isMobileOpen, setIsMobileOpen, toolbarCompact }}>
      {children}
    </SidebarContext.Provider>
  );
};
