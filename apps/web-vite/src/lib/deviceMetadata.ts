/**
 * Collects browser/device metadata for login session labeling.
 * Sent to POST /auth/login so sessions show readable device names in settings.
 */

// Human: The API merges these fields with User-Agent and Client Hints server-side; we gather everything the browser exposes.
// Agent: READS navigator userAgent userAgentData platform maxTouchPoints; RETURNS snake_case LoginRequest device_* + user_agent.

export interface DeviceMetadataPayload {
  device_name?: string;
  device_type?: string;
  device_os?: string;
  device_browser?: string;
  user_agent?: string;
}

interface NavigatorUaData {
  mobile?: boolean;
  platform?: string;
  brands?: Array<{ brand: string; version: string }>;
  getHighEntropyValues?: (
    hints: string[],
  ) => Promise<{
    platform?: string;
    platformVersion?: string;
    model?: string;
    fullVersionList?: Array<{ brand: string; version: string }>;
  }>;
}

function primaryBrowserName(uaData: NavigatorUaData | undefined): string | undefined {
  const list = uaData?.brands ?? [];
  const preferred = list.find(
    (b) =>
      !b.brand.includes("Not") &&
      b.brand !== "Chromium" &&
      b.brand !== "Google Chrome",
  );
  const chrome = list.find((b) => b.brand === "Google Chrome");
  const pick = preferred ?? chrome ?? list.find((b) => !b.brand.includes("Not")) ?? list[0];
  if (!pick) return undefined;
  return pick.version ? `${pick.brand} ${pick.version}` : pick.brand;
}

function detectDeviceType(ua: string, uaData: NavigatorUaData | undefined): string {
  if (uaData?.mobile === true) return "mobile";
  if (/ipad|tablet|kindle|silk\//i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) return "mobile";
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && /macintosh/i.test(ua)) {
    return "tablet";
  }
  return "desktop";
}

function detectOs(ua: string, uaData: NavigatorUaData | undefined): string | undefined {
  const platform = uaData?.platform ?? navigator.platform ?? "";
  if (/iPhone|iPod/i.test(ua) || platform === "iPhone") return `iPhone · iOS`;
  if (/iPad/i.test(ua) || platform === "iPad") return `iPad · iPadOS`;
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return "macOS";
  if (/Win/i.test(platform) || /Windows NT/i.test(ua)) return "Windows";
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "Linux";
  if (/CrOS/i.test(ua)) return "Chrome OS";
  return platform || undefined;
}

function buildDeviceName(
  deviceType: string,
  deviceOs: string | undefined,
  deviceBrowser: string | undefined,
): string | undefined {
  if (deviceOs && deviceBrowser && !deviceOs.toLowerCase().includes(deviceBrowser.toLowerCase())) {
    return `${deviceOs} · ${deviceBrowser}`;
  }
  if (deviceOs) return deviceOs;
  if (deviceBrowser) return deviceBrowser;
  if (deviceType) return deviceType;
  return undefined;
}

/**
 * Best-effort synchronous metadata (used on login submit).
 * High-entropy Client Hints are optional and may refine labels when available.
 */
export function collectDeviceMetadata(): DeviceMetadataPayload {
  if (typeof navigator === "undefined") {
    return {};
  }

  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUaData }).userAgentData;
  const deviceType = detectDeviceType(ua, uaData);
  const deviceOs = detectOs(ua, uaData);
  const deviceBrowser = primaryBrowserName(uaData);

  return {
    device_name: buildDeviceName(deviceType, deviceOs, deviceBrowser),
    device_type: deviceType,
    device_os: deviceOs,
    device_browser: deviceBrowser,
    user_agent: ua,
  };
}

/** Fire-and-forget enrichment; login still sends synchronous `collectDeviceMetadata()`. */
export async function enrichDeviceMetadataAsync(
  base: DeviceMetadataPayload,
): Promise<DeviceMetadataPayload> {
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUaData }).userAgentData;
  if (!uaData?.getHighEntropyValues) {
    return base;
  }
  try {
    const hints = await uaData.getHighEntropyValues([
      "platform",
      "platformVersion",
      "model",
      "fullVersionList",
    ]);
    const deviceOs = hints.model
      ? `${hints.model} · ${hints.platform ?? "Android"}`
      : hints.platform
        ? `${hints.platform}${hints.platformVersion ? ` ${hints.platformVersion}` : ""}`
        : base.device_os;
    const fullList = hints.fullVersionList ?? [];
    const brand = fullList.find((b) => !b.brand.includes("Not") && b.brand !== "Chromium");
    const deviceBrowser = brand
      ? `${brand.brand}${brand.version ? ` ${brand.version}` : ""}`
      : base.device_browser;
    return {
      ...base,
      device_os: deviceOs ?? base.device_os,
      device_browser: deviceBrowser ?? base.device_browser,
      device_name: buildDeviceName(base.device_type ?? "desktop", deviceOs, deviceBrowser),
    };
  } catch {
    return base;
  }
}
