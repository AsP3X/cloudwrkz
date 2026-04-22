/**
 * Thrown when `fetch` fails before an HTTP response (offline, DNS, CORS blocked, connection refused).
 * Browsers often use opaque messages like "Load failed" or "Failed to fetch"; we replace those for UI.
 */
// Human: Typed transport-layer failure so UI and queues can distinguish unreachable servers from HTTP ApiError responses.
// Agent: EXTENDS Error with optional cause; CLASS name NetworkTransportError; USED BY offline queue and fetch wrappers.

export class NetworkTransportError extends Error {
  override readonly name = "NetworkTransportError";

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

// Human: Coerces an unknown thrown value into our NetworkTransportError with a stable, user-facing message.
// Agent: RETURNS new NetworkTransportError; READS err as cause; CALLED when fetch rejects before response.

export function wrapFetchFailure(err: unknown): NetworkTransportError {
  return new NetworkTransportError(
    "Could not reach the server. Check your connection and that the API is running.",
    err,
  );
}
