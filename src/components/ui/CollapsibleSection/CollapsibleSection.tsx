"use client";

import React from "react";

interface CollapsibleSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection = ({
  title,
  description,
  icon,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) => {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  return (
    <div className="bg-white rounded-xl shadow-soft-lg border border-neutral-200 p-6 sm:p-8">
      {/* Header with toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full mb-6 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-lg -m-2 p-2 transition-colors hover:bg-neutral-50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0">{icon}</div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
              <p className="text-sm text-neutral-600 mt-1">{description}</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <svg
              className={`w-5 h-5 text-neutral-500 transition-transform duration-200 ${
                isExpanded ? "transform rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </button>

      {/* Content */}
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

