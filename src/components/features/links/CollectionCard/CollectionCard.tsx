"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface CollectionCardProps {
  collection: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    _count: {
      links: number;
    };
  };
}

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Link
      href={`/dashboard/links/collections/${collection.id}`}
      className="block bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          className="font-semibold text-base text-neutral-900 dark:text-neutral-100"
          style={collection.color ? { color: collection.color } : undefined}
        >
          {collection.name}
        </h3>
        <Badge className="text-xs">
          {collection._count.links} {collection._count.links === 1 ? "link" : "links"}
        </Badge>
      </div>
      {collection.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-2">
          {collection.description}
        </p>
      )}
    </Link>
  );
}
