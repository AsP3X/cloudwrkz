"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-30 dark:opacity-5 animate-pulse" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-30 dark:opacity-5 animate-pulse delay-[700ms]" />
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-primary-300 dark:bg-primary-950 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-3 animate-pulse delay-[1000ms]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm font-medium mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-primary-500 dark:bg-primary-400 rounded-full mr-2 animate-pulse" />
            Now Available - Enterprise Ready
          </div>

          {/* Main headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-neutral-900 dark:text-neutral-100 mb-6 leading-tight animate-slide-in">
            Build Modern Apps
            <br />
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
              Faster Than Ever
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl sm:text-2xl text-neutral-600 dark:text-neutral-400 mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in">
            A powerful, modular platform that combines cutting-edge technology
            with enterprise-grade reliability. Ship faster, scale effortlessly.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in">
            <Button size="lg" variant="primary" asChild href={ROUTES.REGISTER}>
              Start Free Trial
            </Button>
            <Button size="lg" variant="outline" asChild href="#features">
              Learn More
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2">99.9%</div>
              <div className="text-neutral-600 dark:text-neutral-400">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2">10x</div>
              <div className="text-neutral-600 dark:text-neutral-400">Faster Development</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600 dark:text-primary-400 mb-2">24/7</div>
              <div className="text-neutral-600 dark:text-neutral-400">Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-neutral-300 dark:border-neutral-700 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-neutral-400 dark:bg-neutral-500 rounded-full mt-2" />
        </div>
      </div>
    </section>
  );
};
