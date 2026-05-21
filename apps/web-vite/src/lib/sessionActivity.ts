/**
 * Keeps web sessions alive while the tab is visible and the user is interacting.
 * Calls POST /auth/extend-session (throttled) so idle expiry slides up to the 30-day server cap.
 */

// Human: The API extends sessions on authenticated requests too; this hook covers long-lived UI time without constant API traffic.
// Agent: LISTENS mousedown keydown scroll touchstart visibilitychange; THROTTLES extend POST 5min; REQUIRES visible tab + recent activity.

const EXTEND_COOLDOWN_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;

export function startSessionActivityExtension(onExtend: () => Promise<void>): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let lastActivity = Date.now();
  let lastExtendAttempt = 0;

  const markActive = () => {
    lastActivity = Date.now();
  };

  const activityEvents: Array<keyof WindowEventMap> = [
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
  ];
  for (const event of activityEvents) {
    window.addEventListener(event, markActive, { passive: true });
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      markActive();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const interval = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastActivity > IDLE_THRESHOLD_MS) return;
    if (now - lastExtendAttempt < EXTEND_COOLDOWN_MS) return;
    lastExtendAttempt = now;
    void onExtend().catch(() => {
      /* extend is best-effort; 401 handled globally */
    });
  }, CHECK_INTERVAL_MS);

  return () => {
    for (const event of activityEvents) {
      window.removeEventListener(event, markActive);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(interval);
  };
}
