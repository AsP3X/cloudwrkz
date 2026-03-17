import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/features/landing/Hero";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { getCurrentUser, DatabaseConnectionError } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { APP_CONFIG } from "@/lib/constants/config";
import { isDatabaseAccessible } from "@/lib/utils/db-health";
import { LandingPageClient } from "@/components/features/landing/LandingPageClient";

// Lazy load below-the-fold components for better performance
const Features = dynamicImport(() => import("@/components/features/landing/Features").then((mod) => ({ default: mod.Features })), {
  ssr: true,
  loading: () => <div className="min-h-[600px]" />,
});

const CTA = dynamicImport(() => import("@/components/features/landing/CTA").then((mod) => ({ default: mod.CTA })), {
  ssr: true,
  loading: () => <div className="min-h-[400px]" />,
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Home | ${APP_CONFIG.name}`,
  description: APP_CONFIG.description,
  openGraph: {
    title: APP_CONFIG.name,
    description: APP_CONFIG.description,
    type: "website",
    siteName: APP_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: APP_CONFIG.name,
    description: APP_CONFIG.description,
  },
};

export default async function Home() {
  // Check database availability FIRST before attempting any database operations
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  // Only try to get current user if database is available
  // If database is unavailable, we should still show the landing page gracefully
  // Don't redirect if database check fails - let the user see the landing page with error banner
  let user = null;
  if (databaseAvailable) {
    try {
      user = await getCurrentUser();
    } catch (error) {
      // If getCurrentUser fails (e.g., database connection lost), treat as no user
      // Don't redirect - show landing page with error banner instead
      if (error instanceof DatabaseConnectionError) {
        // Database connection error - mark as unavailable and show banner
        console.error("Database connection error getting user:", error);
        databaseAvailable = false;
      } else {
        // Other error - log but don't crash
        console.error("Error getting current user:", error);
      }
      user = null;
    }
  }

  // Only redirect if we successfully got a user AND database is available
  // This prevents redirects when database is down, which would make the page inaccessible
  // Never redirect if database is unavailable - always show landing page with error banner
  if (user && databaseAvailable) {
    redirect("/dashboard");
  }
  
  // If database is unavailable, always show landing page (never redirect or crash)
  // The DatabaseWarning banner will be displayed by the Header component

  return (
    <>
      <SkipToContent />
      <LandingPageClient initialDatabaseAvailable={databaseAvailable}>
        <Header databaseAvailable={databaseAvailable} />
        <main id="main-content">
          <Hero />
          <Features />
          <CTA />
        </main>
        <Footer />
      </LandingPageClient>
    </>
  );
}
