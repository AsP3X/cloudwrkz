// Human: IntersectionObserver-driven entrance animation wrapper used across landing sections for consistent motion design.
// Agent: REF div; useEffect IntersectionObserver threshold 0.1; STATE isVisible; APPLIES translate/opacity classes via cn.

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface ScrollAnimationProps {
  children: React.ReactNode;
  direction?: "up" | "left" | "right" | "fade";
  delay?: number;
  className?: string;
}

export function ScrollAnimation({ children, direction = "up", delay = 0, className }: ScrollAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const directionStyles: Record<string, string> = {
    up: "translate-y-8",
    left: "-translate-x-8",
    right: "translate-x-8",
    fade: "",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out",
        isVisible ? "opacity-100 translate-y-0 translate-x-0" : `opacity-0 ${directionStyles[direction]}`,
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
