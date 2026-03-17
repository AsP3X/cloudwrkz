"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count: {
    links: number;
  };
}

interface CollectionListProps {
  collections: Collection[];
  currentCollectionId?: string;
}

export function CollectionList({ collections, currentCollectionId }: CollectionListProps) {
  if (collections.length === 0) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400 p-4 text-center">
        No collections yet. Create one to organize your links.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={`/dashboard/links?collection=${collection.id}`}
          className={`block p-3 rounded-lg border transition-colors ${
            currentCollectionId === collection.id
              ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
              : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3
                  className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate"
                  style={collection.color ? { color: collection.color } : undefined}
                >
                  {collection.name}
                </h3>
                <Badge className="text-xs">
                  {collection._count.links} {collection._count.links === 1 ? "link" : "links"}
                </Badge>
              </div>
              {collection.description && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-1">
                  {collection.description}
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
