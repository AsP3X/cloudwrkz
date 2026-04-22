/** Mirrors API `parse_employee_code` for client-side validation before POST /employees. */
// Human: Validates employee code input client-side so obvious mistakes fail fast before hitting the API.
// Agent: READS raw string; RETURNS ok/value or message; ENFORCES length 64 and Unicode letter/digit/punct allowlist.

export function parseEmployeeCode(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Employee code is required" };
  }
  const canonical = trimmed.split(/\s+/).join(" ");
  if (canonical.length === 0) {
    return { ok: false, message: "Employee code is required" };
  }
  const charCount = [...canonical].length;
  if (charCount > 64) {
    return { ok: false, message: "Employee code must be at most 64 characters" };
  }
  for (const ch of canonical) {
    if (ch === " ") continue;
    if (/^\p{L}$/u.test(ch) || /^\p{N}$/u.test(ch)) continue;
    if ("-_./:#@+(),".includes(ch) || ch === "[" || ch === "]") continue;
    return {
      ok: false,
      message:
        "Employee code may only contain letters, digits, spaces, and - _ . / : # @ + ( ) , [ ]",
    };
  }
  return { ok: true, value: canonical };
}
