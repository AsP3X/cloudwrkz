import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = {
  title: `About Us | ${APP_CONFIG.name}`,
  description: `Learn more about ${APP_CONFIG.name} - our mission, vision, and the team behind building modern enterprise applications with cutting-edge technology.`,
};

export default function AboutPage() {
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
                About Us
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                Building the future of enterprise applications
              </p>
            </div>

            {/* Content Card */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-12">
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                {/* Mission */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Our Mission
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    At {APP_CONFIG.name}, we're dedicated to empowering businesses and developers with cutting-edge technology solutions that simplify complex workflows, accelerate development cycles, and drive innovation. We believe that modern applications should be powerful, scalable, and accessible to everyone.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Our mission is to bridge the gap between enterprise needs and developer productivity, creating tools that enable teams to build, deploy, and scale applications faster than ever before.
                  </p>
                </section>

                {/* Vision */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Our Vision
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We envision a world where building enterprise-grade applications is as intuitive as building a simple website. Our platform combines the reliability and security that enterprises demand with the developer experience that modern teams expect.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Through continuous innovation and a commitment to open standards, we're shaping the future of application development—making it faster, more secure, and more accessible for everyone.
                  </p>
                </section>

                {/* What We Do */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    What We Do
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    {APP_CONFIG.name} is a comprehensive platform that provides:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li><strong>Modular Architecture:</strong> Build applications using our flexible, modular system that adapts to your needs</li>
                    <li><strong>Enterprise Security:</strong> Bank-level security features with GDPR compliance and data protection built-in</li>
                    <li><strong>Developer Tools:</strong> Powerful CLI tools and APIs that streamline your development workflow</li>
                    <li><strong>Scalable Infrastructure:</strong> Cloud-native architecture that grows with your business</li>
                    <li><strong>Comprehensive Support:</strong> Expert support and documentation to help you succeed</li>
                  </ul>
                </section>

                {/* Values */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Our Values
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                        Innovation
                      </h3>
                      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        We stay at the forefront of technology, continuously exploring new ways to solve problems and improve developer experience.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                        Reliability
                      </h3>
                      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        Enterprise-grade reliability is at the core of everything we build. Your applications deserve infrastructure you can trust.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                        Security
                      </h3>
                      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        We take data protection seriously, implementing industry best practices and maintaining compliance with international standards.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                        Developer Experience
                      </h3>
                      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                        We believe great tools should be a joy to use. Every feature is designed with developers in mind, prioritizing clarity and ease of use.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Technology */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Built with Modern Technology
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    {APP_CONFIG.name} is built using the latest technologies and best practices:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-neutral-700 dark:text-neutral-300 mb-4">
                    <li>Next.js 15 for server-side rendering and optimal performance</li>
                    <li>TypeScript for type-safe, maintainable code</li>
                    <li>Prisma for robust database management</li>
                    <li>Modern authentication and authorization systems</li>
                    <li>Responsive design with Tailwind CSS</li>
                    <li>RESTful APIs and modular architecture</li>
                  </ul>
                </section>

                {/* Join Us */}
                <section className="mb-8">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Join Us on This Journey
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    Whether you're a startup looking to scale quickly or an enterprise seeking reliable infrastructure, {APP_CONFIG.name} is here to support your growth. We're committed to providing the tools, support, and innovation you need to succeed.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Ready to get started? <Link href={ROUTES.REGISTER} className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-semibold">Sign up for free</Link> and experience the power of modern application development.
                  </p>
                </section>

                {/* Contact */}
                <section className="mt-12 pt-8 border-t border-neutral-200 dark:border-neutral-800">
                  <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Get in Touch
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    Have questions or want to learn more? We'd love to hear from you.
                  </p>
                  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <strong>Email:</strong> contact@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300 mt-2">
                      <strong>Support:</strong> support@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                  </div>
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
