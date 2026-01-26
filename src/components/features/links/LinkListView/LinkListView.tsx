"use client";

import React from "react";
import { LinkList } from "../LinkList";
import { useLinkView } from "../LinkViewContext";

type LinkItem = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  favicon: string | null;
  linkType: string;
  tags: string[];
  notes: string | null;
  isFavorite: boolean;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
  collections: Array<{
    collection: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

interface LinkListViewProps {
  links: LinkItem[];
}

export const LinkListView = ({ links }: LinkListViewProps) => {
  const { viewMode, isReady } = useLinkView();

  if (!isReady) {
    return null;
  }

  return (
    <div>
      <LinkList links={links} viewMode={viewMode} />
    </div>
  );
};
