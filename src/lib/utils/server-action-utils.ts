/**
 * Utility functions for handling server actions with stale action error recovery
 */

/**
 * Helper function to call server actions with retry logic for stale action errors
 * By default, only retries once to avoid excessive failed requests
 */
export async function callServerActionWithRetry<T>(
  actionFn: () => Promise<T>,
  maxRetries = 1
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await actionFn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's an UnrecognizedActionError or 404 error
      const isUnrecognizedActionError = 
        error?.name === "UnrecognizedActionError" ||
        error?.message?.includes("was not found on the server") ||
        error?.message?.includes("Server Action") ||
        error?.message?.includes("does not exist") ||
        error?.message?.includes("Failed to find Server Action");
      
      // Check for HTTP 404 errors (server action endpoint not found)
      // Next.js may wrap the error, so check multiple properties and message
      const is404Error = 
        error?.status === 404 ||
        error?.statusCode === 404 ||
        error?.message?.includes("404") ||
        error?.message?.includes("Not Found") ||
        error?.message?.includes("not found") ||
        (error?.response?.status === 404) ||
        (error?.stack?.includes("404"));
      
      // Check for network errors
      const isNetworkError = 
        error?.message?.includes("Failed to fetch") ||
        error?.message?.includes("NetworkError") ||
        error?.name === "TypeError";
      
      // If it's a server action error or 404, retry with backoff
      if ((isUnrecognizedActionError || is404Error) && attempt < maxRetries) {
        // Wait a bit before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }
      
      // If it's a network error, don't retry (likely a connectivity issue)
      if (isNetworkError) {
        throw error;
      }
      
      // For other errors, throw immediately
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Check if an error is a stale server action error
 */
export function isStaleServerActionError(error: any): boolean {
  return (
    error?.name === "UnrecognizedActionError" ||
    error?.message?.includes("was not found on the server") ||
    error?.message?.includes("Server Action") ||
    error?.message?.includes("does not exist") ||
    error?.message?.includes("Failed to find Server Action") ||
    error?.status === 404 ||
    error?.statusCode === 404 ||
    error?.message?.includes("404") ||
    error?.message?.includes("Not Found") ||
    (error?.response?.status === 404)
  );
}
