import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { isModuleEnabled } from "@/server/actions/modules";
import { MODULE_KEYS } from "@/lib/constants/modules";
import { getTimeEntry } from "@/server/actions/time-tracking";
import { notFound } from "next/navigation";
import { TimeEntryDetailPage } from "@/components/features/time-tracking/TimeEntryDetailPage";

interface TimeEntryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TimeEntryDetailPageRoute({ params }: TimeEntryDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  // Check if time tracking module is enabled
  const timeTrackingEnabled = await isModuleEnabled(MODULE_KEYS.TIMETRACKING);

  if (!timeTrackingEnabled) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Time Tracking Module Disabled
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          The time tracking module is not currently enabled. Please contact an administrator.
        </p>
        <a href={ROUTES.DASHBOARD}>
          <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Back to Dashboard
          </button>
        </a>
      </div>
    );
  }

  const entry = await getTimeEntry(id);

  if (!entry) {
    notFound();
  }

  return <TimeEntryDetailPage initialEntry={entry} userTimezone={user.timezone ?? "UTC"} />;
}

export const dynamic = "force-dynamic";
