"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TicketMergeDialog } from "@/components/features/tickets/TicketMergeDialog/TicketMergeDialog";

interface TicketDetailHeaderActionsProps {
  ticketId: string;
  ticketNumber: string;
  editHref: string;
  canDelete?: boolean;
  onDelete?: (formData: FormData) => void;
}

export const TicketDetailHeaderActions: React.FC<TicketDetailHeaderActionsProps> = ({
  ticketId,
  ticketNumber,
  editHref,
  canDelete,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={editHref}>
        <Button variant="primary" size="sm" className="w-full sm:w-auto">
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit Ticket
        </Button>
      </Link>

      {/* Three-dot menu */}
      <div className="relative" ref={menuRef}>
        <Button
          variant="outline"
          size="sm"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </Button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg">
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => {
                setMergeOpen(true);
                setMenuOpen(false);
              }}
            >
              Merge ticket
            </button>
            {canDelete && onDelete && (
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-900/40"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                Delete ticket
              </button>
            )}
          </div>
        )}
      </div>

      {canDelete && onDelete && (
        <Dialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Ticket"
          description={`Are you sure you want to delete ticket ${ticketNumber}? This action cannot be undone.`}
        >
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-error-100 dark:bg-error-900/30 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-error-600 dark:text-error-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                This will permanently delete the ticket{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {ticketNumber}
                </span>
                . This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </Button>
              <form action={onDelete}>
                <input type="hidden" name="ticketId" value={ticketId} />
                <Button
                  type="submit"
                  variant="danger"
                >
                  Delete Ticket
                </Button>
              </form>
            </div>
          </div>
        </Dialog>
      )}

      <TicketMergeDialog
        ticketId={ticketId}
        ticketNumber={ticketNumber}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
    </div>
  );
};

