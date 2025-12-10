import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";
import { ScrollAnimation } from "@/components/features/landing/ScrollAnimation";

export const metadata: Metadata = {
  title: `About Us | ${APP_CONFIG.name}`,
  description: `Learn more about ${APP_CONFIG.name} - our mission, vision, and the team behind building modern enterprise applications with cutting-edge technology.`,
};

export default function AboutPage() {
  const values = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      title: "Innovation",
      description: "We stay at the forefront of technology, continuously exploring new ways to solve problems and improve developer experience.",
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: "Reliability",
      description: "Enterprise-grade reliability is at the core of everything we build. Your applications deserve infrastructure you can trust.",
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: "Security",
      description: "We take data protection seriously, implementing industry best practices and maintaining compliance with international standards.",
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      title: "Developer Experience",
      description: "We believe great tools should be a joy to use. Every feature is designed with developers in mind, prioritizing clarity and ease of use.",
    },
  ];

  const features = [
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      ),
      title: "Modular Architecture",
      description: "Build applications using our flexible, modular system that adapts to your needs",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: "Enterprise Security",
      description: "Bank-level security features with GDPR compliance and data protection built-in",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      title: "Developer Tools",
      description: "Powerful CLI tools and APIs that streamline your development workflow",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      title: "Scalable Infrastructure",
      description: "Cloud-native architecture that grows with your business",
    },
    {
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      title: "Comprehensive Support",
      description: "Expert support and documentation to help you succeed",
    },
  ];

  const technologies = [
    "Next.js 15",
    "TypeScript",
    "Prisma",
    "Tailwind CSS",
    "React",
    "PostgreSQL",
  ];

  const stats = [
    { value: "99.9%", label: "Uptime" },
    { value: "10x", label: "Faster Development" },
    { value: "24/7", label: "Support" },
    { value: "100%", label: "Open Source" },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 sm:py-28">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-20 left-10 w-96 h-96 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-30 dark:opacity-5 animate-pulse" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-30 dark:opacity-5 animate-pulse-delay-700" />
          </div>

          <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="text-center max-w-4xl mx-auto">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-neutral-900 dark:text-neutral-100 mb-6 leading-tight">
                  About{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    {APP_CONFIG.name}
                  </span>
                </h1>
                <p className="text-xl sm:text-2xl text-neutral-600 dark:text-neutral-400 mb-8 leading-relaxed">
                  Building the future of enterprise applications with cutting-edge technology and unwavering commitment to excellence.
                </p>
              </div>
            </ScrollAnimation>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-12 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm border-y border-neutral-200 dark:border-neutral-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <ScrollAnimation key={index} direction="up" delay={index * 100}>
                  <div className="text-center">
                    <div className="text-4xl sm:text-5xl font-bold text-primary-600 dark:text-primary-400 mb-2">
                      {stat.value}
                    </div>
                    <div className="text-neutral-600 dark:text-neutral-400 font-medium">
                      {stat.label}
                    </div>
                  </div>
                </ScrollAnimation>
              ))}
            </div>
          </div>
        </section>

        {/* Mission & Vision Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* Mission */}
              <ScrollAnimation direction="right" delay={0}>
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-10 hover:shadow-soft-xl transition-shadow duration-300">
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-6">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Our Mission
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    At {APP_CONFIG.name}, we&apos;re dedicated to empowering businesses and developers with cutting-edge technology solutions that simplify complex workflows, accelerate development cycles, and drive innovation.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    We believe that modern applications should be powerful, scalable, and accessible to everyone. Our mission is to bridge the gap between enterprise needs and developer productivity.
                  </p>
                </div>
              </ScrollAnimation>

              {/* Vision */}
              <ScrollAnimation direction="left" delay={100}>
                <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-soft-lg border border-neutral-200 dark:border-neutral-800 p-8 sm:p-10 hover:shadow-soft-xl transition-shadow duration-300">
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-secondary-100 to-secondary-200 dark:from-secondary-900 dark:to-secondary-800 flex items-center justify-center text-secondary-600 dark:text-secondary-400 mb-6">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                    Our Vision
                  </h2>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
                    We envision a world where building enterprise-grade applications is as intuitive as building a simple website. Our platform combines the reliability and security that enterprises demand with the developer experience that modern teams expect.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    Through continuous innovation and a commitment to open standards, we&apos;re shaping the future of application development.
                  </p>
                </div>
              </ScrollAnimation>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-20 bg-white/50 dark:bg-neutral-900/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="text-center mb-16">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  Our Core{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    Values
                  </span>
                </h2>
                <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
                  The principles that guide everything we do
                </p>
              </div>
            </ScrollAnimation>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {values.map((value, index) => (
                <ScrollAnimation key={index} direction="up" delay={index * 100}>
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-300 group">
                    <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4 group-hover:scale-110 transition-transform duration-300">
                      {value.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                      {value.title}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
                      {value.description}
                    </p>
                  </div>
                </ScrollAnimation>
              ))}
            </div>
          </div>
        </section>

        {/* What We Do Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="text-center mb-16">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  What We{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    Do
                  </span>
                </h2>
                <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
                  {APP_CONFIG.name} is a comprehensive platform that provides everything you need to build, deploy, and scale modern applications.
                </p>
              </div>
            </ScrollAnimation>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
              {features.map((feature, index) => (
                <ScrollAnimation key={index} direction="up" delay={index * 100}>
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 hover:shadow-soft-lg hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-300 group">
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary-100 to-secondary-100 dark:from-primary-900 dark:to-secondary-900 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-6 group-hover:scale-110 transition-transform duration-300">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </ScrollAnimation>
              ))}
            </div>
          </div>
        </section>

        {/* Technology Stack Section */}
        <section className="py-20 bg-white/50 dark:bg-neutral-900/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="text-center mb-12">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  Built with{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    Modern Technology
                  </span>
                </h2>
                <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-8">
                  We use the latest technologies and best practices to deliver exceptional performance and reliability.
                </p>
              </div>
            </ScrollAnimation>

            <ScrollAnimation direction="up" delay={100}>
              <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
                {technologies.map((tech, index) => (
                  <div
                    key={index}
                    className="px-6 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full text-neutral-700 dark:text-neutral-300 font-medium hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-300"
                  >
                    {tech}
                  </div>
                ))}
              </div>
            </ScrollAnimation>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-primary-100 via-white to-secondary-100 dark:from-primary-950 dark:via-neutral-900 dark:to-secondary-950 rounded-2xl border border-primary-200 dark:border-primary-800 shadow-soft-xl p-12 sm:p-16">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
                  Ready to Get Started?
                </h2>
                <p className="text-xl text-neutral-800 dark:text-neutral-200 mb-8 max-w-2xl mx-auto">
                  Whether you&apos;re a startup looking to scale quickly or an enterprise seeking reliable infrastructure, {APP_CONFIG.name} is here to support your growth.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" variant="primary" asChild href={ROUTES.REGISTER}>
                    Start Free Trial
                  </Button>
                  <Button size="lg" variant="outline" asChild href={ROUTES.CONTACT}>
                    Contact Us
                  </Button>
                </div>
              </div>
            </ScrollAnimation>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 bg-white/50 dark:bg-neutral-900/50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <ScrollAnimation direction="fade" delay={0}>
              <div className="max-w-3xl mx-auto text-center">
                <h2 className="text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                  Get in{" "}
                  <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
                    Touch
                  </span>
                </h2>
                <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-12">
                  Have questions or want to learn more? We&apos;d love to hear from you.
                </p>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-soft-lg transition-shadow duration-300">
                    <div className="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-600 dark:text-primary-400 mb-4 mx-auto">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Email</h3>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      contact@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                  </div>
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-soft-lg transition-shadow duration-300">
                    <div className="w-12 h-12 rounded-lg bg-secondary-100 dark:bg-secondary-900 flex items-center justify-center text-secondary-600 dark:text-secondary-400 mb-4 mx-auto">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Support</h3>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      support@{APP_CONFIG.name.toLowerCase()}.com
                    </p>
                  </div>
                </div>
              </div>
            </ScrollAnimation>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
