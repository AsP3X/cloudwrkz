// Human: QR-based login flow that requests a challenge, renders a rotating QR, and polls until approval, expiry, or error.
// Agent: POST qr endpoints; POLL status interval; USES qrcode canvas; HANDLES ApiError; CALLBACK onClose optional.

import React from "react";
import QRCode from "qrcode";
import { api, ApiError } from "@/api/client";
import { ROUTES } from "@/lib/constants/routes";

const POLL_INTERVAL_MS = 1200;
const QR_VALIDITY_MS = 5 * 60 * 1000;

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
  const [entered, setEntered] = React.useState(false);
  const [scanAnimating, setScanAnimating] = React.useState(false);
  const [isClosing, setIsClosing] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [expiresAt, setExpiresAt] = React.useState<number | null>(null);
  const [remainingMs, setRemainingMs] = React.useState<number>(QR_VALIDITY_MS);
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
    const raf = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const handleClose = React.useCallback(() => {
    if (!onClose || isClosing) return;
    setIsClosing(true);
    setEntered(false);
    window.setTimeout(() => {
      onClose();
    }, 280);
  }, [isClosing, onClose]);

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
    if (!qrDataUrl || status !== "scanning") return;
    setScanAnimating(true);
    const timeout = window.setTimeout(() => setScanAnimating(false), 1700);
    return () => window.clearTimeout(timeout);
  }, [qrDataUrl, status]);

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
  }, [clearTimers, reloadKey]);

  React.useEffect(() => {
    if (!expiresAt || status !== "scanning") return;
    const tick = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    tick();
    const interval = window.setInterval(tick, 1000);
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
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
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
      <div className="flex min-h-[220px] items-center justify-center">
        <button
          type="button"
          onClick={() => {
            clearTimers();
            setErrorMessage(null);
            setQrPayload(null);
            setQrDataUrl(null);
            setExpiresAt(null);
            setRemainingMs(QR_VALIDITY_MS);
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
          className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
        >
          Refresh QR code
        </button>
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
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const mm = Math.floor(remainingSeconds / 60)
      .toString()
      .padStart(2, "0");
    const ss = (remainingSeconds % 60).toString().padStart(2, "0");
    const progressRatio = Math.min(1, Math.max(0, remainingMs / QR_VALIDITY_MS));
    const lowTime = remainingSeconds <= 60;
    content = (
      <div className="space-y-3">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Scan this QR code with the Cloudwrkz app (Profile menu -&gt; Login with QR code).
        </p>
        {qrPayload && qrDataUrl ? (
          <div className="relative overflow-hidden rounded-lg border border-neutral-300 dark:border-neutral-700 p-3">
            <img src={qrDataUrl} alt="QR code sign in" className="mx-auto h-52 w-52" />
            {scanAnimating ? (
              <div className="pointer-events-none absolute inset-3 overflow-hidden rounded">
                <div className="qr-scan-line absolute left-0 right-0 h-10" />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <div className="relative h-8 w-full overflow-hidden rounded-full border border-neutral-300 bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                lowTime ? "bg-amber-500" : "bg-primary-500"
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p
                className={`text-xs font-semibold tabular-nums tracking-wide ${
                  lowTime
                    ? "text-amber-900 dark:text-amber-200 animate-pulse"
                    : "text-neutral-800 dark:text-neutral-100"
                }`}
              >
                QR code expires in {mm}:{ss}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm transition-all duration-300 ease-out ${
        entered ? "bg-black/40 opacity-100" : "bg-black/0 opacity-0"
      }`}
    >
      <div
        className={`w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-xl transition-all duration-300 ease-out ${
          entered
            ? "translate-y-0 scale-100 rotate-0 opacity-100"
            : "translate-y-4 scale-90 -rotate-1 opacity-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            Sign in with QR code
          </h3>
          {onClose ? (
            <button
              type="button"
              onClick={handleClose}
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
        <style>{`
          @keyframes qr-scan-pass {
            0% {
              transform: translateY(-48px);
              opacity: 0;
            }
            8% {
              opacity: 1;
            }
            92% {
              opacity: 1;
            }
            100% {
              transform: translateY(230px);
              opacity: 0;
            }
          }
          .qr-scan-line {
            animation: qr-scan-pass 1.7s ease-in-out forwards;
            background:
              linear-gradient(
                to bottom,
                rgba(255, 255, 255, 0) 0%,
                rgba(255, 255, 255, 0.45) 32%,
                rgba(255, 255, 255, 0.95) 50%,
                rgba(255, 255, 255, 0.45) 68%,
                rgba(255, 255, 255, 0) 100%
              );
            box-shadow:
              0 0 18px rgba(255, 255, 255, 0.55),
              0 0 2px rgba(255, 255, 255, 0.95);
          }
          .dark .qr-scan-line {
            background:
              linear-gradient(
                to bottom,
                rgba(147, 197, 253, 0) 0%,
                rgba(147, 197, 253, 0.35) 32%,
                rgba(191, 219, 254, 0.95) 50%,
                rgba(147, 197, 253, 0.35) 68%,
                rgba(147, 197, 253, 0) 100%
              );
            box-shadow:
              0 0 20px rgba(147, 197, 253, 0.45),
              0 0 3px rgba(191, 219, 254, 0.85);
          }
        `}</style>
      </div>
    </div>
  );
}
