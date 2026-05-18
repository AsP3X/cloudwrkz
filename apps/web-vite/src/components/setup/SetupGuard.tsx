// Human: Redirects fresh installs to `/setup` until the API reports at least one user exists.
// Agent: CALLS fetchSetupStatus; NAVIGATES /setup or away; READS auth_token for post-setup redirect target.

import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchSetupStatus } from "@/api/setup";
import { useAuth } from "@/components/providers/AuthProvider";
import { ROUTES } from "@/lib/constants/routes";

type SetupGuardProps = {
  children: ReactNode;
};

function hasAuthToken(): boolean {
  return Boolean(localStorage.getItem("auth_token"));
}

// Human: While setup status is loading, show a centered spinner instead of flashing protected routes.
// Agent: setupComplete null -> spinner; true on /setup -> null until navigate effect runs.
function SetupLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"
          aria-hidden
        />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    </div>
  );
}

// Human: First-run gate — only `/setup` is reachable until `setup_complete` is true (mirrors Aurora SetupGuard).
// Agent: EFFECT fetchSetupStatus; REDIRECT replace /setup or /login|/dashboard; ON API error assumes complete.
export function SetupGuard({ children }: SetupGuardProps) {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const authToken = user?.id ?? localStorage.getItem("auth_token");

  // Human: Re-check setup status when auth changes (e.g. immediately after the setup wizard stores a token).
  // Agent: EFFECT deps authToken; CALLS fetchSetupStatus; CATCH assumes complete.
  useEffect(() => {
    let cancelled = false;
    fetchSetupStatus()
      .then((status) => {
        if (!cancelled) setSetupComplete(status.setup_complete);
      })
      .catch(() => {
        if (!cancelled) setSetupComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (setupComplete === null) return;

    if (setupComplete && pathname === ROUTES.SETUP) {
      navigate(hasAuthToken() ? ROUTES.DASHBOARD : ROUTES.LOGIN, { replace: true });
      return;
    }

    if (!setupComplete && pathname !== ROUTES.SETUP) {
      navigate(ROUTES.SETUP, { replace: true });
    }
  }, [setupComplete, pathname, navigate]);

  if (setupComplete === null) {
    return <SetupLoading />;
  }

  if (setupComplete && pathname === ROUTES.SETUP) {
    return null;
  }

  if (!setupComplete && pathname !== ROUTES.SETUP) {
    return null;
  }

  return <>{children}</>;
}
