import { useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { CTA } from "@/features/landing/CTA";
import { AboutPageExperience } from "@/features/about/AboutPageExperience";
import { SkipToContent } from "@/components/ui/SkipToContent";
import { APP_CONFIG } from "@/lib/constants/config";

const teamMembers = [
  { name: "Alex Johnson", role: "CEO & Founder", bio: "Visionary leader with 15+ years of experience in enterprise software development.", initials: "AJ" },
  { name: "Sarah Chen", role: "CTO", bio: "Full-stack architect passionate about building scalable, maintainable systems.", initials: "SC" },
  { name: "Michael Rodriguez", role: "Lead Developer", bio: "TypeScript enthusiast and open-source contributor focused on developer experience.", initials: "MR" },
  { name: "Emily Watson", role: "Product Designer", bio: "Creating beautiful, intuitive interfaces that users love to interact with.", initials: "EW" },
  { name: "David Kim", role: "DevOps Engineer", bio: "Infrastructure expert ensuring 99.9% uptime and seamless deployments.", initials: "DK" },
  { name: "Lisa Anderson", role: "Head of Support", bio: "Dedicated to providing exceptional customer service and technical support.", initials: "LA" },
];

export default function AboutPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `About Us | ${APP_CONFIG.name}`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <>
      <SkipToContent />
      <Header />
      <main id="main-content" className="flex min-h-screen flex-col">
        <MouseSpotlightSurface variant="about" className="flex w-full min-h-0 flex-1 flex-col">
          <AboutPageExperience teamMembers={teamMembers} />
        </MouseSpotlightSurface>
        <CTA className="relative z-10 rounded-t-3xl shadow-[0_-16px_48px_-20px_rgba(0,0,0,0.2)] dark:shadow-[0_-16px_48px_-20px_rgba(0,0,0,0.45)]" />
      </main>
      <Footer />
    </>
  );
}
