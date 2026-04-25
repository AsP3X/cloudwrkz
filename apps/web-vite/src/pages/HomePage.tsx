import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/features/landing/Hero";
import { Features } from "@/features/landing/Features";
import { CTA } from "@/features/landing/CTA";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { useAuth } from "@/components/providers/AuthProvider";
import { ROUTES } from "@/lib/constants/routes";

// Human: Primary landing route that immediately sends authenticated (or connection-ready) users into the dashboard.
// Agent: READS useAuth(user,loading,needsConnection); NAVIGATE ROUTES.DASHBOARD on success; SHOWS spinner while loading.

export default function HomePage() {
  const { user, loading, needsConnection } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
    if (!loading && !user && needsConnection) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [user, loading, needsConnection, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <svg
          className="h-10 w-10 animate-spin text-primary-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  return (
    <>
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex min-h-screen flex-col">
        <MouseSpotlightSurface variant="about" className="flex w-full min-h-0 flex-1 flex-col">
          <Hero />
          <Features />
        </MouseSpotlightSurface>
        <CTA className="relative z-10 rounded-t-3xl shadow-[0_-16px_48px_-20px_rgba(0,0,0,0.2)] dark:shadow-[0_-16px_48px_-20px_rgba(0,0,0,0.45)]" />
      </main>
      <Footer />
    </>
  );
}
