// ═══════════════════════════════════════════════════════════════
//  renderHelpers.js
//
//  Pure utility functions shared across all layout renderers.
//  Extracted from renderAnimatedFrame.js for reuse.
// ═══════════════════════════════════════════════════════════════

// ── Pre-generated noise textures for film grain (cached) ──
const GRAIN_TEXTURES = [];
const GRAIN_W = 270;
const GRAIN_H = 480;
const GRAIN_COUNT = 4;

export function getGrainTexture(frameIndex) {
  const idx = frameIndex % GRAIN_COUNT;
  if (GRAIN_TEXTURES[idx]) return GRAIN_TEXTURES[idx];

  let noiseCanvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    noiseCanvas = new OffscreenCanvas(GRAIN_W, GRAIN_H);
  } else if (typeof document !== 'undefined') {
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = GRAIN_W;
    noiseCanvas.height = GRAIN_H;
  } else {
    return null; // Node.js — skip grain
  }

  const nCtx = noiseCanvas.getContext('2d');
  const noiseImg = nCtx.createImageData(GRAIN_W, GRAIN_H);
  const nd = noiseImg.data;
  for (let i = 0; i < nd.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    nd[i] = v;
    nd[i + 1] = v;
    nd[i + 2] = v;
    nd[i + 3] = 255;
  }
  nCtx.putImageData(noiseImg, 0, 0);
  GRAIN_TEXTURES[idx] = noiseCanvas;
  return noiseCanvas;
}

// ── Shadow helpers ──
export function setShadow(ctx, blur = 8, alpha = 0.6) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
}

export function setGlow(ctx, color, blur = 20) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// ── Cached date formatter ──
let _cachedDate = '';
let _cachedDateTs = 0;

export function getFormattedDate(dateStr) {
  // If a sheet Date value is provided, use it
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        });
      }
    } catch { /* fall through to current date */ }
  }

  // Fallback: current date (cached per minute)
  const now = Date.now();
  if (now - _cachedDateTs > 60_000) {
    _cachedDate = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    _cachedDateTs = now;
  }
  return _cachedDate;
}

// ── Text helpers ──
export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY;
}

export function measureWrappedHeight(ctx, text, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lines = 1;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      line = words[n] + ' ';
      lines++;
    } else {
      line = testLine;
    }
  }
  return lines * lineHeight;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function computeWordPositions(ctx, words, startX, startY, maxWidth, lineHeight) {
  const positions = [];
  let x = startX;
  let y = startY;
  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;
    const spaceWidth = ctx.measureText(' ').width;
    if (x + wordWidth > startX + maxWidth && x > startX) {
      x = startX;
      y += lineHeight;
    }
    positions.push({ word, x, y, width: wordWidth });
    x += wordWidth + spaceWidth;
  }
  return positions;
}

/** Resolve a theme gradient key (e.g. 'warm') to the `Rgb` string */
export function themeRgb(theme, key) {
  return theme[key + 'Rgb'] || theme.primaryRgb;
}

/**
 * Try to split text into two parts at a semantic boundary.
 * Returns [part1, part2] or null if no good split found.
 */
export function splitTextAtBoundary(text, keywords) {
  const defaultKeywords = keywords || [
    'However,', 'In reality,', 'The truth is', 'Actually,',
    'But in fact', 'On the other hand', 'In contrast',
    'The fact is', 'vs.', 'vs ', 'versus',
  ];
  for (const kw of defaultKeywords) {
    const idx = text.indexOf(kw);
    if (idx > 20 && idx < text.length - 20) {
      return [text.substring(0, idx).trim(), text.substring(idx).trim()];
    }
  }
  // Fallback: split at midpoint sentence boundary
  const sentences = text.split('. ');
  if (sentences.length >= 2) {
    const mid = Math.ceil(sentences.length / 2);
    return [
      sentences.slice(0, mid).join('. ') + '.',
      sentences.slice(mid).join('. ') + (text.endsWith('.') ? '' : '.'),
    ];
  }
  return null;
}
