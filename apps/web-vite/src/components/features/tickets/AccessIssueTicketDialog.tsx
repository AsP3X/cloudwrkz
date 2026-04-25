import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";
import { buildAccessIssueDescription } from "@/lib/access-issues";

// Human: React UI for `AccessIssueTicketDialog` in support tickets and related tooling: composes shared UI primitives, wires local state, and coordinates user actions for this screen section.
// Agent: SCOPE tickets; COMMENTS bulk filters timers; EXPORTS AccessIssueTicketDialog; REACT component; READS props hooks; MAY CALL api client.
export interface AccessIssueTicketDialogProps {
  primaryLabel: string;
  /** Hidden form fields (e.g. context, entityId) for the access-issue ticket */
  hiddenFields?: Record<string, string>;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function AccessIssueTicketDialog({
  primaryLabel,
  hiddenFields,
  dialogTitle = "Tell us more about this access issue",
  dialogDescription = "Please describe why you believe you should have access here or what you were trying to do. This information will be included in the support ticket.",
}: AccessIssueTicketDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.email) return;
    const form = e.currentTarget;
    const context = (hiddenFields?.context ?? "").trim();
    const entityId = hiddenFields?.entityId?.trim();
    const reason = (form.querySelector('[name="reason"]') as HTMLTextAreaElement)?.value?.trim() ?? "";
    if (!context) return;

    const payload = buildAccessIssueDescription(context, user.email, reason, entityId);
    if (!payload) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string; ticket_number: string }>("/tickets", {
        title: payload.title,
        description: payload.description,
        description_plain: payload.description,
        type: "SUPPORT",
        priority: "MEDIUM",
      });
      setOpen(false);
      navigate(`${ROUTES.DASHBOARD}/tickets/${res.id}`);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to create ticket. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

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
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-5">
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
          {error && (
            <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
