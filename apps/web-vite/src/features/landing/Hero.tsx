// Human: Landing hero with primary headline, supporting copy, and CTAs that smooth-scroll to the features section in-page.
// Agent: CALLS document.getElementById features scrollIntoView; RENDERS Button ROUTES links; STATIC marketing content.

import React from "react";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";

const handleLearnMoreClick = (e: React.MouseEvent<HTMLElement>) => {
  e.preventDefault();
  const featuresSection = document.getElementById("features");
  if (featuresSection) {
    featuresSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

export const Hero = () => {
  return (
    <section
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16"
      aria-label="Hero section"
    >
      <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div
            className="mb-8 inline-flex animate-fade-in items-center rounded-full border border-primary-300/50 bg-white/70 px-4 py-2 text-sm font-medium text-primary-900 shadow-sm backdrop-blur-sm dark:border-primary-400/30 dark:bg-neutral-950/50 dark:text-primary-200"
            role="status"
            aria-label="Status badge"
          >
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-primary-500 dark:bg-primary-400" aria-hidden="true" />
            Now Available - Enterprise Ready
          </div>

          {/* Main headline */}
          <h1 className="mb-6 animate-slide-in text-5xl font-bold leading-tight text-neutral-950 dark:text-neutral-50 sm:text-6xl lg:text-7xl">
            Build Modern Apps
            <br />
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent dark:from-primary-300 dark:to-secondary-300">
              Faster Than Ever
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-12 max-w-2xl animate-fade-in text-xl leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-2xl">
            A powerful, modular platform that combines cutting-edge technology
            with enterprise-grade reliability. Ship faster, scale effortlessly.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in">
            <Button
              size="lg"
              variant="primary"
              asChild
              href={ROUTES.REGISTER}
              aria-label="Start your free trial"
            >
              Start Free Trial
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              href="#features"
              aria-label="Learn more about our features"
              onClick={handleLearnMoreClick}
            >
              Learn More
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto" role="list" aria-label="Key statistics">
            <div className="text-center" role="listitem">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2" aria-label="99.9 percent">99.9%</div>
              <div className="text-neutral-700 dark:text-neutral-300">Uptime</div>
            </div>
            <div className="text-center" role="listitem">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2" aria-label="10 times">10x</div>
              <div className="text-neutral-700 dark:text-neutral-300">Faster Development</div>
            </div>
            <div className="text-center" role="listitem">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2" aria-label="24/7">24/7</div>
              <div className="text-neutral-700 dark:text-neutral-300">Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce"
        aria-hidden="true"
        aria-label="Scroll indicator"
      >
        <div className="flex h-10 w-6 justify-center rounded-full border-2 border-neutral-400/80 dark:border-white/35">
          <div className="mt-2 h-3 w-1 rounded-full bg-neutral-500 dark:bg-white/50" />
        </div>
      </div>
    </section>
  );
};
