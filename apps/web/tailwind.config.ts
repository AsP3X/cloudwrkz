import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Soft blues/indigos (enterprise feel)
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        // Secondary - Complementary colors
        secondary: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        // Neutral - Grays with warm undertones
        neutral: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e7e5e4",
          300: "#d6d3d1",
          400: "#a8a29e",
          500: "#78716c",
          600: "#57534e",
          700: "#44403c",
          800: "#292524",
          900: "#1c1917",
          950: "#0c0a09",
        },
        // Success
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
          950: "#052e16",
        },
        // Error
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
          950: "#450a0a",
        },
        // Warning
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        soft: "0 2px 8px 0 rgba(0, 0, 0, 0.04)",
        "soft-md": "0 4px 16px 0 rgba(0, 0, 0, 0.06)",
        "soft-lg": "0 8px 24px 0 rgba(0, 0, 0, 0.08)",
        "soft-xl": "0 12px 32px 0 rgba(0, 0, 0, 0.1)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "fade-out": "fadeOut 0.2s ease-in-out",
        "slide-in": "slideIn 0.3s ease-out",
        "slide-out": "slideOut 0.3s ease-in",
        "pulse-delay-700": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 0.7s infinite",
        "pulse-delay-1000": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) 1s infinite",
        // 404 page cloud animations (gentle up/down bob, varied timing so not in sync)
        "cloud-bob-1": "bobSubtle 4s ease-in-out infinite",
        "cloud-bob-2": "bobSubtle 5s ease-in-out infinite 0.5s",
        "cloud-bob-3": "bobSubtle 3.5s ease-in-out infinite 1s",
        "cloud-bob-4": "bobSubtle 4.5s ease-in-out infinite 1.5s",
        "cloud-bob-5": "bobSubtle 5.5s ease-in-out infinite 0.25s",
        "cloud-bob-6": "bobSubtle 3.8s ease-in-out infinite 2s",
        "cloud-bob-7": "bobSubtle 4.2s ease-in-out infinite 0.75s",
        "cloud-bob-8": "bobSubtle 5.2s ease-in-out infinite 2.5s",
        "cloud-bob-9": "bobSubtle 3.6s ease-in-out infinite 1.25s",
        "cloud-bob-10": "bobSubtle 4.8s ease-in-out infinite 0.1s",
        "cloud-bob": "bob 4s ease-in-out infinite",
        "cloud-tilt": "tilt 2s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
        "spin-slow-reverse": "spin 4s linear infinite reverse",
      },
      transitionDelay: {
        "700": "700ms",
        "1000": "1000ms",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        slideIn: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideOut: {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-10px)", opacity: "0" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        bobSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        tilt: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(8deg)" },
          "75%": { transform: "rotate(-8deg)" },
        },
      },
      transitionDuration: {
        DEFAULT: "200ms",
        fast: "150ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
