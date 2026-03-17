import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <Link
                to={ROUTES.HOME}
                className="inline-block mb-6 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
              >
                {APP_CONFIG.name}
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
                Terms and Conditions
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Last updated: December 5, 2025
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-12">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <section className="mb-8">
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Welcome to {APP_CONFIG.name}. These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of our services, website, and applications (collectively, the &quot;Service&quot;). By accessing or using our Service, you agree to be bound by these Terms.
                  </p>
                </section>
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    1. Acceptance of Terms
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    By accessing or using {APP_CONFIG.name}, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree with any part of these Terms, you must not use our Service.
                  </p>
                </section>
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    2. Description of Service
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {APP_CONFIG.name} provides a platform for enterprise applications. We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice.
                  </p>
                </section>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
