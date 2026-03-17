import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/features/landing/Hero";
import { Features } from "@/features/landing/Features";
import { CTA } from "@/features/landing/CTA";
import { ScrollAnimation } from "@/features/landing/ScrollAnimation";
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
  return (
    <>
      <SkipToContent />
      <Header />
      <main id="main-content">
        <Hero />
        <Features />

        <section className="py-20 bg-white dark:bg-neutral-900" aria-label="Team section">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="text-center mb-16">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  Meet Our{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    Team
                  </span>
                </h2>
                <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
                  The passionate individuals behind {APP_CONFIG.name}, dedicated to building the future of enterprise applications.
                </p>
              </div>
            </ScrollAnimation>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {teamMembers.map((member, index) => (
                <ScrollAnimation key={member.name} direction="up" delay={index * 100}>
                  <div className="bg-white dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-300 group text-center">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden ring-4 ring-primary-100 dark:ring-primary-900 group-hover:ring-primary-200 dark:group-hover:ring-primary-800 transition-all duration-300 flex items-center justify-center bg-gradient-to-br from-primary-400 to-primary-600 text-white text-2xl font-bold">
                      {member.initials}
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                      {member.name}
                    </h3>
                    <p className="text-primary-600 dark:text-primary-400 font-medium mb-4">
                      {member.role}
                    </p>
                    <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
                      {member.bio}
                    </p>
                  </div>
                </ScrollAnimation>
              ))}
            </div>
          </div>
        </section>

        <CTA />
      </main>
      <Footer />
    </>
  );
}
