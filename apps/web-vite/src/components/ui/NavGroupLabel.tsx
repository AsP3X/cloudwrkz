// Human: Visual-only sidebar subsection title so grouped nav links stay scannable without pretending to be an interactive control.
// Agent: RENDERS div role=presentation; READS children string and className; NO events.
import { cn } from "@/lib/utils/cn";

interface NavGroupLabelProps {
  children: string;
  className?: string;
}

/** Non-interactive subheading for grouped links inside a sidebar section. */
export function NavGroupLabel({ children, className }: NavGroupLabelProps) {
  return (
    <div
      className={cn(
        "px-4 pt-2.5 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-500",
        className
      )}
      role="presentation"
    >
      {children}
    </div>
  );
}
