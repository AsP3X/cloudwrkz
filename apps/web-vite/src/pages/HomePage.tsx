import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/features/landing/Hero";
import { Features } from "@/features/landing/Features";
import { CTA } from "@/features/landing/CTA";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { useAuth } from "@/components/providers/AuthProvider";
import { ROUTES } from "@/lib/constants/routes";

export default function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [user, loading, navigate]);

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
      <main id="main-content">
        <Hero />
        <Features />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
