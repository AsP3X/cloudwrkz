import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/constants/routes";

interface DatabaseWarningProps {
  isServerUnreachable?: boolean;
  error?: string | null;
}

export function DatabaseWarning({ isServerUnreachable = false, error }: DatabaseWarningProps) {
  const title = isServerUnreachable
    ? "Server is currently unreachable"
    : "Database service is currently unavailable";

  const description = isServerUnreachable
    ? "Unable to connect to the server. Please check your network connection and try again."
    : error && error.toLowerCase().includes("server")
      ? error
      : error || "Some features may not work correctly. Please check the health status page for more information.";

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-b-2 border-red-200 dark:border-red-800 min-h-[64px] flex items-center">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">{title}</p>
            <p className="text-sm text-red-700 dark:text-red-300">
              {description}
              {!isServerUnreachable && !error && (
                <>
                  {" "}Please check the{" "}
                  <Link to={ROUTES.HEALTH} className="underline font-medium hover:text-red-900 dark:hover:text-red-100 transition-colors">
                    health status page
                  </Link>{" "}
                  for more information.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
