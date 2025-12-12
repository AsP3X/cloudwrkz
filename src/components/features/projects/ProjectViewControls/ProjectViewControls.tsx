"use client";

import React from "react";
import { useProjectView } from "../ProjectViewContext";
import { ProjectViewToggle } from "../ProjectViewToggle";

export const ProjectViewControls = () => {
  const { viewMode, setViewMode, isReady } = useProjectView();

  // Show toggle even if not ready - it will use the default "grid" view
  // The viewMode will update once ready, but the toggle should be visible
  return (
    <ProjectViewToggle currentView={viewMode} onViewChange={setViewMode} />
  );
};
