// Human: Rich marketing “about” experience with animated storytelling tabs, team carousel, and scroll-revealed sections.
// Agent: USES ScrollAnimation usePrefersReducedMotion; MANAGES tab keyboard focus; STATIC STORY_TABS content; NO API writes.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ScrollAnimation } from "@/features/landing/ScrollAnimation";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils/cn";

type TeamMember = {
  name: string;
  role: string;
  bio: string;
  initials: string;
};

const STORY_TABS = [
  {
    id: "platform",
    label: "What we do",
    short: "Unified operations",
    headline: "One place for how your organization actually works.",
    body:
      "We bring tickets, tasks, time tracking, and curated link intelligence into a single, coherent workspace—so people spend less time switching tools and more time delivering outcomes.",
    bullets: [
      "Structured work: triage, assign, and follow issues from intake to resolution.",
      "Execution: todos and time entries tied to real context—not orphaned spreadsheets.",
      "Knowledge: collections and metadata that keep links useful, not noisy.",
    ],
  },
  {
    id: "problem",
    label: "Problem we solve",
    short: "Fragmentation & blind spots",
    headline: "When work is scattered, teams slow down—and risk creeps in.",
    body:
      "Spreadsheets, side channels, and ad-hoc apps hide dependencies. Access becomes tribal knowledge. Leaders lack a trustworthy picture of load, progress, and accountability.",
    bullets: [
      "Fragmented workflows create duplicate effort and missed handoffs.",
      "Opaque permissions make audits painful and mistakes expensive.",
      "Without a durable system of record, reporting becomes a manual reconstruction project.",
    ],
  },
  {
    id: "why",
    label: "Why choose us",
    short: "Built for serious teams",
    headline: "Enterprise discipline with product speed.",
    body:
      "We combine a fast, modern UI with an API-first backend, clear admin boundaries, and observability-minded patterns—so you can adopt quickly without outgrowing the platform.",
    bullets: [
      "Role-aware experiences: operators stay focused; admins get the controls they need.",
      "Consistent API contracts and structured errors—integrations stay maintainable.",
      "Designed for real-world outages: resilient flows instead of fragile happy-path demos.",
    ],
  },
] as const;

const METRICS = [
  { label: "Operational clarity", value: 94, suffix: "%", caption: "Teams report faster alignment when work lives in one system of record." },
  { label: "Admin confidence", value: 88, suffix: "%", caption: "Clearer permission boundaries reduce “who can do what?” back-and-forth." },
  { label: "Integration readiness", value: 92, suffix: "%", caption: "API-first design keeps partners and internal tools from fighting the UI." },
] as const;

const BENTO = [
  {
    title: "Tickets & service",
    text: "Intake, prioritize, and resolve with context that does not evaporate between channels.",
    span: "md:col-span-2",
  },
  {
    title: "Time & accountability",
    text: "Capture effort where it happens—linked to the work it supports.",
    span: "md:col-span-1",
  },
  {
    title: "Links as assets",
    text: "Collections, metadata, and refresh jobs keep repositories trustworthy over time.",
    span: "md:col-span-1",
  },
  {
    title: "Governance",
    text: "Groups, modules, permissions, and audit-friendly patterns for growing orgs.",
    span: "md:col-span-2",
  },
] as const;

const PRINCIPLES = [
  { title: "Security-minded", detail: "Safe defaults, careful auth flows, and disciplined error surfaces." },
  { title: "Reliability", detail: "Background jobs and retries where the real world is messy." },
  { title: "Clarity", detail: "UI that reduces cognitive load—especially under incident pressure." },
  { title: "Velocity", detail: "Ship workflows quickly without sacrificing structure or auditability." },
] as const;

function AboutHeroSpotlight({ productName }: { productName: string }) {
  return (
    <section
      className="pb-20 pt-28 sm:pb-28 sm:pt-36"
      aria-labelledby="about-hero-heading"
    >
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-300/50 bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-900 shadow-sm backdrop-blur-sm dark:border-primary-400/30 dark:bg-neutral-950/50 dark:text-primary-200">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          Modern enterprise workspace
        </p>
        <h1
          id="about-hero-heading"
          className="text-4xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-5xl lg:text-6xl"
        >
          Operate with precision at scale—
          <span className="mt-1 block bg-gradient-to-r from-primary-600 via-primary-500 to-secondary-600 bg-clip-text text-transparent dark:from-primary-300 dark:via-primary-200 dark:to-secondary-300">
            without the enterprise drag.
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
          {productName} is how teams run tickets, execution, time, and curated knowledge in one coherent system—with
          permissions, observability, and APIs that stay honest as you grow.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            to={ROUTES.REGISTER}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:bg-primary-500 dark:hover:bg-primary-400"
          >
            Start a free trial
          </Link>
          <Link
            to={ROUTES.CONTACT}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-neutral-300/90 bg-white/85 px-6 text-sm font-semibold text-neutral-900 shadow-sm backdrop-blur-sm transition hover:border-primary-400 hover:text-primary-800 dark:border-white/20 dark:bg-neutral-950/45 dark:text-neutral-100 dark:hover:border-primary-400/60 dark:hover:text-primary-200"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}

function StoryTabs() {
  const [active, setActive] = useState<(typeof STORY_TABS)[number]["id"]>(STORY_TABS[0].id);
  const tablistId = useId();
  const panelId = `${tablistId}-panel`;

  const current = useMemo(() => STORY_TABS.find((t) => t.id === active) ?? STORY_TABS[0], [active]);

  return (
    <section className="py-20 sm:py-24" aria-labelledby="story-section-title">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="fade" delay={0}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="story-section-title" className="text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-4xl">
              The story in three lenses
            </h2>
            <p className="mt-3 text-neutral-700 dark:text-neutral-300">
              Explore how we think about the product—without leaving this page.
            </p>
          </div>
        </ScrollAnimation>

        <div className="mt-12 rounded-2xl border border-white/25 bg-white/80 p-2 shadow-soft-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/50 sm:p-3">
          <div
            role="tablist"
            aria-label="About story"
            className="flex flex-col gap-2 sm:flex-row sm:rounded-xl sm:bg-neutral-100/70 sm:p-1 dark:sm:bg-neutral-900/55"
          >
            {STORY_TABS.map((tab) => {
              const selected = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  id={`${tablistId}-tab-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const i = STORY_TABS.findIndex((t) => t.id === active);
                    const next =
                      e.key === "ArrowRight"
                        ? STORY_TABS[(i + 1) % STORY_TABS.length]
                        : STORY_TABS[(i - 1 + STORY_TABS.length) % STORY_TABS.length];
                    setActive(next.id);
                    queueMicrotask(() => {
                      document.getElementById(`${tablistId}-tab-${next.id}`)?.focus();
                    });
                  }}
                  className={cn(
                    "flex flex-1 flex-col rounded-xl px-4 py-3 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:py-3.5",
                    selected
                      ? "bg-white text-neutral-950 shadow-sm ring-1 ring-neutral-200/90 dark:bg-neutral-950 dark:text-neutral-50 dark:ring-white/10"
                      : "text-neutral-600 hover:bg-white/70 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-900/70 dark:hover:text-neutral-100",
                  )}
                >
                  <span className="font-semibold">{tab.label}</span>
                  <span className="mt-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-500">{tab.short}</span>
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={panelId}
            aria-labelledby={`${tablistId}-tab-${current.id}`}
            className="mt-6 rounded-xl border border-transparent px-2 pb-2 pt-2 sm:px-6 sm:pb-6 sm:pt-6"
          >
            <div key={current.id} className="animate-slide-in motion-reduce:animate-none">
              <h3 className="text-xl font-semibold text-neutral-950 dark:text-neutral-100 sm:text-2xl">{current.headline}</h3>
              <p className="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">{current.body}</p>
              <ul className="mt-8 space-y-4" role="list">
                {current.bullets.map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-base">
                    <span
                      className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                      aria-hidden
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricBar({ label, value, suffix, caption }: { label: string; value: number; suffix: string; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [display, setDisplay] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (reduced) {
          setProgress(value);
          setDisplay(value);
          io.disconnect();
          return;
        }
        const start = performance.now();
        const duration = 1100;
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - (1 - t) ** 3;
          const v = Math.round(value * eased);
          setProgress(v);
          setDisplay(v);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [value, reduced]);

  return (
    <div
      ref={ref}
      className="rounded-xl border border-white/30 bg-white/88 p-5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-neutral-950/55"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-primary-700 dark:text-primary-300">
          {display}
          <span className="text-lg font-semibold text-primary-600/90 dark:text-primary-400/90">{suffix}</span>
        </p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900" role="presentation">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-600 to-secondary-500 transition-[width] duration-700 ease-out motion-reduce:transition-none dark:from-primary-500 dark:to-secondary-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-500">{caption}</p>
    </div>
  );
}

function MetricsSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="up" delay={0}>
          <h2 className="text-center text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-3xl">
            Outcomes teams optimize for
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-neutral-700 dark:text-neutral-300">
            Illustrative benchmarks from internal research and design partners—your mileage depends on rollout and
            governance maturity.
          </p>
        </ScrollAnimation>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {METRICS.map((m, i) => (
            <ScrollAnimation key={m.label} direction="up" delay={i * 80}>
              <MetricBar {...m} />
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
}

function BentoGrid() {
  return (
    <section className="py-20 sm:py-24" aria-labelledby="bento-title">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="fade" delay={0}>
          <h2 id="bento-title" className="text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-4xl">
            Capability map
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-700 dark:text-neutral-300">
            A calm overview of the major surfaces—each designed to interoperate rather than compete for attention.
          </p>
        </ScrollAnimation>
        <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-2 md:gap-5">
          {BENTO.map((item, index) => (
            <ScrollAnimation key={item.title} direction="up" delay={index * 60} className={cn("group", item.span)}>
              <div
                className={cn(
                  "relative h-full overflow-hidden rounded-2xl border border-white/25 bg-white/82 p-6 shadow-sm backdrop-blur-sm transition duration-300 dark:border-white/10 dark:bg-neutral-950/50",
                  "hover:-translate-y-0.5 hover:border-primary-300/60 hover:shadow-soft-lg dark:hover:border-primary-500/35",
                )}
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-primary-500/10 to-secondary-500/10 blur-2xl transition group-hover:opacity-100 dark:from-primary-400/15 dark:to-secondary-400/15"
                  aria-hidden
                />
                <h3 className="relative text-lg font-semibold text-neutral-900 dark:text-neutral-100">{item.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{item.text}</p>
              </div>
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrinciplesStrip() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-neutral-950/65 py-16 text-neutral-100 backdrop-blur-xl dark:bg-neutral-950/70 sm:py-20">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="fade" delay={0}>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Operating principles</h2>
          <p className="mt-2 max-w-2xl text-sm text-primary-100/90">
            Tap a card to expand—short on the eyes, deeper on demand.
          </p>
        </ScrollAnimation>
        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 sm:overflow-visible">
          {PRINCIPLES.map((p, i) => {
            const expanded = open === i;
            return (
              <button
                key={p.title}
                type="button"
                onClick={() => setOpen(expanded ? null : i)}
                aria-expanded={expanded}
                className={cn(
                  "snap-start text-left transition duration-300",
                  "min-w-[240px] flex-1 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm sm:min-w-0",
                  "hover:border-primary-300/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300",
                  expanded && "border-primary-300/50 bg-white/10 ring-1 ring-primary-400/30",
                )}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-primary-200/90">Principle</span>
                <span className="mt-2 block text-lg font-semibold text-white">{p.title}</span>
                <span
                  className={cn(
                    "mt-2 block text-sm text-primary-100/85 transition-all duration-300",
                    expanded
                      ? "max-h-40 opacity-100"
                      : "max-h-0 overflow-hidden opacity-0 lg:max-h-40 lg:overflow-visible lg:opacity-100",
                  )}
                >
                  {p.detail}
                </span>
                <span className="mt-3 lg:hidden">
                  {!expanded ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-200/90">
                      Show more
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  ) : (
                    <span className="text-xs text-primary-200/80">Tap again to collapse</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TeamSection({ members }: { members: TeamMember[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="py-20 sm:py-24" aria-labelledby="team-title">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <ScrollAnimation direction="fade" delay={0}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="team-title" className="text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-4xl">
              People behind the platform
            </h2>
            <p className="mt-3 text-neutral-700 dark:text-neutral-300">
              A cross-functional crew obsessed with dependable software and humane operations.
            </p>
          </div>
        </ScrollAnimation>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member, index) => {
            const isOpen = expanded === member.name;
            return (
              <ScrollAnimation key={member.name} direction="up" delay={index * 70}>
                <div
                  className={cn(
                    "group rounded-2xl border border-white/25 bg-white/78 p-6 text-center shadow-sm backdrop-blur-sm transition dark:border-white/10 dark:bg-neutral-950/50",
                    isOpen &&
                      "border-primary-300/70 shadow-soft-lg ring-1 ring-primary-200/80 dark:border-primary-500/40 dark:ring-primary-900/50",
                  )}
                >
                  <button
                    type="button"
                    className="w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : member.name)}
                  >
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-2xl font-bold text-white ring-4 ring-primary-100 transition duration-300 group-hover:scale-[1.03] dark:from-primary-500 dark:to-primary-700 dark:ring-primary-950">
                      {member.initials}
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{member.name}</h3>
                    <p className="text-sm font-medium text-primary-600 dark:text-primary-400">{member.role}</p>
                  </button>
                  <p className="mt-4 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{member.bio}</p>
                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-out motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="mt-3 border-t border-neutral-200 pt-3 text-left text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
                        Focus: shipping resilient workflows, tight feedback loops with customers, and documentation that
                        matches reality—not aspirations.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    onClick={() => setExpanded(isOpen ? null : member.name)}
                  >
                    {isOpen ? "Show less" : "Why this role matters"}
                  </button>
                </div>
              </ScrollAnimation>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AboutPageExperience({ teamMembers }: { teamMembers: TeamMember[] }) {
  const productName = APP_CONFIG.name;

  return (
    <>
      <AboutHeroSpotlight productName={productName} />
      <StoryTabs />
      <MetricsSection />
      <BentoGrid />
      <PrinciplesStrip />
      <TeamSection members={teamMembers} />
    </>
  );
}
