"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { useDatabaseHealth } from "@/lib/hooks/useDatabaseHealth";

interface FormBlurWrapperProps {
  children: ReactNode;
  initialDatabaseAvailable: boolean;
  formType: "login" | "register";
}

export function FormBlurWrapper({ 
  children, 
  initialDatabaseAvailable,
  formType 
}: FormBlurWrapperProps) {
  // Monitor database health in real-time
  const { status, isServerUnreachable } = useDatabaseHealth({
    pollInterval: 30000,
    initialStatus: initialDatabaseAvailable ? "healthy" : "unhealthy",
  });
  
  const isUnavailable = status === "unhealthy" || status === "loading" || isServerUnreachable;
  const formName = formType === "login" ? "login" : "registration";

  return (
    <div className="relative overflow-hidden">
      {/* Form content with heavy blur when unavailable */}
      <div className={isUnavailable ? "pointer-events-none select-none" : ""}>
        <div 
          className={isUnavailable ? "opacity-15" : ""}
          style={isUnavailable ? { 
            filter: 'blur(20px)',
            WebkitFilter: 'blur(20px)',
            transform: 'scale(0.98)'
          } : {}}
        >
          {children}
        </div>
      </div>
      
      {/* Overlay with heavy backdrop blur */}
      {isUnavailable && (
        <div 
          className="absolute inset-0 bg-white/99 dark:bg-neutral-900/99 rounded-xl z-30 flex items-center justify-center"
          style={{ 
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}
        >
          <div className="text-center p-6 max-w-sm">
            <svg
              className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Service Unavailable
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              The {formName} service is currently unavailable. Please check the{" "}
              <Link
                href="/health"
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                health status page
              </Link>{" "}
              for more information.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
