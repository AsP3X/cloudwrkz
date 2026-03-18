import { FloatingTooltip } from "@/components/ui/FloatingTooltip";

export function TipsTooltip() {
  const trigger = (
    <button
      type="button"
      className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900 transition-colors"
      aria-label="Tips for creating effective tickets"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  );

  return (
    <FloatingTooltip
      trigger={trigger}
      position="bottom-right"
      contentClassName="p-6 max-w-sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-primary-600 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
              Tips for creating effective tickets
            </h3>
            <ul className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0">•</span>
                <span>Use a clear, descriptive title that summarizes your issue or request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0">•</span>
                <span>Provide detailed information in the description, including steps to reproduce if reporting a bug</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0">•</span>
                <span>Select the appropriate ticket type and priority level to help us prioritize your request</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0">•</span>
                <span>Include any relevant screenshots, error messages, or additional context that might help</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </FloatingTooltip>
  );
}
