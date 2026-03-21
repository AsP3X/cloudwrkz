/**
 * Thrown when `fetch` fails before an HTTP response (offline, DNS, CORS blocked, connection refused).
 * Browsers often use opaque messages like "Load failed" or "Failed to fetch"; we replace those for UI.
 */
export class NetworkTransportError extends Error {
  override readonly name = "NetworkTransportError";

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function wrapFetchFailure(err: unknown): NetworkTransportError {
  return new NetworkTransportError(
    "Could not reach the server. Check your connection and that the API is running.",
    err,
  );
}
