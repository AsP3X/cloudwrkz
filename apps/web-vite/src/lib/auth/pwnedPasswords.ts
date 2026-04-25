/**
 * Have I Been Pwned — Pwned Passwords (range) API.
 * @see https://haveibeenpwned.com/Passwords — free, no API key; k-anonymity via SHA-1 prefix.
 * @see https://api.pwnedpasswords.com/
 *
 * Hashing uses @noble/hashes instead of Web Crypto so checks work on non-secure origins
 * (e.g. http://LAN:5173) where `crypto.subtle` is unavailable.
 *
 * No custom headers are sent: `User-Agent` is a forbidden header in fetch() — Chrome silently
 * drops it, but Safari triggers a CORS preflight that HIBP doesn't allow, breaking the request.
 * `Add-Padding` would also trigger a preflight. Omitting both keeps this a CORS "simple request".
 */
// Human: k-anonymous Have I Been Pwned range lookup using SHA-1 prefix so we can warn without uploading full passwords.
// Agent: FETCH api.pwnedpasswords.com/range/{5}; USES @noble/hashes sha1 not subtle; READS AbortSignal; RETURNS count|null.

import { sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const HIBP_RANGE_BASE = "https://api.pwnedpasswords.com/range";

function sha1HexUpper(password: string): string {
  return bytesToHex(sha1(new TextEncoder().encode(password))).toUpperCase();
}

/**
 * Returns how many times this password appears in the Pwned Passwords corpus, or `null` if the
 * check could not be completed (network error, abort, non-OK response). Does not throw on abort.
 */
export async function getPwnedPasswordCount(
  password: string,
  signal?: AbortSignal,
): Promise<number | null> {
  if (!password) return 0;

  let hashHex: string;
  try {
    hashHex = sha1HexUpper(password);
  } catch {
    return null;
  }

  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  try {
    const res = await fetch(`${HIBP_RANGE_BASE}/${prefix}`, { signal });

    if (!res.ok) return null;

    const raw = await res.text();
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    const want = suffix.toUpperCase();

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colon = trimmed.indexOf(":");
      if (colon === -1) continue;
      const hashPart = trimmed.slice(0, colon).trim();
      const countStr = trimmed.slice(colon + 1).trim();
      if (hashPart.toUpperCase() === want) {
        const n = parseInt(countStr, 10);
        return Number.isFinite(n) ? n : null;
      }
    }

    return 0;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}
