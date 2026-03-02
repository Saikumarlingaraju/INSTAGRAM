// ═══════════════════════════════════════════════════════
//  proxyImage — Route CORS-blocked URLs through /api/proxy-image
// ═══════════════════════════════════════════════════════

const PROXY_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
  'googleusercontent.com',
];

function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return '';
  return url.trim().replace(/^"|"$/g, '');
}

function extractGoogleDriveFileId(parsed) {
  if (!parsed) return null;

  const queryId = parsed.searchParams.get('id');
  if (queryId) return queryId;

  const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];

  return null;
}

function normalizeGoogleDriveUrl(url) {
  try {
    const parsed = new URL(url);
    const isDriveHost =
      parsed.hostname === 'drive.google.com' ||
      parsed.hostname.endsWith('.drive.google.com') ||
      parsed.hostname === 'docs.google.com' ||
      parsed.hostname.endsWith('.docs.google.com');

    if (!isDriveHost) return url;

    const fileId = extractGoogleDriveFileId(parsed);
    if (!fileId) return url;

    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  } catch {
    return url;
  }
}

/**
 * If the URL points to a host known to block CORS (e.g. Google Drive),
 * return a proxied URL through our Vercel serverless function.
 * Otherwise return the original URL unchanged.
 */
export function proxyImageUrl(url) {
  if (!url) return url;

  const cleanUrl = sanitizeImageUrl(url);
  if (!cleanUrl) return cleanUrl;

  const normalizedUrl = normalizeGoogleDriveUrl(cleanUrl);

  try {
    const parsed = new URL(normalizedUrl);
    const needsProxy = PROXY_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
    if (needsProxy) {
      return `/api/proxy-image?url=${encodeURIComponent(normalizedUrl)}`;
    }
  } catch {
    // invalid URL — return as-is
  }

  return normalizedUrl;
}
