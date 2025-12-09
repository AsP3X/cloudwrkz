"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface ScrollAnimationProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "fade";
}

export const ScrollAnimation: React.FC<ScrollAnimationProps> = ({
  children,
  className,
  delay = 0,
  direction = "up",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsVisible(true);
          }, delay);
          // Unobserve after animation to prevent re-triggering
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    const currentElement = elementRef.current;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, [delay]);

  const directionClasses = {
    up: isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
    down: isVisible ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0",
    left: isVisible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0",
    right: isVisible ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0",
    fade: isVisible ? "opacity-100" : "opacity-0",
  };

  return (
    <div
      ref={elementRef}
      className={cn(
        "transition-all duration-700 ease-out",
        directionClasses[direction],
        className
      )}
    >
      {children}
    </div>
  );
};
