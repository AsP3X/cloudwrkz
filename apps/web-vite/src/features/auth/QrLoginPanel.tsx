import React from "react";
import QRCode from "qrcode";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";

const POLL_INTERVAL_MS = 1200;

type QrLoginPanelProps = {
  onClose?: () => void;
};

type QrRequestResponse = {
  request_id: string;
  browser_token: string;
  expires_at: string;
  qr_payload: string;
};

type QrStatusResponse = {
  status: "PENDING" | "APPROVED" | "EXPIRED";
  session_available?: boolean;
};

type QrQueuedResponse = {
  queued: boolean;
  job_id: string;
  retry_deadline_secs?: number;
};

type QrFinalizeStatusResponse = {
  status: "pending" | "completed" | "failed";
  message?: string;
  token?: string;
};

export function QrLoginPanel({ onClose }: QrLoginPanelProps) {
  const [status, setStatus] = React.useState<
    "loading" | "scanning" | "success" | "expired" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [qrPayload, setQrPayload] = React.useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [expiresAt, setExpiresAt] = React.useState<number | null>(null);
  const pollTimer = React.useRef<number | null>(null);
  const finalizeTimer = React.useRef<number | null>(null);

  const clearTimers = React.useCallback(() => {
    if (pollTimer.current) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (finalizeTimer.current) {
      window.clearInterval(finalizeTimer.current);
      finalizeTimer.current = null;
    }
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setIsDarkMode(root.classList.contains("dark") || media.matches);
    };
    updateTheme();
    media.addEventListener("change", updateTheme);
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      media.removeEventListener("change", updateTheme);
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    if (!qrPayload) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(qrPayload, {
      width: 240,
      margin: 2,
      color: { dark: isDarkMode ? "#ffffff" : "#0f172a", light: "#0000" },
    })
      .then((img) => {
        if (!cancelled) setQrDataUrl(img);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isDarkMode, qrPayload]);

  React.useEffect(() => {
    let cancelled = false;

    async function startQrFlow() {
      try {
        const created = await api.post<QrRequestResponse>("/auth/qr-login/request");
        if (cancelled) return;
        setQrPayload(created.qr_payload);
        setExpiresAt(Date.parse(created.expires_at));
        setStatus("scanning");

        pollTimer.current = window.setInterval(async () => {
          try {
            const st = await api.get<QrStatusResponse>(
              `/auth/qr-login/status?requestId=${encodeURIComponent(created.request_id)}`,
              { headers: { "X-QR-Browser-Token": created.browser_token } },
            );
            if (cancelled) return;

            if (st.status === "EXPIRED") {
              clearTimers();
              setStatus("expired");
              return;
            }

            if (st.status === "APPROVED" && st.session_available) {
              clearTimers();
              const queued = await api.post<QrQueuedResponse>(
                "/auth/qr-login/finalize",
                { requestId: created.request_id },
                { headers: { "X-QR-Browser-Token": created.browser_token } },
              );

              setStatus("success");
              const deadline =
                Date.now() + ((queued.retry_deadline_secs ?? 45) + 5) * 1000;

              finalizeTimer.current = window.setInterval(async () => {
                try {
                  const fin = await api.get<QrFinalizeStatusResponse>(
                    `/auth/qr-login/finalize/status/${queued.job_id}`,
                    { headers: { "X-QR-Browser-Token": created.browser_token } },
                  );
                  if (fin.status === "completed" && fin.token) {
                    localStorage.setItem("auth_token", fin.token);
                    window.location.assign(ROUTES.DASHBOARD);
                    return;
                  }
                  if (fin.status === "failed") {
                    clearTimers();
                    setStatus("error");
                    setErrorMessage(fin.message || "Failed to complete sign in.");
                    return;
                  }
                  if (Date.now() >= deadline) {
                    clearTimers();
                    setStatus("error");
                    setErrorMessage("Sign in timed out. Please try again.");
                  }
                } catch (err) {
                  if (err instanceof ApiError && err.status === 404) {
                    clearTimers();
                    setStatus("error");
                    setErrorMessage("QR sign-in job expired. Please try again.");
                  }
                }
              }, POLL_INTERVAL_MS);
            }
          } catch {
            // Poll errors are transient; the next tick retries.
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Could not start QR sign-in.",
        );
      }
    }

    startQrFlow();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [clearTimers]);

  React.useEffect(() => {
    if (!expiresAt || status !== "scanning") return;
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 0) {
      clearTimers();
      setStatus("expired");
      return;
    }
    const timeout = window.setTimeout(() => {
      clearTimers();
      setStatus("expired");
    }, msLeft);
    return () => window.clearTimeout(timeout);
  }, [clearTimers, expiresAt, status]);

  let content: React.ReactNode;
  if (status === "loading") {
    content = (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Preparing QR code...</p>
    );
  } else if (status === "error") {
    content = (
      <div className="rounded-lg border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950 p-4">
        <p className="text-sm text-error-800 dark:text-error-200">
          {errorMessage || "Something went wrong."}
        </p>
      </div>
    );
  } else if (status === "expired") {
    content = (
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          This QR code has expired. Close this panel and request a new one.
        </p>
      </div>
    );
  } else if (status === "success") {
    content = (
      <div className="rounded-lg border border-success-200 dark:border-success-900 bg-success-50 dark:bg-success-950 p-4">
        <p className="text-sm text-success-800 dark:text-success-200">
          Sign-in approved. Finalizing your browser session...
        </p>
      </div>
    );
  } else {
    content = (
      <div className="space-y-3">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Scan this QR code with the Cloudwrkz app (Profile menu -&gt; Login with QR code).
        </p>
        {qrPayload && qrDataUrl ? (
          <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 p-3">
            <img src={qrDataUrl} alt="QR code sign in" className="mx-auto h-52 w-52" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Sign in with QR code
          </h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              aria-label="Close QR dialog"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          ) : null}
        </div>
        {content}
      </div>
    </div>
  );
}
