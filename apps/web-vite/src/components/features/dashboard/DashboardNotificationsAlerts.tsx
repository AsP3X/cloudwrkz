import { Link } from "react-router-dom";
import { cn } from "@/lib/utils/cn";

export interface DashboardAlert {
  id: string;
  message: string;
  href?: string;
  severity: "info" | "warning" | "error";
}

interface DashboardNotificationsAlertsProps {
  alerts: DashboardAlert[];
  className?: string;
}

const severityStyles = {
  info: "bg-primary-50 dark:bg-primary-950/30 border-primary-200 dark:border-primary-800 text-primary-800 dark:text-primary-200",
  warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200",
  error: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200",
};

export function DashboardNotificationsAlerts({
  alerts,
  className,
}: DashboardNotificationsAlertsProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-white/25 bg-white/82 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55",
        className
      )}
    >
      <div className="border-b border-white/15 p-4 sm:p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Notifications & alerts
        </h2>
      </div>
      <div className="p-4 sm:p-5 space-y-3">
        {alerts.map((alert) => {
          const content = (
            <span className="text-sm font-medium">{alert.message}</span>
          );
          const style = severityStyles[alert.severity] ?? severityStyles.info;
          const wrapperClass = cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3",
            style
          );
          if (alert.href) {
            return (
              <Link
                key={alert.id}
                to={alert.href}
                className={cn(wrapperClass, "hover:opacity-90 transition-opacity")}
              >
                {content}
                <span className="shrink-0 text-xs font-medium opacity-80">
                  View →
                </span>
              </Link>
            );
          }
          return (
            <div key={alert.id} className={wrapperClass}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
