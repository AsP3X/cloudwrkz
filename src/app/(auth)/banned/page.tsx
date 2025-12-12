import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BannedUserPage } from "@/components/features/auth/BannedUserPage";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { getBannedUserInfo } from "@/lib/utils/auth-server";
import { getPendingUnbanRequest } from "@/server/actions/unban";
import { redirect } from "next/navigation";
import { isDatabaseAccessible } from "@/lib/utils/db-health";

export default async function BannedPage() {
  // Check database availability FIRST before attempting any database operations
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  // Only try to get banned user info if database is available
  let userInfo = null;
  if (databaseAvailable) {
    try {
      userInfo = await getBannedUserInfo();
    } catch (error) {
      console.error("Error getting banned user info:", error);
      userInfo = null;
    }
  }

  // If user is not banned or not logged in, redirect to login
  if (!userInfo) {
    redirect(ROUTES.LOGIN);
  }

  // Get pending unban request if one exists (only if database is available)
  let pendingRequest = null;
  if (databaseAvailable) {
    try {
      pendingRequest = await getPendingUnbanRequest();
    } catch (error) {
      console.error("Error getting pending unban request:", error);
      pendingRequest = null;
    }
  }

  return (
    <>
      <Header databaseAvailable={databaseAvailable} />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-error-200 dark:bg-error-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-error-200 dark:bg-error-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <Link
                href={ROUTES.HOME}
                className="inline-block mb-6 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent"
              >
                {APP_CONFIG.name}
              </Link>
            </div>

            {/* Banned User Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8">
              <BannedUserPage userInfo={userInfo} pendingRequest={pendingRequest} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
