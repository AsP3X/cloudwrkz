"use client";

import React from "react";
import { LinkViewToggle } from "../LinkViewToggle";
import { useLinkView } from "../LinkViewContext";

export const LinkViewControls = () => {
  const { viewMode, setViewMode, isReady } = useLinkView();

  if (!isReady) {
    return null;
  }

  return (
    <div suppressHydrationWarning>
      <LinkViewToggle currentView={viewMode} onViewChange={setViewMode} />
    </div>
  );
};
