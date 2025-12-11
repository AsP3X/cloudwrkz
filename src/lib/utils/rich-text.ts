/**
 * Rich text utility functions
 */

export { sanitizeHtml, extractPlainText } from "./html-sanitizer";

/**
 * Validates HTML content length
 */
export function validateHtmlLength(html: string, maxLength: number = 50000): boolean {
  return html.length <= maxLength;
}

/**
 * Validates plain text content length
 */
export function validatePlainTextLength(plainText: string, maxLength: number = 10000): boolean {
  return plainText.length <= maxLength;
}
