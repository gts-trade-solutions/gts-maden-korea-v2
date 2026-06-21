import "server-only";

/**
 * Read the visitor's IP from the request headers (Netlify, Vercel, and
 * standard reverse proxies set x-forwarded-for / x-real-ip). Truncate to
 * /24 (v4) or /48 (v6) so we keep coarse geo signal without persisting
 * personally-identifying full addresses.
 */
export function ipPrefix(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for") || "";
  const candidate = xff.split(",")[0]?.trim() || headers.get("x-real-ip") || "";
  if (!candidate) return null;

  // IPv4
  const v4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;

  // IPv6 — keep first 3 groups only
  if (candidate.includes(":")) {
    const segs = candidate.split(":").slice(0, 3).join(":");
    return `${segs}::/48`;
  }
  return null;
}

export function parseDevice(ua: string | null): {
  type: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  os: string | null;
  browser: string | null;
} {
  if (!ua) return { type: "unknown", os: null, browser: null };
  const lower = ua.toLowerCase();
  let type: "mobile" | "tablet" | "desktop" | "bot" | "unknown" = "desktop";
  if (/(bot|crawler|spider|crawling)/i.test(lower)) type = "bot";
  else if (/ipad|tablet/i.test(lower)) type = "tablet";
  else if (/mobi|iphone|android.*mobile|phone/i.test(lower)) type = "mobile";

  let os: string | null = null;
  if (/windows/i.test(lower)) os = "Windows";
  else if (/iphone|ipad|ios/i.test(lower)) os = "iOS";
  else if (/macintosh|mac os/i.test(lower)) os = "macOS";
  else if (/android/i.test(lower)) os = "Android";
  else if (/linux/i.test(lower)) os = "Linux";

  let browser: string | null = null;
  if (/edg\//i.test(lower)) browser = "Edge";
  else if (/chrome\//i.test(lower) && !/edg\//i.test(lower)) browser = "Chrome";
  else if (/firefox/i.test(lower)) browser = "Firefox";
  else if (/safari/i.test(lower) && !/chrome/i.test(lower)) browser = "Safari";

  return { type, os, browser };
}
