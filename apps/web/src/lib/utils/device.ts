export type DeviceMetadata = {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  deviceOs?: string;
  deviceBrowser?: string;
  userAgent?: string;
};

const DEVICE_ID_STORAGE_KEY = "cloudwrkz_device_id";

function generateRandomId(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback for environments without crypto (should be rare in browsers)
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function getOrCreateDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;

    const id = generateRandomId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage may be unavailable (private mode / blocked) – fail gracefully
    return undefined;
  }
}

export function getDeviceMetadata(): DeviceMetadata {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {};
  }

  const deviceId = getOrCreateDeviceId();
  const userAgent = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";

  let deviceType = "desktop";
  const uaLower = userAgent.toLowerCase();
  if (/mobile|iphone|android/.test(uaLower)) {
    deviceType = "mobile";
  } else if (/ipad|tablet/.test(uaLower)) {
    deviceType = "tablet";
  }

  let deviceOs = "unknown";
  if (/windows nt/i.test(userAgent)) deviceOs = "Windows";
  else if (/mac os x/i.test(userAgent)) deviceOs = "macOS";
  else if (/android/i.test(userAgent)) deviceOs = "Android";
  else if (/iphone|ipad|ipod/i.test(userAgent)) deviceOs = "iOS";
  else if (/linux/i.test(userAgent)) deviceOs = "Linux";

  let deviceBrowser = "unknown";
  if (/edg\//i.test(userAgent)) deviceBrowser = "Edge";
  else if (/chrome\//i.test(userAgent)) deviceBrowser = "Chrome";
  else if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) deviceBrowser = "Safari";
  else if (/firefox\//i.test(userAgent)) deviceBrowser = "Firefox";

  // Simple human-friendly name (can be improved later or overridden server-side)
  const deviceNameParts: string[] = [];
  if (deviceType) deviceNameParts.push(deviceType.charAt(0).toUpperCase() + deviceType.slice(1));
  if (deviceOs && deviceOs !== "unknown") deviceNameParts.push(deviceOs);
  if (deviceBrowser && deviceBrowser !== "unknown") deviceNameParts.push(`(${deviceBrowser})`);

  const deviceName = deviceNameParts.join(" ");

  return {
    deviceId,
    deviceName,
    deviceType,
    deviceOs,
    deviceBrowser,
    userAgent,
  };
}

