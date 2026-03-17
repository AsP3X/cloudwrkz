"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { Input } from "@/components/ui/Input/Input";
import { mergeTicketIntoCurrent, searchTicketsForMerge } from "@/server/actions/tickets";

interface TicketMergeDialogProps {
  ticketId: string;
  ticketNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TicketMergeDialog: React.FC<TicketMergeDialogProps> = ({
  ticketId,
  ticketNumber,
  open,
  onOpenChange,
}) => {
  const router = useRouter();
  const [sourceIdentifier, setSourceIdentifier] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<
    Array<{ id: string; ticketNumber: string; title: string }>
  >([]);

  // Search tickets visible to the current user as they type
  React.useEffect(() => {
    let active = true;
    const term = sourceIdentifier.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const handle = setTimeout(async () => {
      try {
        const result = await searchTicketsForMerge(term, ticketId);
        if (!active) return;
        if (result.success && result.data) {
          setSuggestions(result.data);
        } else {
          setSuggestions([]);
        }
      } catch {
        if (active) {
          setSuggestions([]);
        }
      } finally {
        if (active) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [sourceIdentifier, ticketId]);

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceIdentifier.trim()) {
      setError("Please enter a ticket ID or ticket number.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await mergeTicketIntoCurrent(ticketId, sourceIdentifier.trim());
      if (!result.success) {
        setError(result.error || "Failed to merge tickets. Please try again.");
        setIsSubmitting(false);
        return;
      }

      onOpenChange(false);
      setSourceIdentifier("");
      router.refresh();
    } catch (err) {
      console.error("Ticket merge error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setError(null);
        }
      }}
      title="Merge Ticket"
      description={`Merge another ticket into ${ticketNumber}. This will move all comments, activity, and timers from the other ticket into this one.`}
    >
      <form onSubmit={handleMerge}>
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 px-3 py-2 text-sm text-error-800 dark:text-error-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="ticket-merge-source" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Ticket ID or Ticket Number
            </label>
            <Input
              id="ticket-merge-source"
              value={sourceIdentifier}
              onChange={(e) => setSourceIdentifier(e.target.value)}
              placeholder="#BUG-000123 or ticket UUID"
            />
            {isSearching && (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">Searching tickets…</p>
            )}
            {suggestions.length > 0 && (
              <div className="mt-2 border border-neutral-200 dark:border-neutral-700 rounded-md max-h-60 overflow-y-auto bg-white dark:bg-neutral-900 shadow-sm">
                {suggestions.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    onClick={() => setSourceIdentifier(ticket.ticketNumber)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-primary-600 dark:text-primary-400">
                        {ticket.ticketNumber}
                      </span>
                      <span className="flex-1 text-xs text-neutral-700 dark:text-neutral-300 truncate">
                        {ticket.title}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              The selected ticket will be merged into {ticketNumber}. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              {isSubmitting ? "Merging..." : "Merge"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
};

