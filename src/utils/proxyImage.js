// ═══════════════════════════════════════════════════════
//  proxyImage — Route CORS-blocked URLs through /api/proxy-image
// ═══════════════════════════════════════════════════════

const PROXY_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
];

/**
 * If the URL points to a host known to block CORS (e.g. Google Drive),
 * return a proxied URL through our Vercel serverless function.
 * Otherwise return the original URL unchanged.
 */
export function proxyImageUrl(url) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const needsProxy = PROXY_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
    if (needsProxy) {
      return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // invalid URL — return as-is
  }

  return url;
}
