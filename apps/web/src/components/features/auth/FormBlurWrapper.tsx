"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";

interface FormBlurWrapperProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
  formType: "login" | "register";
}

/**
 * Shows a non-blocking notice when the database or API health looks degraded.
 * Auth forms stay usable so sign-in can be retried and registration can be queued by the API.
 */
export function FormBlurWrapper({
  children,
  initialDatabaseAvailable,
  formType,
}: FormBlurWrapperProps) {
  const { status, isServerUnreachable } = useDatabaseHealth({
    pollInterval: 30000,
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
  });

  const showNotice =
    status === "unhealthy" || status === "loading" || isServerUnreachable;
  const formName = formType === "login" ? "Sign-in" : "Registration";

  return (
    <div className="relative">
      {showNotice && (
        <div
          className="mb-6 rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Database or API may be temporarily unavailable
          </p>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            You can still fill out this form. {formName} may succeed once the service recovers. New
            accounts may be queued by the API for a short time if the database was unreachable. Check
            the{" "}
            <Link
              href="/health"
              className="font-medium text-amber-900 underline dark:text-amber-100"
            >
              health status page
            </Link>{" "}
            for details.
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
