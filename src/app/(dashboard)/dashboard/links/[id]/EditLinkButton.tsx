"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { EditLinkDialog } from "@/components/features/links/EditLinkDialog";

export function EditLinkButton({ link }: { link: any }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <EditLinkDialog open={open} onOpenChange={setOpen} link={link} />
    </>
  );
}
