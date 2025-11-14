import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { TicketForm } from "@/components/features/tickets/TicketForm";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default async function NewTicketPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "USER") {
    redirect(ROUTES.LOGIN);
  }

  // Check if tickets module is enabled
  const ticketsEnabled = await isModuleEnabled(MODULE_KEYS.TICKETS);

  if (!ticketsEnabled) {
    return (
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Tickets Module Disabled</h2>
        <p className="text-neutral-600 mb-4">
          The tickets module is not currently enabled. Please contact an administrator.
        </p>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Create New Ticket</h1>
          <p className="text-neutral-600 mt-1">
            Submit a support request, report a bug, or request a new feature
          </p>
        </div>
        <Link href="/dashboard/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
        <TicketForm />
      </div>

      {/* Help Section */}
      <div className="bg-primary-50 rounded-xl border border-primary-200 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary-900 mb-2">Tips for creating effective tickets</h3>
            <ul className="space-y-2 text-sm text-primary-800">
              <li className="flex items-start gap-2">
                <span className="text-primary-600 mt-0.5">•</span>
                <span>Use a clear, descriptive title that summarizes your issue or request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 mt-0.5">•</span>
                <span>Provide detailed information in the description, including steps to reproduce if reporting a bug</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 mt-0.5">•</span>
                <span>Select the appropriate ticket type and priority level to help us prioritize your request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 mt-0.5">•</span>
                <span>Include any relevant screenshots, error messages, or additional context that might help</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
