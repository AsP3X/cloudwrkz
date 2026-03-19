"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TimeEntryEditForm } from "../TimeEntryEditForm";
import { updateTimeEntry } from "@/server/actions/time-tracking";
import { useRouter } from "next/navigation";
import { type TimeEntryStatus } from "@/generated/prisma";

type TimeEntry = {
  id: string;
  name: string;
  description: string | null;
  status: TimeEntryStatus;
  tags: string[];
  billable: boolean;
  location: string | null;
  timezone: string | null;
  startedAt: Date;
  stoppedAt: Date | null;
  ticket: {
    id: string;
    ticketNumber: string;
    title: string;
  } | null;
  breaks?: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    duration: number;
    description: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
};

interface EditTimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry;
  userTimezone?: string;
}

export function EditTimeEntryDialog({ open, onOpenChange, entry, userTimezone = "UTC" }: EditTimeEntryDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSave = async (data: any) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await updateTimeEntry(entry.id, data);
      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error || "Failed to update time entry");
      }
    } catch (error: any) {
      setError(error.message || "Failed to update time entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Time Entry"
      description="Update the time entry details"
    >
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          </div>
        )}
        <TimeEntryEditForm
          entry={entry}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          userTimezone={userTimezone}
          entryTimezone={entry.timezone}
          breaks={entry.breaks}
        />
      </div>
    </Dialog>
  );
}
