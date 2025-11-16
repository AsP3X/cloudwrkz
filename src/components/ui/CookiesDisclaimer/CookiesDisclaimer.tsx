"use client";

import React, { useState, useEffect } from "react";
import { Button } from "../Button";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { cn } from "@/lib/utils/cn";
import {
  acceptCookieConsent,
  checkCookieConsent,
} from "@/server/actions/cookie-consent";
import type { CookiesDisclaimerProps } from "./CookiesDisclaimer.types";

const COOKIE_CONSENT_KEY = "cookie-consent-accepted";

/**
 * CookiesDisclaimer component that displays a cookie consent banner
 * on first visit. For logged-in users, stores consent in the database.
 * For non-logged-in users, uses localStorage.
 */
export const CookiesDisclaimer: React.FC<CookiesDisclaimerProps> = ({
  message = "We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic. By clicking 'Accept', you consent to our use of cookies.",
  acceptButtonText = "Accept",
  privacyPolicyLink,
  onAccept,
}) => {
  // localStorage hook for non-logged-in users only
  const [hasAcceptedInLocalStorage, setHasAcceptedInLocalStorage] = useLocalStorage<boolean>(
    COOKIE_CONSENT_KEY,
    false
  );
  const [hasAccepted, setHasAccepted] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let isMounted = true;

    // Check if user is logged in and has accepted cookies
    // Priority: Database (for logged-in users) -> localStorage (for non-logged-in users)
    const checkUserConsent = async () => {
      try {
        const result = await checkCookieConsent();

        if (!isMounted) return;

        if (result === null) {
          // User is not logged in, use localStorage only
          setIsUserLoggedIn(false);
          const accepted = hasAcceptedInLocalStorage;
          setHasAccepted(accepted);
          setIsLoading(false);
          
          if (!accepted) {
            timer = setTimeout(() => {
              if (isMounted) {
                setIsVisible(true);
                setIsAnimating(true);
              }
            }, 100);
          }
        } else if (result.success) {
          // User is logged in - use database only (ignore localStorage)
          setIsUserLoggedIn(true);
          const accepted = result.accepted;
          setHasAccepted(accepted);
          setIsLoading(false);
          
          // Sync database state to localStorage for consistency
          if (accepted) {
            setHasAcceptedInLocalStorage(true);
          }
          
          if (!accepted) {
            // User is logged in but hasn't accepted yet - show banner
            timer = setTimeout(() => {
              if (isMounted) {
                setIsVisible(true);
                setIsAnimating(true);
              }
            }, 100);
          }
        } else {
          // Error checking consent, fall back to localStorage
          setIsUserLoggedIn(false);
          const accepted = hasAcceptedInLocalStorage;
          setHasAccepted(accepted);
          setIsLoading(false);
          
          if (!accepted) {
            timer = setTimeout(() => {
              if (isMounted) {
                setIsVisible(true);
                setIsAnimating(true);
              }
            }, 100);
          }
        }
      } catch (error) {
        console.error("Error checking cookie consent:", error);
        // Fall back to localStorage on error
        if (!isMounted) return;
        setIsUserLoggedIn(false);
        const accepted = hasAcceptedInLocalStorage;
        setHasAccepted(accepted);
        setIsLoading(false);
        
        if (!accepted) {
          timer = setTimeout(() => {
            if (isMounted) {
              setIsVisible(true);
              setIsAnimating(true);
            }
          }, 100);
        }
      }
    };

    checkUserConsent();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [hasAcceptedInLocalStorage, setHasAcceptedInLocalStorage]);

  const handleAccept = async () => {
    setIsAnimating(false);

    try {
      if (isUserLoggedIn) {
        // User is logged in - save to database first
        const result = await acceptCookieConsent();
        if (result.success) {
          // Save to database successful - update state and sync to localStorage
          setHasAccepted(true);
          setHasAcceptedInLocalStorage(true);
          
          // Wait for animation to complete before hiding
          setTimeout(() => {
            setIsVisible(false);
            onAccept?.();
          }, 300);
        } else {
          // If database save fails, don't save anywhere (show error or retry)
          console.error("Failed to save cookie consent to database:", result.error);
          // Reset animation state to show banner again
          setIsAnimating(true);
        }
      } else {
        // User is not logged in - save to localStorage only
        setHasAcceptedInLocalStorage(true);
        setHasAccepted(true);
        
        setTimeout(() => {
          setIsVisible(false);
          onAccept?.();
        }, 300);
      }
    } catch (error) {
      console.error("Error accepting cookie consent:", error);
      // On error, reset animation to show banner again
      setIsAnimating(true);
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

