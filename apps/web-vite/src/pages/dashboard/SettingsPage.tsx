import { CollapsibleSection } from "@/components/ui/CollapsibleSection";

const IconUser = () => (
  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconCog = () => (
  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconShield = () => (
  <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">Settings</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Manage your account and preferences
        </p>
      </div>

      <CollapsibleSection
        title="Account"
        description="Update your account information"
        icon={<IconUser />}
        defaultExpanded
      >
        <p className="text-neutral-600 dark:text-neutral-400">
          Account settings will be implemented with the Rust API migration.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Preferences"
        description="Customize your experience"
        icon={<IconCog />}
      >
        <p className="text-neutral-600 dark:text-neutral-400">
          Preference settings will be implemented with the Rust API migration.
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Privacy"
        description="Manage your privacy and data"
        icon={<IconShield />}
      >
        <p className="text-neutral-600 dark:text-neutral-400">
          Privacy settings will be implemented with the Rust API migration.
        </p>
      </CollapsibleSection>
    </div>
  );
}
