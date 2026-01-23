"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: {
    links: number;
  };
}

interface CollectionFilterBarProps {
  collections: Collection[];
  canCreate: boolean;
  onCreateCollection?: () => void;
}

export function CollectionFilterBar({ collections, canCreate, onCreateCollection }: CollectionFilterBarProps) {
  const searchParams = useSearchParams();
  const currentCollectionId = searchParams.get("collection") || undefined;

  // Build URL without collection param (for "All" link)
  const getAllLinksUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("collection");
    const query = params.toString();
    return query ? `/dashboard/links?${query}` : "/dashboard/links";
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* All Links */}
      <Link
        href={getAllLinksUrl()}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          !currentCollectionId
            ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }`}
      >
        All Links
      </Link>

      {/* Collections */}
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={`/dashboard/links?collection=${collection.id}`}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            currentCollectionId === collection.id
              ? "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-300 dark:border-primary-700"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          }`}
          style={
            currentCollectionId === collection.id && collection.color
              ? {
                  backgroundColor: `${collection.color}20`,
                  borderColor: collection.color,
                  color: collection.color,
                }
              : undefined
          }
        >
          <span>{collection.name}</span>
          <Badge className="text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
            {collection._count.links}
          </Badge>
        </Link>
      ))}

      {/* Create Collection Button */}
      {canCreate && onCreateCollection && (
        <Button
          variant="outline"
          onClick={onCreateCollection}
          className="text-xs h-7 px-2"
        >
          + New Collection
        </Button>
      )}
    </div>
  );
}
