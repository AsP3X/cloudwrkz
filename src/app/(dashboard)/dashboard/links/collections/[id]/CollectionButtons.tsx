"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { EditCollectionDialog } from "@/components/features/links/EditCollectionDialog";
import { ShareCollectionDialog } from "@/components/features/links/ShareCollectionDialog";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function RemoveShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function EditCollectionButton({
  collection,
  isOwner = true,
}: {
  collection: { id: string; name: string; description?: string | null; color?: string | null };
  isOwner?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label={isOwner ? "Edit collection" : "Remove share"}>
        {isOwner ? (
          <>
            <PencilIcon className="w-4 h-4 mr-2" />
            Edit
          </>
        ) : (
          <>
            <RemoveShareIcon className="w-4 h-4 mr-2" />
            Remove share
          </>
        )}
      </Button>
      <EditCollectionDialog
        open={open}
        onOpenChange={setOpen}
        collection={{
          id: collection.id,
          name: collection.name,
          description: collection.description,
          color: collection.color,
        }}
        isOwner={isOwner}
      />
    </>
  );
}

export function ShareCollectionButton({ collection }: { collection: any }) {
  const [open, setOpen] = React.useState(false);
  const owner = collection?.owner ?? { id: "", name: null, email: "" };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Share
      </Button>
      <ShareCollectionDialog
        open={open}
        onOpenChange={setOpen}
        collectionId={collection.id}
        members={collection.members || []}
        owner={owner}
      />
    </>
  );
}

