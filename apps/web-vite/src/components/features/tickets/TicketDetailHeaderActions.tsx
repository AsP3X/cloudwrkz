import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";

export interface TicketDetailHeaderActionsProps {
  ticketId: string;
  ticketNumber: string;
  editHref: string;
  canDelete?: boolean;
}

export function TicketDetailHeaderActions({
  ticketId,
  ticketNumber,
  editHref,
  canDelete,
}: TicketDetailHeaderActionsProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/tickets/${ticketId}`);
      setDeleteOpen(false);
      navigate(`${ROUTES.DASHBOARD}/tickets`);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to={editHref}>
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
            {canDelete && (
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

      {canDelete && (
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
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center">
              This will permanently delete the ticket{" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {ticketNumber}
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete Ticket"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
