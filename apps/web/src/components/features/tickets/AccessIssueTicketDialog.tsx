"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea/Textarea";

interface AccessIssueTicketDialogProps {
  primaryLabel: string;
  action: (formData: FormData) => Promise<void>;
  /** Hidden form fields (e.g. context, entityId) for the stable createAccessIssueTicket action */
  hiddenFields?: Record<string, string>;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function AccessIssueTicketDialog({
  primaryLabel,
  action,
  hiddenFields,
  dialogTitle = "Tell us more about this access issue",
  dialogDescription = "Please describe why you believe you should have access here or what you were trying to do. This information will be included in the support ticket.",
}: AccessIssueTicketDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="primary" type="button" onClick={() => setOpen(true)}>
        {primaryLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={dialogTitle}
        description={dialogDescription}
      >
        <form action={action} className="px-4 sm:px-6 py-5 space-y-5">
          {hiddenFields &&
            Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          <Textarea
            name="reason"
            label="Why are you requesting access?"
            placeholder="For example: I need to see these tickets to handle customer support for my team, but I currently cannot access them."
            rows={4}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit request
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

