// ═══════════════════════════════════════════════════════
//  /api/proxy-image — Server-side image proxy
//
//  Solves CORS issues when loading images from Google Drive
//  and other origins that block cross-origin requests.
//
//  Usage: /api/proxy-image?url=<encoded-image-url>
// ═══════════════════════════════════════════════════════

const ALLOWED_HOSTS = [
  'drive.google.com',
  'googleusercontent.com',
  'docs.google.com',
  'drive.usercontent.google.com',
];

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

function sanitizeUrlInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/^"|"$/g, '');
}

function extractGoogleDriveFileId(url) {
  try {
    const parsed = new URL(url);
    const queryId = parsed.searchParams.get('id');
    if (queryId) return queryId;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
    if (pathMatch?.[1]) return pathMatch[1];

    return null;
  } catch {
    return null;
  }
}

function buildGoogleDriveDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

async function fetchUpstream(url) {
  return fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/*,*/*;q=0.8',
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cleanUrl = sanitizeUrlInput(req.query?.url);
  if (!cleanUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  // Validate the URL
  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only HTTPS URLs are allowed' });
  }

  // Allowlist check
  const isAllowed = ALLOWED_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
  );
  if (!isAllowed) {
    return res.status(403).json({ error: `Host "${parsed.hostname}" is not allowed` });
  }

  try {
    let response = await fetchUpstream(cleanUrl);

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const isImage = contentType.toLowerCase().startsWith('image/');

      if (!isImage) {
        const fileId = extractGoogleDriveFileId(cleanUrl);
        if (fileId) {
          const retryUrl = buildGoogleDriveDownloadUrl(fileId);
          response = await fetchUpstream(retryUrl);
        }
      }
    }

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Upstream returned ${response.status}` });
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) {
      return res.status(413).json({ error: 'Image too large' });
    }

    // Stream the image buffer
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'Image too large' });
    }

    // Determine content type
    const contentType =
      response.headers.get('content-type') || 'image/jpeg';

    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(502).json({
        error: `Upstream returned non-image content-type: ${contentType}`,
      });
    }

    // Set CORS and caching headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Proxy image error:', err);
    return res.status(502).json({ error: 'Failed to fetch image' });
  }
}
