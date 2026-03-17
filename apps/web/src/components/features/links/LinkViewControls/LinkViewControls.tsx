"use client";

import React from "react";
import { LinkViewToggle } from "../LinkViewToggle";
import { useLinkView } from "../LinkViewContext";

export const LinkViewControls = () => {
  const { viewMode, setViewMode } = useLinkView();

  return (
    <div>
      <LinkViewToggle currentView={viewMode} onViewChange={setViewMode} />
    </div>
  );
};
