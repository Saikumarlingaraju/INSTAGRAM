import { proxyImageUrl, extractGoogleDriveFileId } from './proxyImage';

const LOG_PREFIX = '[loadImage]';

/**
 * Load an image URL into an HTMLImageElement, handling CORS.
 *
 * 3-tier fallback strategy:
 *   Tier 1 — Rewritten URL (Drive → lh3 CDN) via fetch + blob
 *   Tier 2 — Server proxy (/api/proxy-image) via fetch + blob
 *   Tier 3 — Direct Image.src (no CORS, canvas tainted but visible)
 */
export async function loadImageForRendering(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Image URL is empty');
  }

  const cleanUrl = rawUrl.trim();
  const finalUrl = proxyImageUrl(cleanUrl);
  const errors = [];

  console.log(LOG_PREFIX, 'Input URL:', cleanUrl);
  console.log(LOG_PREFIX, 'Rewritten URL:', finalUrl);

  // ── Tier 1: Direct / CDN fetch ──
  try {
    console.log(LOG_PREFIX, 'Tier 1 — fetching rewritten URL…');
    const img = await fetchAndDecode(finalUrl);
    console.log(LOG_PREFIX, 'Tier 1 ✅ success');
    return img;
  } catch (err) {
    console.warn(LOG_PREFIX, 'Tier 1 ✗', err.message);
    errors.push(`Tier1(${err.message})`);
  }

  // ── Tier 2: Server proxy ──
  const fileId = extractGoogleDriveFileId(cleanUrl);
  if (fileId) {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
    try {
      console.log(LOG_PREFIX, 'Tier 2 — fetching via proxy…');
      const img = await fetchAndDecode(proxyUrl);
      console.log(LOG_PREFIX, 'Tier 2 ✅ success');
      return img;
    } catch (err) {
      console.warn(LOG_PREFIX, 'Tier 2 ✗', err.message);
      errors.push(`Tier2(${err.message})`);
    }
  }

  // ── Tier 3: Plain Image.src (no CORS, canvas tainted) ──
  try {
    console.log(LOG_PREFIX, 'Tier 3 — plain Image.src (tainted canvas)…');
    const img = await loadImageDirect(cleanUrl);
    console.log(LOG_PREFIX, 'Tier 3 ✅ success (canvas will be tainted)');
    return img;
  } catch (err) {
    console.warn(LOG_PREFIX, 'Tier 3 ✗', err.message);
    errors.push(`Tier3(${err.message})`);
  }

  throw new Error(`All image loading tiers failed: ${errors.join(' → ')}`);
}

// ── Fetch URL → validate → blob → Image via object URL ──
async function fetchAndDecode(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const host = safeHostname(url);
    throw new Error(`HTTP ${response.status} from ${host}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Non-image content-type: ${contentType}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Empty response body');
  }

  return blobToImage(blob, true);
}

// ── Plain Image.src loading (no fetch, no CORS control) ──
function loadImageDirect(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // No crossOrigin — allows loading without CORS but taints canvas
    const timer = setTimeout(() => {
      reject(new Error('Image load timed out (15s)'));
    }, 15000);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Image.src onerror fired'));
    };

    img.src = url;
  });
}

// ── Blob → Image via object URL ──
function blobToImage(blob, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Blob decode failed'));
    };

    img.src = objectUrl;
  });
}

function safeHostname(url) {
  try {
    return new URL(url, location.href).hostname;
  } catch {
    return '?';
  }
}
