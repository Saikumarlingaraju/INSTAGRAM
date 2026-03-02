import { proxyImageUrl, extractGoogleDriveFileId } from './proxyImage';

/**
 * Load an image URL into an HTMLImageElement, handling CORS.
 *
 * Strategy:
 *   1. Rewrite URL via proxyImageUrl (Drive → lh3 CDN, others → proxy)
 *   2. Fetch as blob, validate content-type
 *   3. Decode via Image + object URL
 *   4. If lh3 CDN fails, fall back to /api/proxy-image
 */
export async function loadImageForRendering(rawUrl) {
  const finalUrl = proxyImageUrl(rawUrl);
  if (!finalUrl) {
    throw new Error('Image URL is empty');
  }

  try {
    return await fetchAndDecode(finalUrl);
  } catch (firstErr) {
    // If direct CDN failed, try our server proxy as fallback
    const fileId = extractGoogleDriveFileId(rawUrl);
    if (fileId) {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
      try {
        return await fetchAndDecode(proxyUrl);
      } catch {
        // throw original error — it's more informative
      }
    }
    throw firstErr;
  }
}

async function fetchAndDecode(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status} from ${new URL(url, location.href).hostname})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Non-image content: ${contentType}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Fetched image is empty');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode failed'));
    };

    img.src = objectUrl;
  });
}
