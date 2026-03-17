"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { ROUTES } from "@/lib/constants/routes";
import { setSessionFromQrLogin } from "@/server/actions/auth";

const POLL_INTERVAL_MS = 2000;

type QrLoginPanelProps = {
  onClose?: () => void;
  onError?: (message: string) => void;
};

export function QrLoginPanel({ onClose, onError }: QrLoginPanelProps) {
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "scanning" | "success" | "expired" | "error">("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Create request and start polling
  React.useEffect(() => {
    let cancelled = false;

    async function createAndPoll() {
      try {
        const res = await fetch("/api/auth/qr-login/request", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || "Failed to create QR login");
        }
        const data = await res.json();
        if (cancelled) return;

        setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
        setStatus("ready");

        const qrUrl = await QRCode.toDataURL(data.qrPayload, {
          width: 240,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (cancelled) return;
        setQrDataUrl(qrUrl);
        setStatus("scanning");

        pollRef.current = setInterval(async () => {
          if (!data.browserToken || !data.requestId) return;
          try {
            const statusRes = await fetch(
              `/api/auth/qr-login/status?requestId=${encodeURIComponent(data.requestId)}`,
              { headers: { "X-QR-Browser-Token": data.browserToken } }
            );
            const statusData = await statusRes.json();
            if (statusData.status === "APPROVED" && statusData.sessionToken) {
              // App has confirmed login. Show a dedicated "signing you in" dialog
              // while we complete the web session setup, similar to the iOS app.
              clearPoll();
              setStatus("success");

              const result = await setSessionFromQrLogin(statusData.sessionToken);
              if (result.success) {
                router.push(ROUTES.DASHBOARD);
                router.refresh();
              } else {
                setStatus("error");
                setErrorMessage(result.error || "Sign in failed.");
                onError?.(result.error || "Sign in failed.");
              }
              return;
            }
            if (statusData.status === "EXPIRED") {
              clearPoll();
              setStatus("expired");
              return;
            }
          } catch {
            // ignore poll errors, will retry
          }
        }, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const msg = err instanceof Error ? err.message : "Something went wrong.";
        setErrorMessage(msg);
        onError?.(msg);
      }
    }

    createAndPoll();
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [onError, router, clearPoll]);

  // Expire after expiresAt
  React.useEffect(() => {
    if (!expiresAt || status !== "scanning") return;
    const t = expiresAt.getTime() - Date.now();
    if (t <= 0) {
      setStatus("expired");
      clearPoll();
      return;
    }
    const timeout = setTimeout(() => {
      setStatus("expired");
      clearPoll();
    }, t);
    return () => clearTimeout(timeout);
  }, [expiresAt, status, clearPoll]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Preparing QR code...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <div className="rounded-full bg-error-100 dark:bg-error-900/30 p-3 mb-4">
          <svg className="w-8 h-8 text-error-600 dark:text-error-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-error-800 dark:text-error-200 text-center mb-2">{errorMessage}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center mb-4">
          This QR code has expired. Please request a new one.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  if (status === "success") {
    // Full-screen blocking overlay while completing login,
    // so the user can't interact with the underlying page.
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center rounded-xl bg-white dark:bg-neutral-900 px-8 py-6 shadow-lg border border-neutral-200 dark:border-neutral-800">
          <div className="w-12 h-12 border-2 border-success-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-success-600 dark:text-success-400 font-medium">
            Signing you in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center mb-4">
        Scan this code with the Cloudwrkz app to sign in
      </p>
      {qrDataUrl && (
        <div className="rounded-lg border-2 border-neutral-200 dark:border-neutral-700 p-2 bg-white dark:bg-neutral-800 mb-4">
          <Image src={qrDataUrl} alt="QR code for login" width={240} height={240} className="block" unoptimized />
        </div>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
        Open the app → Profile menu → Login with QR code
      </p>
      {expiresAt && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
          Expires in {Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60))} min
        </p>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
