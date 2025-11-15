/**
 * Props for the CookiesDisclaimer component
 */
export interface CookiesDisclaimerProps {
  /**
   * Optional custom message to display
   */
  message?: string;
  /**
   * Optional custom accept button text
   */
  acceptButtonText?: string;
  /**
   * Optional custom privacy policy link
   */
  privacyPolicyLink?: string;
  /**
   * Optional callback when user accepts cookies
   */
  onAccept?: () => void;
}

