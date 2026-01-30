"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { EditCollectionDialog } from "@/components/features/links/EditCollectionDialog";
import { ShareCollectionDialog } from "@/components/features/links/ShareCollectionDialog";

export function EditCollectionButton({ collection }: { collection: any }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit
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
