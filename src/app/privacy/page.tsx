import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: `Privacy Policy | ${APP_CONFIG.name}`,
  description: `Read the Privacy Policy for ${APP_CONFIG.name}. Learn how we collect, use, and protect your personal data in accordance with GDPR and German data protection laws.`,
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
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
                Privacy Policy
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-2">
                Compliant with GDPR (EU) and BDSG (Germany)
              </p>
            </div>

            {/* Content Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-12">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                {/* Introduction */}
                <section className="mb-8">
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    At {APP_CONFIG.name}, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal data when you use our services, website, and applications (collectively, the "Service"). This policy is designed to comply with the General Data Protection Regulation (GDPR) (EU) 2016/679 and the German Federal Data Protection Act (Bundesdatenschutzgesetz - BDSG).
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-4">
                    By using our Service, you consent to the data practices described in this Privacy Policy. If you do not agree with the practices described in this policy, please do not use our Service.
                  </p>
                </section>

                {/* Data Controller */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    1. Data Controller
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    The data controller responsible for processing your personal data is:
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>{APP_CONFIG.name}</strong>
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Address:</strong> [Your Company Address, Germany]
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Email:</strong> privacy@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Data Protection Officer:</strong> dpo@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                  </div>
                </section>

                {/* Types of Data Collected */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    2. Types of Personal Data We Collect
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We collect and process the following categories of personal data:
                  </p>
                  
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    2.1 Data You Provide to Us
                  </h3>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Account Information:</strong> Name, email address, password (hashed), and any other information you provide when creating an account</li>
                    <li><strong>Profile Information:</strong> Additional information you choose to provide in your user profile</li>
                    <li><strong>Communication Data:</strong> Information you provide when contacting us, including support requests, feedback, or inquiries</li>
                    <li><strong>Payment Information:</strong> Billing address, payment method details (processed securely through third-party payment processors)</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    2.2 Data Collected Automatically
                  </h3>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Usage Data:</strong> Information about how you access and use our Service, including pages visited, time spent, and features used</li>
                    <li><strong>Device Information:</strong> IP address, browser type and version, device type, operating system, and unique device identifiers</li>
                    <li><strong>Log Data:</strong> Server logs, including access times, error logs, and system events</li>
                    <li><strong>Location Data:</strong> General location information derived from your IP address (country/region level)</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    2.3 Cookies and Tracking Technologies
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We use cookies and similar tracking technologies to track activity on our Service and store certain information. For detailed information about our use of cookies, please see Section 9 below.
                  </p>
                </section>

                {/* Legal Basis and Purpose */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    3. Legal Basis and Purpose of Processing
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We process your personal data based on the following legal bases under GDPR Article 6:
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    3.1 Consent (Article 6(1)(a) GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We process your personal data when you have given clear consent for specific purposes, such as:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Marketing communications and newsletters</li>
                    <li>Non-essential cookies and tracking technologies</li>
                    <li>Optional profile information</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to withdraw your consent at any time. Withdrawal of consent does not affect the lawfulness of processing based on consent before its withdrawal.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    3.2 Contract Performance (Article 6(1)(b) GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We process your personal data to perform our contract with you, including:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Creating and managing your account</li>
                    <li>Providing and maintaining our Service</li>
                    <li>Processing payments and transactions</li>
                    <li>Providing customer support</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    3.3 Legal Obligation (Article 6(1)(c) GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We process your personal data to comply with legal obligations, such as:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Tax and accounting requirements</li>
                    <li>Data retention obligations</li>
                    <li>Compliance with court orders or legal requests</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    3.4 Legitimate Interests (Article 6(1)(f) GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We process your personal data based on our legitimate interests, including:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Improving and optimizing our Service</li>
                    <li>Preventing fraud and ensuring security</li>
                    <li>Analyzing usage patterns and trends</li>
                    <li>Business administration and operations</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We always balance our legitimate interests against your rights and freedoms. You have the right to object to processing based on legitimate interests (see Section 7.5).
                  </p>
                </section>

                {/* Data Sharing */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    4. Data Sharing and Disclosure
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We may share your personal data with the following categories of recipients:
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    4.1 Service Providers
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We engage third-party service providers to perform functions on our behalf, such as:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Cloud hosting and infrastructure providers</li>
                    <li>Payment processing services</li>
                    <li>Email service providers</li>
                    <li>Analytics and monitoring services</li>
                    <li>Customer support platforms</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    These service providers are contractually bound to process your data only for specified purposes and in accordance with our instructions and applicable data protection laws.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    4.2 Legal Requirements
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We may disclose your personal data if required by law or in response to valid requests by public authorities, including:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Court orders or subpoenas</li>
                    <li>Government investigations</li>
                    <li>Regulatory compliance requirements</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3 mt-6">
                    4.3 Business Transfers
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    In the event of a merger, acquisition, or sale of assets, your personal data may be transferred to the acquiring entity, subject to the same privacy protections.
                  </p>
                </section>

                {/* International Transfers */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    5. International Data Transfers
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    Your personal data may be transferred to and processed in countries outside the European Economic Area (EEA). When we transfer data outside the EEA, we ensure appropriate safeguards are in place, including:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Standard Contractual Clauses (SCCs):</strong> Approved by the European Commission</li>
                    <li><strong>Adequacy Decisions:</strong> Transfers to countries with adequate data protection laws</li>
                    <li><strong>Binding Corporate Rules:</strong> For transfers within corporate groups</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    You have the right to obtain a copy of the safeguards we use for international transfers by contacting us at the address provided in Section 1.
                  </p>
                </section>

                {/* Data Retention */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    6. Data Retention
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We retain your personal data only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law. Our retention periods are as follows:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Account Data:</strong> Retained for the duration of your account and for 3 years after account deletion for legal and accounting purposes</li>
                    <li><strong>Transaction Data:</strong> Retained for 7 years as required by German tax and commercial law</li>
                    <li><strong>Marketing Data:</strong> Retained until you withdraw consent or unsubscribe</li>
                    <li><strong>Log Data:</strong> Retained for 12 months for security and troubleshooting purposes</li>
                    <li><strong>Support Communications:</strong> Retained for 3 years after the resolution of your inquiry</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    After the retention period expires, we will securely delete or anonymize your personal data in accordance with applicable laws.
                  </p>
                </section>

                {/* Data Subject Rights */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    7. Your Rights Under GDPR
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    As a data subject, you have the following rights regarding your personal data:
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.1 Right of Access (Article 15 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to obtain confirmation as to whether we process your personal data and, if so, to access that data and receive a copy of it, along with information about the processing.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.2 Right to Rectification (Article 16 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to request correction of inaccurate or incomplete personal data.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.3 Right to Erasure ("Right to be Forgotten") (Article 17 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to request deletion of your personal data when:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>The data is no longer necessary for the original purpose</li>
                    <li>You withdraw consent and there is no other legal basis</li>
                    <li>You object to processing and there are no overriding legitimate grounds</li>
                    <li>The data has been unlawfully processed</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.4 Right to Restrict Processing (Article 18 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to request restriction of processing in certain circumstances, such as when you contest the accuracy of the data or object to processing.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.5 Right to Object (Article 21 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to object to processing of your personal data based on legitimate interests or for direct marketing purposes.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.6 Right to Data Portability (Article 20 GDPR)
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You have the right to receive your personal data in a structured, commonly used, and machine-readable format and to transmit that data to another controller.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.7 Right to Withdraw Consent
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    Where processing is based on consent, you have the right to withdraw your consent at any time. This does not affect the lawfulness of processing before withdrawal.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    7.8 Exercising Your Rights
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    To exercise any of these rights, please contact us at:
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>Email:</strong> privacy@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Subject Line:</strong> "GDPR Data Subject Request"
                    </p>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-4">
                    We will respond to your request within one month (or two months for complex requests) in accordance with GDPR requirements. We may request verification of your identity before processing your request.
                  </p>
                </section>

                {/* Automated Decision-Making */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    8. Automated Decision-Making and Profiling
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We do not use automated decision-making, including profiling, that produces legal effects concerning you or similarly significantly affects you, unless:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>It is necessary for entering into or performing a contract</li>
                    <li>It is authorized by EU or Member State law</li>
                    <li>You have given explicit consent</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    If we implement automated decision-making in the future, we will inform you and provide you with the right to human intervention, to express your point of view, and to contest the decision.
                  </p>
                </section>

                {/* Cookies */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    9. Cookies and Tracking Technologies
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We use cookies and similar tracking technologies to collect and store information about your preferences and activity on our Service.
                  </p>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    9.1 Types of Cookies We Use
                  </h3>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Essential Cookies:</strong> Required for the Service to function properly (e.g., authentication, security)</li>
                    <li><strong>Functional Cookies:</strong> Enhance functionality and personalization (e.g., language preferences)</li>
                    <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our Service</li>
                    <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements (only with your consent)</li>
                  </ul>

                  <h3 className="text-xl font-semibold text-neutral-900 mb-3 mt-6">
                    9.2 Managing Cookies
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    You can control and manage cookies through your browser settings. However, disabling certain cookies may affect the functionality of our Service. You can also manage your cookie preferences through our cookie consent banner.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    For more information about our use of cookies, please see our Cookie Policy (if applicable) or contact us at privacy@{APP_CONFIG.name.toLowerCase()}.com.
                  </p>
                </section>

                {/* Security */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    10. Data Security
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction, including:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                    <li>Regular security assessments and penetration testing</li>
                    <li>Access controls and authentication mechanisms</li>
                    <li>Employee training on data protection</li>
                    <li>Regular backups and disaster recovery procedures</li>
                    <li>Secure coding practices and vulnerability management</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Despite our efforts, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee absolute security.
                  </p>
                </section>

                {/* Children's Privacy */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    11. Children's Privacy
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    Our Service is not intended for individuals under the age of 16 (or the age of digital consent in your jurisdiction). We do not knowingly collect personal data from children without parental consent.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    If we become aware that we have collected personal data from a child without parental consent, we will take steps to delete that information. If you believe we have collected information from a child, please contact us immediately.
                  </p>
                </section>

                {/* Changes to Policy */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    12. Changes to This Privacy Policy
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Posting the updated policy on this page with a new "Last updated" date</li>
                    <li>Sending an email notification to registered users (for significant changes)</li>
                    <li>Displaying a prominent notice on our Service</li>
                  </ul>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We encourage you to review this Privacy Policy periodically to stay informed about how we protect your personal data.
                  </p>
                </section>

                {/* Complaints */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    13. Right to Lodge a Complaint
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    If you believe that our processing of your personal data violates applicable data protection laws, you have the right to lodge a complaint with a supervisory authority, in particular in the Member State of your habitual residence, place of work, or place of the alleged infringement.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    In Germany, the relevant supervisory authority is:
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>Die Bundesbeauftragte für den Datenschutz und die Informationsfreiheit</strong>
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Website:</strong> <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">www.bfdi.bund.de</a>
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Email:</strong> poststelle@bfdi.bund.de
                    </p>
                  </div>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-4">
                    However, we encourage you to contact us first at privacy@{APP_CONFIG.name.toLowerCase()}.com so we can address your concerns directly.
                  </p>
                </section>

                {/* Contact */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    14. Contact Us
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>Data Controller:</strong> {APP_CONFIG.name}
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Email:</strong> privacy@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Data Protection Officer:</strong> dpo@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Address:</strong> [Your Company Address, Germany]
                    </p>
                  </div>
                </section>

                {/* Acknowledgment */}
                <section className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm italic">
                    By using {APP_CONFIG.name}, you acknowledge that you have read and understood this Privacy Policy and consent to the collection, use, and disclosure of your personal data as described herein, in accordance with GDPR and German data protection laws.
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

