import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { LoginForm } from "@/features/auth/LoginForm";
import { RegistrationQueuedPanel } from "@/features/auth/RegistrationQueuedPanel";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { useSearchParams } from "react-router-dom";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error") ?? undefined;

  return (
    <>
      <Header />
      <main>
        <MouseSpotlightSurface
          variant="content"
          className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 pt-16 pb-20 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
        >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <Link
                to={ROUTES.HOME}
                className="inline-block mb-6 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent"
              >
                {APP_CONFIG.name}
              </Link>
              <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">
                Welcome back
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Sign in to your account to continue
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200/90 bg-white/95 p-8 shadow-soft-xl ring-1 ring-neutral-900/[0.04] backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:ring-white/[0.06]">
              <RegistrationQueuedPanel mode="resume" />
              <LoginForm initialError={error} />
            </div>

            <div className="mt-8 text-center">
              <div className="flex items-center justify-center gap-6 text-sm text-neutral-500 dark:text-neutral-400">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-success-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span>Secure</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-success-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>Encrypted</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-success-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>Fast</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </MouseSpotlightSurface>
      </main>
      <Footer />
    </>
  );
}
