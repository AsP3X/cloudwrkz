// Human: Stacks the animated network canvas, a frosted scrim, and page content so marketing or auth pages share one atmospheric background treatment.
// Agent: READS variant; RENDERS OrganicNetworkCanvas + absolute veil + relative content; VARIANT maps to veil opacity classes.
import { OrganicNetworkCanvas } from "@/components/ui/OrganicNetworkCanvas";
import { cn } from "@/lib/utils/cn";

type MouseSpotlightSurfaceProps = {
  children: React.ReactNode;
  /** Merged onto the outer surface (background, padding, min-height, etc.). */
  className?: string;
  /**
   * `content` — slightly calmer graph + lighter veil (forms, auth).
   * `default` — richer graph (generic marketing).
   * `about` — long-scroll About: deeper veil so typography stays readable on the dark field.
   */
  variant?: "default" | "content" | "about";
};

/**
 * Organic dark network canvas (soft-drawn graph) + frosted veil (backdrop blur) over content.
 */
export function MouseSpotlightSurface({ children, className, variant = "default" }: MouseSpotlightSurfaceProps) {
  const isContent = variant === "content";
  const isAbout = variant === "about";

  return (
    <div className={cn("relative isolate min-h-0", className)}>
      <OrganicNetworkCanvas variant={isContent ? "content" : "default"} />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-[2]",
          isContent
            ? "bg-neutral-950/14 backdrop-blur-lg backdrop-saturate-125 dark:bg-neutral-950/34 dark:backdrop-blur-xl"
            : isAbout
              ? "bg-neutral-100/38 backdrop-blur-xl backdrop-saturate-125 dark:bg-neutral-950/48 dark:backdrop-blur-xl"
              : "bg-white/6 backdrop-blur-lg backdrop-saturate-125 dark:bg-neutral-950/28 dark:backdrop-blur-xl",
        )}
        aria-hidden
      />
      <div className="relative z-10 flex min-h-0 w-full min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
