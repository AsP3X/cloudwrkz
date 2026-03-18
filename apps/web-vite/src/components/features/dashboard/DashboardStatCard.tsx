import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

type Accent = "primary" | "secondary" | "success" | "warning" | "neutral";

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  href?: string;
  icon: React.ReactNode;
  accent?: Accent;
  className?: string;
}

const accentStyles: Record<Accent, { bg: string; text: string; border: string; iconBg: string }> = {
  primary: {
    bg: "bg-primary-100/50 dark:bg-primary-900/20",
    text: "text-primary-700 dark:text-primary-300",
    border: "border-primary-200/50 dark:border-primary-800/50",
    iconBg: "bg-primary-100/50 dark:bg-primary-900/20",
  },
  secondary: {
    bg: "bg-secondary-100/50 dark:bg-secondary-900/20",
    text: "text-secondary-700 dark:text-secondary-300",
    border: "border-secondary-200/50 dark:border-secondary-800/50",
    iconBg: "bg-secondary-100/50 dark:bg-secondary-900/20",
  },
  success: {
    bg: "bg-success-100/50 dark:bg-success-900/20",
    text: "text-success-700 dark:text-success-300",
    border: "border-success-200/50 dark:border-success-800/50",
    iconBg: "bg-success-100/50 dark:bg-success-900/20",
  },
  warning: {
    bg: "bg-warning-100/50 dark:bg-warning-900/20",
    text: "text-warning-700 dark:text-warning-300",
    border: "border-warning-200/50 dark:border-warning-800/50",
    iconBg: "bg-warning-100/50 dark:bg-warning-900/20",
  },
  neutral: {
    bg: "bg-neutral-100/50 dark:bg-neutral-800/50",
    text: "text-neutral-700 dark:text-neutral-300",
    border: "border-neutral-200/50 dark:border-neutral-700/50",
    iconBg: "bg-neutral-100/50 dark:bg-neutral-800/50",
  },
};

export function DashboardStatCard({
  title,
  value,
  subtitle,
  href,
  icon,
  accent = "primary",
  className,
}: DashboardStatCardProps) {
  const styles = accentStyles[accent];
  const cardClass = cn(
    "rounded-xl border bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm p-5 sm:p-6 transition-all duration-200",
    "hover:shadow-md",
    href && "cursor-pointer",
    className
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">{subtitle}</p>}
        </div>
        <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center border shrink-0", styles.iconBg, styles.border)}>
          <span className={cn("[&_svg]:w-5 [&_svg]:h-5", styles.text)}>{icon}</span>
        </div>
      </div>
    </>
  );
  if (href) {
    return <Link to={href} className={cardClass}>{content}</Link>;
  }
  return <div className={cardClass}>{content}</div>;
}
