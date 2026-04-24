import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

// Human: Profile checklist as inline card or a fixed floating panel that can be collapsed/dismissed without consuming layout width.
// Agent: variant inline = section; variant floating = portal + localStorage state.

const WIDGET_STATE_KEY = "cloudwrkz:profile-completeness-widget";

export type ProfileCompletenessVariant = "inline" | "floating";

interface ProfileCompletenessProps {
  hasAvatar: boolean;
  hasBio: boolean;
  emailVerified: boolean;
  hasCustomTimezone: boolean;
  hasName: boolean;
  className?: string;
  /** `floating`: fixed bottom-right, hideable, does not take space in the page grid. */
  variant?: ProfileCompletenessVariant;
}

interface CompletenessItem {
  label: string;
  done: boolean;
  href: string;
  hint: string;
}

type WidgetState = "expanded" | "collapsed" | "dismissed";

function readWidgetState(): WidgetState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(WIDGET_STATE_KEY);
  if (raw === "expanded" || raw === "collapsed" || raw === "dismissed") return raw;
  return null;
}

function useProfileCompletenessModel(props: Pick<
  ProfileCompletenessProps,
  "hasAvatar" | "hasBio" | "emailVerified" | "hasCustomTimezone" | "hasName"
>) {
  const { hasAvatar, hasBio, emailVerified, hasCustomTimezone, hasName } = props;

  const items: CompletenessItem[] = [
    {
      label: "Add your name",
      done: hasName,
      href: "/dashboard/profile",
      hint: "Let others know who you are",
    },
    {
      label: "Upload an avatar",
      done: hasAvatar,
      href: "/dashboard/profile",
      hint: "Add a photo to personalize your account",
    },
    {
      label: "Verify your email",
      done: emailVerified,
      href: "/dashboard/profile",
      hint: "Confirm your email address",
    },
    {
      label: "Write a short bio",
      done: hasBio,
      href: "/dashboard/profile",
      hint: "Tell others a little about yourself",
    },
    {
      label: "Set your timezone",
      done: hasCustomTimezone,
      href: "/dashboard/settings",
      hint: "Ensure times display correctly for your location",
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return { items, completedCount, total, percent, isComplete: completedCount === total };
}

// Human: Checklist list + progress — shared by inline section and floating shell.
// Agent: RENDER items; progressbar a11y.

function ProfileCompletenessList({
  items,
  completedCount,
  total,
  percent,
  headerRight,
  className,
  listClassName,
}: {
  items: CompletenessItem[];
  completedCount: number;
  total: number;
  percent: number;
  headerRight?: ReactNode;
  className?: string;
  listClassName?: string;
}) {
  return (
    <>
      <div className={cn("p-4 sm:p-5 border-b border-neutral-200/60 dark:border-neutral-800/60", className)}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Complete your profile</h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {completedCount}/{total}
            </span>
            {headerRight}
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-500 dark:bg-primary-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Profile ${percent}% complete`}
          />
        </div>
      </div>
      <ul className={cn("divide-y divide-neutral-100 dark:divide-neutral-800/60", listClassName)}>
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 opacity-50">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-success-100 dark:bg-success-900/40 flex items-center justify-center">
                  <svg className="w-3 h-3 text-success-600 dark:text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-sm font-medium text-neutral-500 dark:text-neutral-500 line-through">
                  {item.label}
                </span>
              </div>
            ) : (
              <Link
                to={item.href}
                className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors group"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600 group-hover:border-primary-400 dark:group-hover:border-primary-500 transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {item.label}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{item.hint}</p>
                </div>
                <svg
                  className="w-4 h-4 text-neutral-400 dark:text-neutral-600 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// Human: Fixed bottom-right profile checklist: expanded card, collapsed pill, or dismissed with restore control.
// Agent: READS/WRITES localStorage; RENDERS portal; z-index below app dialogs (z-50).

function ProfileCompletenessFloating(
  model: ReturnType<typeof useProfileCompletenessModel>,
) {
  const { items, completedCount, total, percent } = model;
  const [mounted, setMounted] = useState(false);
  const [widget, setWidget] = useState<WidgetState>("expanded");

  const persist = useCallback((s: WidgetState) => {
    setWidget(s);
    if (typeof window !== "undefined") localStorage.setItem(WIDGET_STATE_KEY, s);
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = readWidgetState();
    if (stored) setWidget(stored);
  }, []);

  if (!mounted) return null;

  const baseShell =
    "rounded-2xl border border-neutral-300 dark:border-neutral-600 ring-1 ring-neutral-900/[0.06] dark:ring-white/[0.08] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm shadow-lg overflow-hidden";

  if (widget === "dismissed") {
    return createPortal(
      <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => persist("expanded")}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md text-primary-600 dark:text-primary-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          title="Show profile checklist"
          aria-label="Show profile checklist"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </button>
      </div>,
      document.body,
    );
  }

  if (widget === "collapsed") {
    return createPortal(
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[min(100vw-2rem,20rem)] items-center gap-2 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => persist("expanded")}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-neutral-300",
            "dark:border-neutral-600 ring-1 ring-neutral-900/[0.06] dark:ring-white/[0.08] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm px-4 py-3 shadow-lg text-left",
            "text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800/80",
          )}
        >
          <span className="truncate">Complete your profile</span>
          <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
            {completedCount}/{total}
          </span>
        </button>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => persist("dismissed")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            title="Hide checklist"
            aria-label="Hide checklist"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-40 w-full max-w-sm max-h-[min(28rem,70vh)] flex flex-col sm:bottom-6 sm:right-6"
      role="complementary"
      aria-label="Profile completeness checklist"
    >
      <div className={cn(baseShell, "flex flex-col min-h-0 max-h-full")}>
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          <ProfileCompletenessList
            items={items}
            completedCount={completedCount}
            total={total}
            percent={percent}
            className="shrink-0"
            listClassName="max-h-[min(20rem,50vh)] overflow-y-auto overflow-x-hidden scrollbar-thin"
            headerRight={
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => persist("collapsed")}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60"
                  title="Minimize"
                  aria-label="Minimize checklist"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => persist("dismissed")}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60"
                  title="Hide"
                  aria-label="Hide checklist"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProfileCompleteness({
  hasAvatar,
  hasBio,
  emailVerified,
  hasCustomTimezone,
  hasName,
  className,
  variant = "inline",
}: ProfileCompletenessProps) {
  const model = useProfileCompletenessModel({
    hasAvatar,
    hasBio,
    emailVerified,
    hasCustomTimezone,
    hasName,
  });

  if (model.isComplete) return null;

  if (variant === "floating") {
    return <ProfileCompletenessFloating {...model} />;
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm shadow-sm overflow-hidden",
        className,
      )}
    >
      <ProfileCompletenessList
        items={model.items}
        completedCount={model.completedCount}
        total={model.total}
        percent={model.percent}
      />
    </section>
  );
}
