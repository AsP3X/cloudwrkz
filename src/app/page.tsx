import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/features/landing/Hero";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { getCurrentUser } from "@/lib/utils/auth-server";
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
  let user = null;
  if (databaseAvailable) {
    try {
      user = await getCurrentUser();
    } catch (error) {
      // If getCurrentUser fails (e.g., database connection lost), treat as no user
      console.error("Error getting current user:", error);
      user = null;
    }
  }

  if (user) {
    redirect("/dashboard");
  }

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
