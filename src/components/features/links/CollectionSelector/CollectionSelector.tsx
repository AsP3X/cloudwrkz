"use client";

import React from "react";

interface Collection {
  id: string;
  name: string;
  color: string | null;
}

interface CollectionSelectorProps {
  collections: Collection[];
  selectedCollectionIds: string[];
  onSelectionChange: (collectionIds: string[]) => void;
  className?: string;
}

export function CollectionSelector({
  collections,
  selectedCollectionIds,
  onSelectionChange,
  className,
}: CollectionSelectorProps) {
  const handleToggle = (collectionId: string) => {
    if (selectedCollectionIds.includes(collectionId)) {
      onSelectionChange(selectedCollectionIds.filter((id) => id !== collectionId));
    } else {
      onSelectionChange([...selectedCollectionIds, collectionId]);
    }
  };

  if (collections.length === 0) {
    return (
      <div className={`text-sm text-neutral-500 dark:text-neutral-400 ${className}`}>
        No collections available. Create a collection first.
      </div>
    );
  }

  return (
    <div className={`space-y-2 max-h-48 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-md p-2 ${className}`}>
      {collections.map((collection) => (
        <label key={collection.id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 p-1 rounded">
          <input
            type="checkbox"
            checked={selectedCollectionIds.includes(collection.id)}
            onChange={() => handleToggle(collection.id)}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span
            className="text-sm text-neutral-700 dark:text-neutral-300"
            style={collection.color ? { color: collection.color } : undefined}
          >
            {collection.name}
          </span>
        </label>
      ))}
    </div>
  );
}
