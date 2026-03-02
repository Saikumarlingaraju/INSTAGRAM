import { proxyImageUrl } from './proxyImage';

export async function loadImageForRendering(rawUrl) {
  const finalUrl = proxyImageUrl(rawUrl);
  if (!finalUrl) {
    throw new Error('Image URL is empty');
  }

  const response = await fetch(finalUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Proxy returned non-image content: ${contentType || 'unknown'}`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('Fetched image is empty');
  }

  return await new Promise((resolve, reject) => {
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
