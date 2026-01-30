"use client";

import React from "react";
import { CollectionFilterBar } from "./CollectionFilterBar";
import { useLinksPage } from "@/app/(dashboard)/dashboard/links/LinksPageClient";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: {
    links: number;
  };
  owner?: { id: string; name: string | null; email: string };
}

interface CollectionFilterBarWrapperProps {
  collections: Collection[];
  canCreate: boolean;
  currentUserId: string;
}

export function CollectionFilterBarWrapper({ collections, canCreate, currentUserId }: CollectionFilterBarWrapperProps) {
  const { openCreateCollection } = useLinksPage();
  
  return (
    <CollectionFilterBar
      collections={collections}
      canCreate={canCreate}
      currentUserId={currentUserId}
      onCreateCollection={openCreateCollection}
    />
  );
}
