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
}

interface CollectionFilterBarWrapperProps {
  collections: Collection[];
  canCreate: boolean;
}

export function CollectionFilterBarWrapper({ collections, canCreate }: CollectionFilterBarWrapperProps) {
  const { openCreateCollection } = useLinksPage();
  
  return (
    <CollectionFilterBar
      collections={collections}
      canCreate={canCreate}
      onCreateCollection={openCreateCollection}
    />
  );
}
