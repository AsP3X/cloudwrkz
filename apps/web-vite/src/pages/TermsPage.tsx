import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

// Human: Terms of service marketing page with structured sections and navigation back to the home route.
// Agent: STATIC legal copy; LINK ROUTES.HOME; NO runtime state beyond layout.

export default function TermsPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <MouseSpotlightSurface
          variant="content"
          className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 pt-16 pb-20 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
        >
          <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="mb-12 text-center">
                <Link
                  to={ROUTES.HOME}
                  className="mb-6 inline-block bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-2xl font-bold text-transparent dark:from-primary-400 dark:to-secondary-400"
                >
                  {APP_CONFIG.name}
                </Link>
                <h1 className="mb-3 text-3xl font-bold text-neutral-950 dark:text-neutral-50 sm:text-4xl">
                  Terms and Conditions
                </h1>
                <p className="text-neutral-700 dark:text-neutral-300">Last updated: December 5, 2025</p>
              </div>

              <div className="rounded-2xl border border-white/25 bg-white/88 p-8 shadow-soft-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55 sm:p-12">
                <div className="prose prose-neutral max-w-none dark:prose-invert">
                  <section className="mb-8">
                    <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
                      Welcome to {APP_CONFIG.name}. These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of
                      our services, website, and applications (collectively, the &quot;Service&quot;). By accessing or using our
                      Service, you agree to be bound by these Terms.
                    </p>
                  </section>
                  <section className="mb-8">
                    <h2 className="mb-4 text-2xl font-bold text-neutral-950 dark:text-neutral-100">1. Acceptance of Terms</h2>
                    <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
                      By accessing or using {APP_CONFIG.name}, you acknowledge that you have read, understood, and agree to be
                      bound by these Terms and our Privacy Policy. If you do not agree with any part of these Terms, you must not
                      use our Service.
                    </p>
                  </section>
                  <section className="mb-8">
                    <h2 className="mb-4 text-2xl font-bold text-neutral-950 dark:text-neutral-100">2. Description of Service</h2>
                    <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
                      {APP_CONFIG.name} provides a platform for enterprise applications. We reserve the right to modify, suspend,
                      or discontinue any aspect of the Service at any time, with or without notice.
                    </p>
                  </section>
                </div>
              </div>

              <div className="mt-8 text-center">
                <Link
                  to={ROUTES.HOME}
                  className="inline-flex items-center font-medium text-primary-700 transition-colors hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </MouseSpotlightSurface>
      </main>
      <Footer />
    </>
  );
}
