import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export default function PrivacyPage() {
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
                <h1 className="mb-3 text-3xl font-bold text-neutral-950 dark:text-neutral-50 sm:text-4xl">Privacy Policy</h1>
                <p className="text-neutral-700 dark:text-neutral-300">Last updated: December 5, 2025</p>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  Compliant with GDPR (EU) and BDSG (Germany)
                </p>
              </div>

              <div className="rounded-2xl border border-white/25 bg-white/88 p-8 shadow-soft-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55 sm:p-12">
                <div className="prose prose-neutral max-w-none dark:prose-invert">
                  <section className="mb-8">
                    <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">
                      At {APP_CONFIG.name}, we take your privacy seriously. This Privacy Policy explains how we collect, use,
                      disclose, and safeguard your personal data when you use our services, website, and applications
                      (collectively, the &quot;Service&quot;). This policy is designed to comply with the General Data Protection
                      Regulation (GDPR) (EU) 2016/679 and the German Federal Data Protection Act (Bundesdatenschutzgesetz -
                      BDSG).
                    </p>
                  </section>
                  <section className="mb-8">
                    <h2 className="mb-4 text-2xl font-bold text-neutral-950 dark:text-neutral-100">1. Data Controller</h2>
                    <p className="mb-4 leading-relaxed text-neutral-700 dark:text-neutral-300">
                      The data controller responsible for processing your personal data is:
                    </p>
                    <div className="mt-4 rounded-xl border border-neutral-200/80 bg-neutral-100/50 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="text-neutral-800 dark:text-neutral-200">
                        <strong>{APP_CONFIG.name}</strong>
                      </p>
                      <p className="mt-2 text-neutral-700 dark:text-neutral-300">
                        <strong>Email:</strong> privacy@{APP_CONFIG.name.toLowerCase()}.com
                      </p>
                    </div>
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
