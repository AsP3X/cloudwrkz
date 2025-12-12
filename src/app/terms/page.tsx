import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { isDatabaseAccessible } from "@/lib/utils/db-health";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Terms and Conditions | ${APP_CONFIG.name}`,
  description: `Read the Terms and Conditions for ${APP_CONFIG.name}. Understand your rights and responsibilities when using our service.`,
};

export default async function TermsPage() {
  // Check database availability
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  return (
    <>
      <Header databaseAvailable={databaseAvailable} />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16 pb-20">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <Link
                href={ROUTES.HOME}
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

            {/* Content Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-12">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                {/* Introduction */}
                <section className="mb-8">
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Welcome to {APP_CONFIG.name}. These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of our services, website, and applications (collectively, the &quot;Service&quot;). By accessing or using our Service, you agree to be bound by these Terms.
                  </p>
                </section>

                {/* Acceptance of Terms */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    1. Acceptance of Terms
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    By accessing or using {APP_CONFIG.name}, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree with any part of these Terms, you must not use our Service.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We reserve the right to modify these Terms at any time. We will notify users of any material changes by posting the new Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.
                  </p>
                </section>

                {/* Description of Service */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    2. Description of Service
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    {APP_CONFIG.name} provides a platform for [describe your service]. We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We do not guarantee that the Service will be available at all times or that it will be free from errors, viruses, or other harmful components. You are responsible for implementing sufficient procedures and checkpoints to satisfy your particular requirements.
                  </p>
                </section>

                {/* User Accounts */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    3. User Accounts
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    To access certain features of the Service, you may be required to create an account. You agree to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Provide accurate, current, and complete information during registration</li>
                    <li>Maintain and promptly update your account information</li>
                    <li>Maintain the security of your password and identification</li>
                    <li>Accept all responsibility for activities that occur under your account</li>
                    <li>Notify us immediately of any unauthorized use of your account</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We reserve the right to suspend or terminate your account if any information provided is inaccurate, not current, or incomplete, or if we have reasonable grounds to suspect that such information is inaccurate, not current, or incomplete.
                  </p>
                </section>

                {/* User Conduct */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    4. User Conduct
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You agree not to use the Service to:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Violate any applicable laws or regulations</li>
                    <li>Infringe upon the rights of others, including intellectual property rights</li>
                    <li>Transmit any harmful, offensive, or inappropriate content</li>
                    <li>Attempt to gain unauthorized access to the Service or related systems</li>
                    <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                    <li>Use automated systems to access the Service without authorization</li>
                    <li>Impersonate any person or entity or misrepresent your affiliation</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Violation of these terms may result in immediate termination of your account and access to the Service.
                  </p>
                </section>

                {/* Intellectual Property */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    5. Intellectual Property Rights
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    The Service and its original content, features, and functionality are owned by {APP_CONFIG.name} and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You may not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any of the material on our Service without our prior written consent.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    If you provide us with feedback, suggestions, or ideas about the Service, you agree that we may use such feedback without restriction and without obligation to compensate you.
                  </p>
                </section>

                {/* Privacy */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    6. Privacy
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand our practices regarding the collection and use of your information.
                  </p>
                </section>

                {/* Payment Terms */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    7. Payment Terms
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    If you purchase a subscription or other paid service, you agree to pay all fees associated with your account. All fees are non-refundable unless otherwise stated or required by law.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We reserve the right to change our pricing with reasonable notice. Your continued use of paid services after a price change constitutes acceptance of the new pricing.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    You are responsible for any taxes applicable to your use of the Service.
                  </p>
                </section>

                {/* Termination */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    8. Termination
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Upon termination, your right to use the Service will immediately cease. All provisions of these Terms that by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, and limitations of liability.
                  </p>
                </section>

                {/* Disclaimer of Warranties */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    9. Disclaimer of Warranties
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We do not warrant that the Service will be uninterrupted, secure, or error-free, or that defects will be corrected. We do not warrant or make any representations regarding the use or results of the Service in terms of accuracy, reliability, or otherwise.
                  </p>
                </section>

                {/* Limitation of Liability */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    10. Limitation of Liability
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, {APP_CONFIG.name} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Our total liability for any claims arising from or related to the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
                  </p>
                </section>

                {/* Indemnification */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    11. Indemnification
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    You agree to indemnify, defend, and hold harmless {APP_CONFIG.name}, its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorneys&apos; fees, arising out of or in any way connected with your access to or use of the Service, your violation of these Terms, or your violation of any rights of another.
                  </p>
                </section>

                {/* Governing Law */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    12. Governing Law
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts in [Your Jurisdiction].
                  </p>
                </section>

                {/* Changes to Terms */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    13. Changes to Terms
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
                  </p>
                </section>

                {/* Contact Information */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    14. Contact Us
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    If you have any questions about these Terms, please contact us at:
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>Email:</strong> legal@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 mt-2">
                      <strong>Address:</strong> [Your Company Address]
                    </p>
                  </div>
                </section>

                {/* Acknowledgment */}
                <section className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm italic">
                    By using {APP_CONFIG.name}, you acknowledge that you have read these Terms and Conditions and agree to be bound by them.
                  </p>
                </section>
              </div>
            </div>

            {/* Back to Home Link */}
            <div className="mt-8 text-center">
              <Link
                href={ROUTES.HOME}
                className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
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

