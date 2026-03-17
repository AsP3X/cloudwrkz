import { Link, useNavigate } from "react-router-dom";
import { APP_CONFIG } from "@/lib/constants/config";
import { ROUTES } from "@/lib/constants/routes";
import { Button } from "@/components/ui/Button";

function Cloud({ className, variant = 1 }: { className?: string; variant?: 1 | 2 | 3 }) {
  if (variant === 2) {
    return (
      <svg className={className} viewBox="0 0 200 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M170 70H30c-16.569 0-30-10.745-30-24s13.431-24 30-24c1.4 0 2.78.08 4.13.24C40.46 9.12 55.13 0 72 0c14.14 0 26.62 6.34 34.04 16.08C110.98 14.1 116.36 13 122 13c19.33 0 35.36 12.77 38.76 30.02C161.83 43.35 163 43 170 43c16.569 0 30 10.745 30 24s-13.431 24-30 24z" />
      </svg>
    );
  }
  if (variant === 3) {
    return (
      <svg className={className} viewBox="0 0 160 80" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M130 60H25c-13.807 0-25-9.645-25-21.5S11.193 17 25 17c.9 0 1.79.04 2.66.13C32.5 7.08 43.84 0 57 0c11.44 0 21.54 5.07 27.82 13.04C88.54 11.12 93.02 10 97.8 10c15.66 0 28.6 10.48 31.2 24.62C130.6 34.86 131 35 135 35c13.807 0 25 9.645 25 21.5S148.807 60 135 60z" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 240 120" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M200 90H40c-22.091 0-40-13.431-40-30s17.909-30 40-30c2.22 0 4.4.13 6.52.38C55.08 12.62 73.5 0 95 0c17.67 0 33.28 8.5 42.52 21.54C143.14 18.18 149.82 16 157 16c24.3 0 44.22 16.48 48.36 38.18C207.06 54.06 210 54 215 54c13.807 0 25 12.088 25 27s-11.193 27-25 27z" />
    </svg>
  );
}

function LostCloud({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 240 140" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <path d="M200 100H40c-22.091 0-40-13.431-40-30s17.909-30 40-30c2.22 0 4.4.13 6.52.38C55.08 22.62 73.5 10 95 10c17.67 0 33.28 8.5 42.52 21.54C143.14 28.18 149.82 26 157 26c24.3 0 44.22 16.48 48.36 38.18C207.06 64.06 210 64 215 64c13.807 0 25 12.088 25 27s-11.193 27-25 27z" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pt-4">
        <div className="flex gap-8 items-center relative -top-1">
          <span className="inline-block text-white dark:text-neutral-800 text-2xl sm:text-3xl font-bold select-none animate-spin-slow">
            &times;
          </span>
          <span className="inline-block text-white dark:text-neutral-800 text-2xl sm:text-3xl font-bold select-none animate-spin-slow-reverse">
            &times;
          </span>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center pt-14 sm:pt-16">
        <svg width="40" height="16" viewBox="0 0 40 16" className="text-white dark:text-neutral-800">
          <path d="M4 8 C10 2, 14 14, 20 8 C26 2, 30 14, 36 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  );
}

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-200 dark:bg-primary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-secondary-200 dark:bg-secondary-900 rounded-full mix-blend-multiply filter blur-xl opacity-20 dark:opacity-5" />
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <Cloud variant={1} className="absolute w-40 sm:w-56 text-primary-100 dark:text-neutral-800/40 opacity-50 dark:opacity-25 animate-cloud-bob-1 top-[5%] left-[5%]" />
        <Cloud variant={2} className="absolute w-28 sm:w-36 text-secondary-100 dark:text-neutral-800/30 opacity-45 dark:opacity-20 animate-cloud-bob-5 top-[12%] left-[35%]" />
        <Cloud variant={3} className="absolute w-32 sm:w-40 text-primary-100 dark:text-neutral-800/35 opacity-40 dark:opacity-18 animate-cloud-bob-9 top-[18%] right-[15%]" />
        <Cloud variant={2} className="absolute w-48 sm:w-60 text-secondary-100 dark:text-neutral-800/30 opacity-55 dark:opacity-22 animate-cloud-bob-2 top-[25%] left-[8%]" />
        <Cloud variant={1} className="absolute w-24 sm:w-32 text-primary-100 dark:text-neutral-800/25 opacity-35 dark:opacity-15 animate-cloud-bob-6 top-[32%] left-[55%]" />
        <Cloud variant={3} className="absolute w-36 sm:w-48 text-secondary-100 dark:text-neutral-800/28 opacity-45 dark:opacity-18 animate-cloud-bob-10 top-[38%] right-[8%]" />
        <Cloud variant={3} className="absolute w-44 sm:w-56 text-primary-100 dark:text-neutral-800/35 opacity-50 dark:opacity-20 animate-cloud-bob-3 top-[45%] left-[2%]" />
        <Cloud variant={1} className="absolute w-20 sm:w-28 text-secondary-100 dark:text-neutral-800/20 opacity-30 dark:opacity-12 animate-cloud-bob-7 top-[50%] left-[45%]" />
        <Cloud variant={2} className="absolute w-52 sm:w-64 text-primary-100 dark:text-neutral-800/30 opacity-40 dark:opacity-16 animate-cloud-bob-4 top-[55%] right-[5%]" />
        <Cloud variant={1} className="absolute w-32 sm:w-40 text-secondary-100 dark:text-neutral-800/28 opacity-45 dark:opacity-18 animate-cloud-bob-8 top-[62%] left-[25%]" />
        <Cloud variant={2} className="absolute w-40 sm:w-52 text-primary-100 dark:text-neutral-800/32 opacity-50 dark:opacity-20 animate-cloud-bob-1 top-[68%] left-[65%]" />
        <Cloud variant={3} className="absolute w-26 sm:w-34 text-primary-100 dark:text-neutral-800/22 opacity-38 dark:opacity-14 animate-cloud-bob-5 top-[74%] right-[25%]" />
        <Cloud variant={2} className="absolute w-56 sm:w-72 text-secondary-50 dark:text-neutral-800/18 opacity-35 dark:opacity-10 animate-cloud-bob-2 top-[80%] left-[10%]" />
        <Cloud variant={1} className="absolute w-32 sm:w-44 text-primary-100 dark:text-neutral-800/25 opacity-42 dark:opacity-16 animate-cloud-bob-9 top-[86%] left-[50%]" />
        <Cloud variant={3} className="absolute w-38 sm:w-48 text-secondary-100 dark:text-neutral-800/20 opacity-33 dark:opacity-12 animate-cloud-bob-6 top-[92%] right-[12%]" />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-40 h-28 sm:w-52 sm:h-36 md:w-60 md:h-40 text-primary-200 dark:text-neutral-700 animate-cloud-bob">
        <LostCloud className="relative w-full h-full" />
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 px-4 py-16">
        <div className="text-center max-w-lg mx-auto">
          <Link
            to={ROUTES.HOME}
            className="inline-block mb-8 text-2xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"
          >
            {APP_CONFIG.name}
          </Link>

          <h1 className="text-7xl sm:text-8xl font-extrabold mb-4 tracking-tight">
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
              4
            </span>
            <span className="inline-block bg-gradient-to-r from-secondary-500 to-primary-500 dark:from-secondary-400 dark:to-primary-400 bg-clip-text text-transparent animate-cloud-tilt">
              0
            </span>
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent">
              4
            </span>
          </h1>

          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
            Lost in the clouds
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-10 max-w-md mx-auto leading-relaxed">
            This page seems to have drifted away. Don&apos;t worry — even clouds
            get lost sometimes. Let&apos;s get you back on track.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="primary" size="lg" asChild href={ROUTES.HOME}>
              Go Home
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
