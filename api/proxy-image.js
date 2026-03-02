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
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'docs.google.com',
  'drive.usercontent.google.com',
];

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  // Validate the URL
  let parsed;
  try {
    parsed = new URL(url);
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
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Mimic browser request to avoid Google Drive blocking
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
    });

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
