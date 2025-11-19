"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../Button";
import { cn } from "@/lib/utils/cn";
import type { CookiesDisclaimerProps } from "./CookiesDisclaimer.types";

/**
 * Helper function to call server actions with retry logic for stale action errors
 */
async function callServerActionWithRetry<T>(
  actionFn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await actionFn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's an UnrecognizedActionError
      const isUnrecognizedActionError = 
        error?.name === "UnrecognizedActionError" ||
        error?.message?.includes("was not found on the server") ||
        error?.message?.includes("Server Action") ||
        error?.message?.includes("does not exist");
      
      if (isUnrecognizedActionError && attempt < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        // Force a fresh import by invalidating the module cache
        // This is done by importing with a cache-busting query parameter
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * CookiesDisclaimer component that displays a cookie consent banner
 * on first visit. For logged-in users, stores consent in the database.
 * For non-logged-in users, uses cookies.
 */
export const CookiesDisclaimer: React.FC<CookiesDisclaimerProps> = ({
  message = "We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking 'Accept', you consent to our use of cookies.",
  acceptButtonText = "Accept",
  privacyPolicyLink,
  onAccept,
}) => {
  const router = useRouter();
  const hasRefreshedRef = useRef(false);
  const [hasAccepted, setHasAccepted] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let isMounted = true;

    // Check if user is logged in and has accepted cookies
    // Priority: Database (for logged-in users) -> Cookies (for non-logged-in users)
    const checkUserConsent = async () => {
      try {
        // Dynamically import to avoid stale server action references
        // Use callServerActionWithRetry to handle stale action errors
        const result = await callServerActionWithRetry(async () => {
          const { checkCookieConsent } = await import("@/server/actions/cookie-consent");
          return await checkCookieConsent();
        });

        if (!isMounted) return;

        if (result.success) {
          const accepted = result.accepted;
          setHasAccepted(accepted);
          setIsLoading(false);
          setIsUserLoggedIn(result.isLoggedIn);
          
          if (!accepted) {
            // User hasn't accepted yet - show banner
            timer = setTimeout(() => {
              if (isMounted) {
                setIsVisible(true);
                setIsAnimating(true);
              }
            }, 100);
          }
        } else {
          // Error checking consent - show banner to allow user to accept
          setIsUserLoggedIn(false);
          setHasAccepted(false);
          setIsLoading(false);
          
          timer = setTimeout(() => {
            if (isMounted) {
              setIsVisible(true);
              setIsAnimating(true);
            }
          }, 100);
        }
      } catch (error: any) {
        console.error("Error checking cookie consent:", error);
        
        // Handle UnrecognizedActionError specifically
        const isUnrecognizedActionError = 
          error?.name === "UnrecognizedActionError" ||
          error?.message?.includes("was not found on the server") ||
          error?.message?.includes("Server Action");
        
        if (isUnrecognizedActionError && !hasRefreshedRef.current) {
          console.warn("Server action unavailable (stale reference), refreshing to get fresh actions");
          // Refresh router to get fresh server actions (only once)
          hasRefreshedRef.current = true;
          router.refresh();
        }
        
        // On error, show banner to allow user to accept
        if (!isMounted) return;
        setIsUserLoggedIn(false);
        setHasAccepted(false);
        setIsLoading(false);
        
        timer = setTimeout(() => {
          if (isMounted) {
            setIsVisible(true);
            setIsAnimating(true);
          }
        }, 100);
      }
    };

    checkUserConsent();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleAccept = async () => {
    setIsAnimating(false);

    try {
      let result;
      
      // Check if user is logged in first with retry logic
      const checkResult = await callServerActionWithRetry(async () => {
        const { checkCookieConsent } = await import("@/server/actions/cookie-consent");
        return await checkCookieConsent();
      });
      
      const isLoggedIn = checkResult?.success && checkResult.isLoggedIn === true;
      
      if (isLoggedIn) {
        // User is logged in - save to database with retry logic
        result = await callServerActionWithRetry(async () => {
          const { acceptCookieConsent } = await import("@/server/actions/cookie-consent");
          return await acceptCookieConsent();
        });
      } else {
        // User is not logged in - save to cookie with retry logic
        result = await callServerActionWithRetry(async () => {
          const { acceptCookieConsentForGuest } = await import("@/server/actions/cookie-consent");
          return await acceptCookieConsentForGuest();
        });
      }
      
      if (result.success) {
        // Save successful - update state
        setHasAccepted(true);
        setIsUserLoggedIn(isLoggedIn ?? false);
        
        // Wait for animation to complete before hiding
        setTimeout(() => {
          setIsVisible(false);
          onAccept?.();
        }, 300);
      } else {
        // If save fails, show error and reset animation
        console.error("Failed to save cookie consent:", result.error);
        setIsAnimating(true);
      }
    } catch (error: any) {
      console.error("Error accepting cookie consent:", error);
      
      // Handle UnrecognizedActionError specifically
      const isUnrecognizedActionError = 
        error?.name === "UnrecognizedActionError" ||
        error?.message?.includes("was not found on the server") ||
        error?.message?.includes("Server Action");
      
      if (isUnrecognizedActionError) {
        console.warn("Server action unavailable (stale reference), refreshing to get fresh actions");
        // On stale action error, refresh the router to get fresh server actions
        // This will re-fetch the action manifest without a full page reload
        setIsAnimating(true);
        // Refresh router to get fresh server actions (only if not already refreshed)
        if (!hasRefreshedRef.current) {
          hasRefreshedRef.current = true;
          router.refresh();
        }
        // Show banner again after a short delay
        setTimeout(() => {
          setIsAnimating(true);
        }, 500);
      } else {
        // On other errors, reset animation to show banner again
        setIsAnimating(true);
      }
    }
  };

  // Don't render while loading or if already accepted
  if (isLoading || !isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 w-full transition-all duration-300 ease-in-out",
        isAnimating
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0"
      )}
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-primary-50/30 to-secondary-50/20 dark:from-neutral-900 dark:via-primary-900/30 dark:to-secondary-900/20 border border-primary-200/50 dark:border-primary-800/50 shadow-[0_-4px_24px_rgba(0,0,0,0.15),0_-8px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.5),0_-8px_48px_rgba(0,0,0,0.4)] backdrop-blur-sm">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          {/* Content */}
          <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            {/* Icon and text section */}
            <div className="flex flex-1 items-start gap-4">
              {/* Cookie Icon */}
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 dark:from-primary-400 dark:to-secondary-400 shadow-lg ring-2 ring-primary-200/50 dark:ring-primary-800/50">
                  <svg
                    className="h-7 w-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    {/* Cookie base */}
                    <circle cx="12" cy="12" r="10" fill="#F4D03F" stroke="#D4A017" strokeWidth="1.5" />
                    {/* Chocolate chips */}
                    <circle cx="9" cy="9" r="1.5" fill="#8B4513" />
                    <circle cx="15" cy="9" r="1.5" fill="#8B4513" />
                    <circle cx="12" cy="12" r="1.5" fill="#8B4513" />
                    <circle cx="8" cy="14" r="1" fill="#8B4513" />
                    <circle cx="16" cy="14" r="1" fill="#8B4513" />
                    <circle cx="10" cy="16" r="1" fill="#8B4513" />
                    <circle cx="14" cy="16" r="1" fill="#8B4513" />
                  </svg>
                </div>
              </div>

              {/* Text content */}
              <div className="flex-1">
                <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100 sm:text-lg">
                  Cookie Preferences
                </h3>
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-base">
                  {message}
                  {privacyPolicyLink && (
                    <>
                      {" "}
                      <a
                        href={privacyPolicyLink}
                        className="font-semibold text-primary-600 dark:text-primary-400 transition-colors hover:text-primary-700 dark:hover:text-primary-300 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 rounded"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Learn more
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Button section */}
            <div className="flex flex-shrink-0 items-center gap-3 sm:flex-col sm:items-stretch">
              <Button
                variant="primary"
                size="lg"
                onClick={handleAccept}
                className="w-full min-w-[120px] shadow-md transition-all hover:shadow-lg hover:scale-105 active:scale-95 sm:w-auto"
              >
                {acceptButtonText}
              </Button>
            </div>
          </div>

          {/* Bottom accent line */}
          <div className="h-1 bg-gradient-to-r from-primary-500 via-secondary-500 to-primary-500 dark:from-primary-400 dark:via-secondary-400 dark:to-primary-400" />
        </div>
      </div>
    </div>
  );
};

