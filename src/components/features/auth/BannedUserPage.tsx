"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { createUnbanRequest, type PendingUnbanRequest } from "@/server/actions/unban";
import { formatDateTime } from "@/lib/utils/date";

interface BannedUserPageProps {
  userInfo: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    bannedAt: Date | null;
    banReason: string | null;
  };
  pendingRequest?: PendingUnbanRequest | null;
}

export function BannedUserPage({ userInfo, pendingRequest: initialPendingRequest }: BannedUserPageProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(initialPendingRequest?.id || null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(initialPendingRequest?.ticketNumber || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<PendingUnbanRequest | null>(initialPendingRequest || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!reason.trim()) {
      setError("Please provide a reason for your unban request");
      return;
    }

    if (reason.trim().length < 10) {
      setError("Please provide a detailed reason (at least 10 characters)");
      return;
    }

    setIsSubmitting(true);
    const result = await createUnbanRequest({ reason: reason.trim() });
    setIsSubmitting(false);

    if (result.success) {
      setSuccess(result.message || "Unban request submitted successfully");
      if (result.data) {
        setRequestId(result.data.requestId);
        setTicketNumber(result.data.ticketNumber || null);
        // Update pending request state
        setPendingRequest({
          id: result.data.requestId,
          reason: reason.trim(),
          status: "PENDING",
          createdAt: new Date(),
          ticketId: null,
          ticketNumber: result.data.ticketNumber || null,
        });
      }
      setReason("");
      // Refresh the page to get updated server-side data
      router.refresh();
    } else {
      setError(result.error || "Failed to submit unban request");
      if (result.fieldErrors?.reason) {
        setError(result.fieldErrors.reason[0]);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Ban Message */}
      <div className="text-center">
        <div className="mx-auto w-16 h-16 bg-error-100 dark:bg-error-900 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-error-600 dark:text-error-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
          Account Banned
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Your account has been banned and you cannot access the platform.
        </p>
      </div>

      {/* Ban Details */}
      <div className="bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-error-800 dark:text-error-200 mb-2">
            Ban Reason
          </h2>
          <p className="text-sm text-error-700 dark:text-error-300">
            {userInfo.banReason || "No reason provided"}
          </p>
        </div>

        {userInfo.bannedAt && (
          <div>
            <h2 className="text-sm font-semibold text-error-800 dark:text-error-200 mb-2">
              Banned On
            </h2>
            <p className="text-sm text-error-700 dark:text-error-300">
              {formatDateTime(userInfo.bannedAt)}
            </p>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-error-800 dark:text-error-200 mb-2">
            Account Email
          </h2>
          <p className="text-sm text-error-700 dark:text-error-300">{userInfo.email}</p>
        </div>
      </div>

      {/* Unban Request Form */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Request Account Unban
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          If you believe this ban was made in error, you can submit a request to have your account
          unbanned. An administrator will review your request.
        </p>

        {/* Pending Request Status */}
        {pendingRequest && (
          <div className="mb-4 p-4 bg-warning-50 dark:bg-warning-950 border-2 border-warning-200 dark:border-warning-800 rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-warning-600 dark:text-warning-400 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-warning-800 dark:text-warning-200 mb-2">
                  You have a pending unban request
                </p>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-warning-700 dark:text-warning-300 uppercase tracking-wide">
                      Request ID:
                    </span>
                    <p className="text-sm font-mono text-warning-900 dark:text-warning-100 mt-1">
                      {pendingRequest.id}
                    </p>
                  </div>
                  {pendingRequest.ticketNumber && (
                    <div>
                      <span className="text-xs font-semibold text-warning-700 dark:text-warning-300 uppercase tracking-wide">
                        Ticket Number:
                      </span>
                      <p className="text-sm font-mono text-warning-900 dark:text-warning-100 mt-1">
                        {pendingRequest.ticketNumber}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-semibold text-warning-700 dark:text-warning-300 uppercase tracking-wide">
                      Submitted:
                    </span>
                    <p className="text-sm text-warning-900 dark:text-warning-100 mt-1">
                      {formatDateTime(pendingRequest.createdAt)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-warning-700 dark:text-warning-300 uppercase tracking-wide">
                      Your Reason:
                    </span>
                    <p className="text-sm text-warning-900 dark:text-warning-100 mt-1 whitespace-pre-wrap">
                      {pendingRequest.reason}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-warning-600 dark:text-warning-400 mt-3">
                  Please wait for an administrator to review your request. You cannot submit another request until this one is reviewed.
                </p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-success-50 dark:bg-success-950 border-2 border-success-200 dark:border-success-800 rounded-lg space-y-3">
            <p className="text-sm font-medium text-success-800 dark:text-success-200">{success}</p>
            {requestId && (
              <div className="pt-3 border-t border-success-200 dark:border-success-800 space-y-2">
                <div>
                  <span className="text-xs font-semibold text-success-700 dark:text-success-300 uppercase tracking-wide">
                    Request ID:
                  </span>
                  <p className="text-sm font-mono text-success-900 dark:text-success-100 mt-1">
                    {requestId}
                  </p>
                </div>
                {ticketNumber && (
                  <div>
                    <span className="text-xs font-semibold text-success-700 dark:text-success-300 uppercase tracking-wide">
                      Ticket Number:
                    </span>
                    <p className="text-sm font-mono text-success-900 dark:text-success-100 mt-1">
                      {ticketNumber}
                    </p>
                  </div>
                )}
                <p className="text-xs text-success-600 dark:text-success-400 mt-3">
                  Please save these details for your records. You can use them to track the status of your request.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-error-50 dark:bg-error-950 border-2 border-error-200 dark:border-error-800 rounded-lg">
            <p className="text-sm text-error-700 dark:text-error-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="unban-reason"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Reason for Unban Request <span className="text-error-500 dark:text-error-400">*</span>
            </label>
            <textarea
              id="unban-reason"
              placeholder="Please explain why you believe your account should be unbanned..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              rows={6}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                error
                  ? "border-error-300 bg-error-50 focus:border-error-500 focus:ring-error-500 dark:border-error-700 dark:bg-error-950 dark:focus:border-error-400 dark:focus:ring-error-400"
                  : "bg-white text-neutral-900 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-100 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:border-primary-500 dark:focus:ring-offset-neutral-900 dark:focus:border-primary-400"
              } placeholder:text-neutral-400 dark:placeholder:text-neutral-500`}
              required
              disabled={isSubmitting || !!success || !!pendingRequest}
            />
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Minimum 10 characters required
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={isSubmitting}
            disabled={isSubmitting || !!success || !!pendingRequest}
          >
            {isSubmitting ? "Submitting..." : pendingRequest ? "Request Already Submitted" : "Submit Unban Request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
