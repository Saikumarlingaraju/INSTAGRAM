// ═══════════════════════════════════════════════════════
//  proxyImage — Rewrite Google Drive URLs to CORS-friendly CDN
//
//  Google's lh3.googleusercontent.com serves images with
//  Access-Control-Allow-Origin: * — no server proxy needed.
//
//  Fallback: /api/proxy-image for any remaining blocked hosts.
// ═══════════════════════════════════════════════════════

const DRIVE_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
];

const PROXY_HOSTS = [
  ...DRIVE_HOSTS,
  'googleusercontent.com',
];

function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return '';
  return url.trim().replace(/^"|"$/g, '');
}

/**
 * Extract the Google Drive file ID from various URL formats:
 *   drive.google.com/uc?export=view&id=FILE_ID
 *   drive.google.com/file/d/FILE_ID/view
 *   drive.google.com/open?id=FILE_ID
 *   docs.google.com/uc?id=FILE_ID
 */
function extractGoogleDriveFileId(url) {
  try {
    const parsed = new URL(url);
    const isDrive = DRIVE_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
    );
    if (!isDrive) return null;

    // ?id= query param (most common)
    const queryId = parsed.searchParams.get('id');
    if (queryId) return queryId;

    // /file/d/FILE_ID/... path
    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    if (pathMatch?.[1]) return pathMatch[1];

    // /d/FILE_ID path (shorter sharing format)
    const shortMatch = parsed.pathname.match(/\/d\/([^/]+)/i);
    if (shortMatch?.[1]) return shortMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert a Google Drive URL to a direct, CORS-friendly CDN URL.
 * Uses lh3.googleusercontent.com which returns:
 *   - Access-Control-Allow-Origin: *
 *   - image/jpeg content
 *   - Fast Google CDN delivery
 *
 * @param {string} fileId — Google Drive file ID
 * @param {number} [maxWidth=2048] — requested max width
 * @returns {string} direct image URL
 */
function googleDriveDirectUrl(fileId, maxWidth = 2048) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w${maxWidth}`;
}

/**
 * Transform any image URL into one the browser can load cross-origin.
 *
 *  1. Google Drive → rewrite to lh3.googleusercontent.com (CORS: *)
 *  2. Other blocked hosts → proxy through /api/proxy-image
 *  3. Everything else → return unchanged
 */
export function proxyImageUrl(url) {
  if (!url) return url;

  const cleanUrl = sanitizeImageUrl(url);
  if (!cleanUrl) return cleanUrl;

  // Fast path: Google Drive → direct CDN URL (no proxy)
  const fileId = extractGoogleDriveFileId(cleanUrl);
  if (fileId) {
    return googleDriveDirectUrl(fileId);
  }

  // For other CORS-blocked hosts, route through our proxy
  try {
    const parsed = new URL(cleanUrl);
    const needsProxy = PROXY_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
    if (needsProxy) {
      return `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
    }
  } catch {
    // invalid URL — return as-is
  }

  return cleanUrl;
}

// Exported for testing / reuse
export { extractGoogleDriveFileId, googleDriveDirectUrl };
