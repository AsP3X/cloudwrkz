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
    let cancelled = false;

    async function startQrFlow() {
      try {
        const created = await api.post<QrRequestResponse>("/auth/qr-login/request");
        if (cancelled) return;
        setQrPayload(created.qr_payload);
        const img = await QRCode.toDataURL(created.qr_payload, {
          width: 240,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (cancelled) return;
        setQrDataUrl(img);
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

  if (status === "loading") {
    return <p className="text-sm text-neutral-600 dark:text-neutral-400">Preparing QR code...</p>;
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950 p-4">
        <p className="text-sm text-error-800 dark:text-error-200">
          {errorMessage || "Something went wrong."}
        </p>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          This QR code has expired. Close this panel and request a new one.
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-success-200 dark:border-success-900 bg-success-50 dark:bg-success-950 p-4">
        <p className="text-sm text-success-800 dark:text-success-200">
          Sign-in approved. Finalizing your browser session...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Scan this QR code with the Cloudwrkz app (Profile menu -&gt; Login with QR code).
      </p>
      {qrPayload && qrDataUrl ? (
        <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white p-3">
          <img src={qrDataUrl} alt="QR code sign in" className="mx-auto h-52 w-52" />
        </div>
      ) : null}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-neutral-600 hover:underline dark:text-neutral-300"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
