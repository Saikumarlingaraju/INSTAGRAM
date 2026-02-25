// ═══════════════════════════════════════════════════════════════
//  Server-side story rendering using @napi-rs/canvas
//
//  Renders the Instagram story design on Node.js (Vercel serverless).
//  Uses renderAnimatedFrame at the last frame for a static image.
//
//  Limitations vs browser:
//    - Uses center-crop (no smartcrop.js)
//    - Uses basic color sampling (no ColorThief)
//    - letterSpacing may not be available
// ═══════════════════════════════════════════════════════════════

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

// Register Google Fonts from URLs (fetched once per cold start)
let fontsLoaded = false;

async function loadFonts() {
  if (fontsLoaded) return;

  const fontSpecs = [
    {
      name: 'Bebas Neue',
      url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2',
    },
    {
      name: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2',
    },
    {
      name: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLGT9Z1JlFd2JQEl8qw.woff2',
    },
    {
      name: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1JlFd2JQEl8qw.woff2',
    },
    {
      name: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1JlFd2JQEl8qw.woff2',
    },
  ];

  for (const spec of fontSpecs) {
    try {
      const res = await fetch(spec.url);
      const buffer = Buffer.from(await res.arrayBuffer());
      GlobalFonts.register(buffer, spec.name);
    } catch (e) {
      console.warn(`Failed to load font ${spec.name}:`, e.message);
    }
  }

  fontsLoaded = true;
  console.log('✅ Server-side fonts loaded');
}

// ── Basic color extraction — sample pixels from image ──
function extractColors(canvas, ctx) {
  const rgb = (c) => `${c[0]}, ${c[1]}, ${c[2]}`;

  // Sample from a small region
  const sampleSize = 10;
  const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    // Quantize to 32-step buckets
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i + 1] / 32) * 32;
    const b = Math.round(data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }

  // Sort by frequency
  const sorted = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.split(',').map(Number));

  const dominant = sorted[0] || [0, 180, 255];

  // Find vibrant colors
  const vibrancy = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const vibrant = [...sorted].sort((a, b) => vibrancy(b) - vibrancy(a));

  const primary = vibrant[0] || dominant;
  const accent = vibrant[1] || [140, 80, 255];
  const warm = sorted.find((c) => c[0] > 130 && c[0] > c[2]) || [255, 80, 60];
  const cool = sorted.find((c) => c[2] > 130 && c[2] > c[0]) || primary;

  return {
    primary,
    accent,
    warm,
    cool,
    dominant,
    primaryRgb: rgb(primary),
    accentRgb: rgb(accent),
    warmRgb: rgb(warm),
    coolRgb: rgb(cool),
    dominantRgb: rgb(dominant),
  };
}

// ═══════════════════════════════════════════════════════
//  Main render function
// ═══════════════════════════════════════════════════════
export async function renderStoryOnServer(storyData) {
  // Dynamically import renderAnimatedFrame (it uses ESM + remotion)
  const { renderAnimatedFrame } = await import('../src/utils/renderAnimatedFrame.js');

  await loadFonts();

  const W = 1080;
  const H = 1920;

  // Load the image
  const imageUrl = storyData['Image URL'];
  let img = null;
  if (imageUrl) {
    try {
      img = await loadImage(imageUrl);
    } catch (e) {
      console.warn('Failed to load image:', e.message);
    }
  }

  // Create main canvas
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Extract basic colors from image
  let theme;
  if (img) {
    // Draw image small for color sampling
    const sampleCanvas = createCanvas(10, 10);
    const sampleCtx = sampleCanvas.getContext('2d');
    sampleCtx.drawImage(img, 0, 0, 10, 10);
    theme = extractColors(sampleCanvas, sampleCtx);
  } else {
    const { DEFAULT_THEME } = await import('../src/utils/theme.js');
    theme = DEFAULT_THEME;
  }

  // Center-crop rectangle (fallback, no smartcrop)
  let cropRect = null;
  if (img) {
    const imgRatio = img.width / img.height;
    const canvasRatio = W / H;
    if (imgRatio > canvasRatio) {
      const sw = img.height * canvasRatio;
      cropRect = {
        x: (img.width - sw) / 2,
        y: 0,
        width: sw,
        height: img.height,
      };
    } else {
      const sh = img.width / canvasRatio;
      cropRect = {
        x: 0,
        y: (img.height - sh) / 2,
        width: img.width,
        height: sh,
      };
    }
  }

  // Render the last frame (fully revealed, static)
  renderAnimatedFrame({
    ctx,
    img,
    cropRect,
    storyData,
    theme,
    frame: 239,
    fps: 30,
  });

  // Return PNG buffer
  return canvas.toBuffer('image/png');
}
