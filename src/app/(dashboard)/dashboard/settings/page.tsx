import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { getCurrentUserProfile } from "@/server/actions/users";
import { AccountSettingsForm } from "@/components/features/settings/AccountSettingsForm";
import { PreferencesForm } from "@/components/features/settings/PreferencesForm";
import { PrivacySecurityForm } from "@/components/features/settings/PrivacySecurityForm";
import { DeleteAccountSection } from "@/components/features/settings/DeleteAccountSection";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.LOGIN);
  }

  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect(ROUTES.DASHBOARD);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-primary-600 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Settings</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              Manage your account settings and preferences
            </p>
          </div>
        </div>
      </div>

      {/* Account Settings Section */}
      <CollapsibleSection
        title="Account Settings"
        description="Update your email address and change your password"
        icon={
          <svg
            className="w-5 h-5 text-primary-600 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        }
        defaultExpanded={true}
      >
        <AccountSettingsForm
          currentEmail={profile.email}
          emailVerified={profile.emailVerified}
        />
      </CollapsibleSection>

      {/* Preferences Section */}
      <CollapsibleSection
        title="Preferences"
        description="Customize your application preferences and notification settings"
        icon={
          <svg
            className="w-5 h-5 text-primary-600 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        }
        defaultExpanded={true}
      >
        <PreferencesForm />
      </CollapsibleSection>

      {/* Privacy & Security Section */}
      <CollapsibleSection
        title="Privacy & Security"
        description="Manage your privacy settings and security options"
        icon={
          <svg
            className="w-5 h-5 text-primary-600 dark:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        }
        defaultExpanded={true}
      >
        <PrivacySecurityForm />
      </CollapsibleSection>

      {/* Delete Account Section */}
      <DeleteAccountSection />
    </div>
  );
}

