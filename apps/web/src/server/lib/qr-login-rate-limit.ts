import { prisma } from "@/lib/db/prisma";
import { unstable_cache } from "next/cache";
import {
  DEFAULT_QR_REQUESTS_PER_MINUTE,
  MIN_QR_REQUESTS_PER_MINUTE,
  MAX_QR_REQUESTS_PER_MINUTE,
} from "@/lib/constants/qr-login";

const QR_REQUESTS_PER_MINUTE_SETTING_KEY = "qr_login_requests_per_minute";

export const QR_REQUESTS_PER_MINUTE_CACHE_TAG = "qr-requests-per-minute";

async function getQrLoginRequestsPerMinuteUncached(): Promise<number> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: QR_REQUESTS_PER_MINUTE_SETTING_KEY },
      select: { value: true },
    });
    if (row?.value != null && typeof row.value === "number") {
      const n = Math.floor(Number(row.value));
      if (n >= MIN_QR_REQUESTS_PER_MINUTE && n <= MAX_QR_REQUESTS_PER_MINUTE) return n;
    }
  } catch {
    // table may not exist yet
  }
  return DEFAULT_QR_REQUESTS_PER_MINUTE;
}

/**
 * Get max QR login requests per minute (cached). Used by API route and admin settings page.
 */
export const getQrLoginRequestsPerMinute = unstable_cache(
  getQrLoginRequestsPerMinuteUncached,
  [QR_REQUESTS_PER_MINUTE_CACHE_TAG],
  { revalidate: 60, tags: [QR_REQUESTS_PER_MINUTE_CACHE_TAG] }
);
