// ═══════════════════════════════════════════════════════════════
//  Server-side story rendering using @napi-rs/canvas
//
//  Renders the Instagram story design on Node.js (Vercel serverless).
//
//  Exports:
//    renderStoryOnServer(storyData) → PNG Buffer
//    renderStoryGif(storyData)      → GIF Buffer (animated)
//
//  Static imports (no dynamic import) so Vercel's bundler
//  correctly traces all dependencies into the serverless bundle.
// ═══════════════════════════════════════════════════════════════

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { renderAnimatedFrame } from '../../src/utils/renderAnimatedFrame.js';
import { DEFAULT_THEME } from '../../src/utils/theme.js';
import { TOTAL_FRAMES, FPS } from '../../src/utils/constants.js';
import GIFEncoder from 'gif-encoder-2';

// ── Font loading (once per cold start) ──
let fontsLoaded = false;

async function loadFonts() {
  if (fontsLoaded) return;

  const fontSpecs = [
    { name: 'Bebas Neue', url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2' },
    { name: 'Poppins', url: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2' },
    { name: 'Poppins', url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLGT9Z1JlFd2JQEl8qw.woff2' },
    { name: 'Poppins', url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1JlFd2JQEl8qw.woff2' },
    { name: 'Poppins', url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1JlFd2JQEl8qw.woff2' },
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

// ── Basic color extraction ──
function extractColors(sampleCtx) {
  const rgb = (c) => `${c[0]}, ${c[1]}, ${c[2]}`;
  const data = sampleCtx.getImageData(0, 0, 10, 10).data;

  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i + 1] / 32) * 32;
    const b = Math.round(data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }

  const sorted = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.split(',').map(Number));

  const dominant = sorted[0] || [0, 180, 255];
  const vibrancy = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const vibrant = [...sorted].sort((a, b) => vibrancy(b) - vibrancy(a));

  const primary = vibrant[0] || dominant;
  const accent = vibrant[1] || [140, 80, 255];
  const warm = sorted.find((c) => c[0] > 130 && c[0] > c[2]) || [255, 80, 60];
  const cool = sorted.find((c) => c[2] > 130 && c[2] > c[0]) || primary;

  return {
    primary, accent, warm, cool, dominant,
    primaryRgb: rgb(primary),
    accentRgb: rgb(accent),
    warmRgb: rgb(warm),
    coolRgb: rgb(cool),
    dominantRgb: rgb(dominant),
  };
}

// ── Shared setup: load fonts, image, compute theme + crop rect ──
async function prepareRender(storyData) {
  await loadFonts();

  const W = 1080;
  const H = 1920;

  const imageUrl = storyData['Image URL'];
  let img = null;
  if (imageUrl) {
    try {
      img = await loadImage(imageUrl);
    } catch (e) {
      console.warn('Failed to load image:', e.message);
    }
  }

  let theme;
  if (img) {
    const sampleCanvas = createCanvas(10, 10);
    const sampleCtx = sampleCanvas.getContext('2d');
    sampleCtx.drawImage(img, 0, 0, 10, 10);
    theme = extractColors(sampleCtx);
  } else {
    theme = DEFAULT_THEME;
  }

  let cropRect = null;
  if (img) {
    const imgRatio = img.width / img.height;
    const canvasRatio = W / H;
    if (imgRatio > canvasRatio) {
      const sw = img.height * canvasRatio;
      cropRect = { x: (img.width - sw) / 2, y: 0, width: sw, height: img.height };
    } else {
      const sh = img.width / canvasRatio;
      cropRect = { x: 0, y: (img.height - sh) / 2, width: img.width, height: sh };
    }
  }

  return { img, theme, cropRect, W, H };
}

// ═══════════════════════════════════════════════════════
//  renderStoryOnServer — static PNG (last frame)
// ═══════════════════════════════════════════════════════
export async function renderStoryOnServer(storyData) {
  const { img, theme, cropRect, W, H } = await prepareRender(storyData);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  renderAnimatedFrame({
    ctx, img, cropRect, storyData, theme,
    frame: TOTAL_FRAMES - 1,
    fps: FPS,
  });

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════
//  renderStoryGif — animated GIF
//
//  Renders at half resolution (540×960) for speed + size.
//  Samples 40 key frames across the animation timeline
//  to show the progressive reveal effect.
//  Typical output: 2-5 MB, well within Telegram's 50 MB limit.
// ═══════════════════════════════════════════════════════
export async function renderStoryGif(storyData) {
  const { img, theme, cropRect } = await prepareRender(storyData);

  // Render at half resolution for speed
  const GIF_W = 540;
  const GIF_H = 960;
  const FULL_W = 1080;
  const FULL_H = 1920;

  // Sample 40 frames spread across the animation timeline
  // Focus more frames on the reveal phase (0-180) and fewer on the tail
  const keyFrames = [];
  for (let i = 0; i < 30; i++) keyFrames.push(Math.round(i * 6));    // 0-174, every 6th frame
  for (let i = 0; i < 5; i++) keyFrames.push(180 + i * 8);           // 180-212
  for (let i = 0; i < 5; i++) keyFrames.push(220 + i * 4);           // 220-236
  keyFrames.push(TOTAL_FRAMES - 1);                                    // 239 (final)

  // Full-resolution canvas for rendering
  const fullCanvas = createCanvas(FULL_W, FULL_H);
  const fullCtx = fullCanvas.getContext('2d');

  // Half-resolution canvas for downscaling
  const halfCanvas = createCanvas(GIF_W, GIF_H);
  const halfCtx = halfCanvas.getContext('2d');

  // GIF encoder at half resolution
  const encoder = new GIFEncoder(GIF_W, GIF_H, 'neuquant', true);
  encoder.setDelay(120);     // ~8 fps effective playback
  encoder.setQuality(15);    // Lower = better quality but slower (10-30 range)
  encoder.setRepeat(0);      // Loop forever
  encoder.start();

  for (const frame of keyFrames) {
    // Render full resolution frame
    renderAnimatedFrame({
      ctx: fullCtx, img, cropRect, storyData, theme,
      frame,
      fps: FPS,
    });

    // Downscale to half resolution
    halfCtx.clearRect(0, 0, GIF_W, GIF_H);
    halfCtx.drawImage(fullCanvas, 0, 0, GIF_W, GIF_H);

    // Add frame to GIF
    const imageData = halfCtx.getImageData(0, 0, GIF_W, GIF_H);
    encoder.addFrame(imageData);
  }

  // Hold last frame longer (800ms)
  const lastFrame = halfCtx.getImageData(0, 0, GIF_W, GIF_H);
  encoder.setDelay(800);
  encoder.addFrame(lastFrame);

  encoder.finish();
  return encoder.out.getData();
}
