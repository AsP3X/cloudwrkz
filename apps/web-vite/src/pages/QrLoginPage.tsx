import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Page reached when the QR code URL is opened in a browser (e.g. after scanning with a generic camera).
 * The Cloudwrkz app scans the QR and uses the requestId to call the approve API; it does not open this URL.
 */
export default function QrLoginPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20 flex flex-col items-center justify-center">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary-600 dark:text-primary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              QR code sign-in
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-6">
              This link is used by the {APP_CONFIG.name} app to sign you in. Open the{" "}
              <Link
                to={ROUTES.LOGIN}
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                login page
              </Link>
              , choose &quot;Sign in with QR code&quot;, then scan the code with the {APP_CONFIG.name} app (Profile menu → Login with QR code).
            </p>
            <Link
              to={ROUTES.LOGIN}
              className="inline-flex items-center justify-center rounded-lg bg-primary-600 dark:bg-primary-500 text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors"
            >
              Go to login
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
