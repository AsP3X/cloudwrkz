import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/features/landing/Hero";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";
import { APP_CONFIG } from "@/lib/constants/config";

// Lazy load below-the-fold components for better performance
const Features = dynamic(() => import("@/components/features/landing/Features").then((mod) => ({ default: mod.Features })), {
  ssr: true,
  loading: () => <div className="min-h-[600px]" />,
});

const CTA = dynamic(() => import("@/components/features/landing/CTA").then((mod) => ({ default: mod.CTA })), {
  ssr: true,
  loading: () => <div className="min-h-[400px]" />,
});

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
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
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
