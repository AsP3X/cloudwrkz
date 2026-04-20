import { Button } from "@/components/ui/Button";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";

type CTAProps = {
  className?: string;
};

/**
 * Closing band under `#main-content`. Content is direct children of `section`
 * (only the glow layer is an extra non-semantic wrapper for positioning).
 */
export function CTA({ className }: CTAProps) {
  return (
    <section
      className={cn(
        "relative isolate w-full overflow-hidden border-t border-white/10 bg-gradient-to-b from-neutral-950 via-[#0a0f1a] to-neutral-950 py-24 dark:border-white/10 sm:py-28",
        "flex flex-col items-center px-4 text-center sm:px-6 lg:px-8",
        className,
      )}
      aria-label="Call to action section"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-primary-500/18 blur-3xl" />
        <div className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-secondary-500/14 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <p className="relative z-10 text-xs font-semibold uppercase tracking-[0.2em] text-primary-300/95">Next step</p>
      <h2 className="relative z-10 mt-4 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
        Ready to get started?
      </h2>
      <p className="relative z-10 mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-neutral-300">
        Spin up a trial or talk to us about rollout, security review, and how teams adopt{" "}
        <span className="text-neutral-200">{APP_CONFIG.name}</span> without another shelfware slog.
      </p>
      <div className="relative z-10 mt-10 flex w-full max-w-xl flex-col items-center justify-center gap-4 sm:flex-row sm:max-w-none">
        <Button
          size="lg"
          variant="primary"
          className="min-w-[200px] shadow-lg shadow-primary-900/40"
          asChild
          href={ROUTES.REGISTER}
          aria-label="Start your free trial - no credit card required"
        >
          Start free trial
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="min-w-[200px] border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
          asChild
          href={ROUTES.CONTACT}
          aria-label="Contact our sales team"
        >
          Contact sales
        </Button>
      </div>
      <p className="relative z-10 mt-10 text-sm text-neutral-400" role="note">
        No credit card required · 14-day trial · Cancel anytime
      </p>
    </section>
  );
}
