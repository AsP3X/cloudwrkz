"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";

export function UserPermissionsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">User Permissions</h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            Manage permissions for individual users
          </p>
        </div>
      </div>

      {/* Coming Soon Message */}
      <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-soft-lg border border-neutral-200/50 dark:border-neutral-800/50 p-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900 mb-4">
            <svg
              className="w-8 h-8 text-primary-600 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            Feature Coming Soon
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4 max-w-md mx-auto">
            The user permissions management feature is currently under development. 
            You can manage permissions through groups in the meantime.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="info" size="md">In Development</Badge>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-info-50 dark:bg-info-950 border-2 border-info-200 dark:border-info-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-info-600 dark:text-info-400 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-info-900 dark:text-info-100 mb-1">
              Current Permission System
            </h3>
            <p className="text-sm text-info-800 dark:text-info-200">
              Users currently receive permissions through:
            </p>
            <ul className="text-sm text-info-800 dark:text-info-200 mt-2 space-y-1 list-disc list-inside">
              <li>Their role (ADMIN, MODERATOR, AGENT, USER) - which provides default permissions</li>
              <li>Groups they belong to - which can grant additional permissions</li>
            </ul>
            <p className="text-sm text-info-800 dark:text-info-200 mt-2">
              To manage user permissions, you can add users to groups with the appropriate permissions, 
              or change their role. Direct user permission management will be available soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
