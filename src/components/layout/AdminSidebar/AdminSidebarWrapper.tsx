"use client";

import dynamic from "next/dynamic";

// Dynamically import AdminSidebar with SSR disabled to prevent hydration mismatches
export const AdminSidebarWrapper = dynamic(
  () => import("./AdminSidebar").then((mod) => ({ default: mod.AdminSidebar })),
  {
    ssr: false,
  }
);
