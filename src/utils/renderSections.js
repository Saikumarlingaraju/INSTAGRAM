// ═══════════════════════════════════════════════════════════════
//  renderSections.js
//
//  Each function draws one visual section of the Instagram story.
//  Composable — layout composers pick which sections to include.
//
//  All functions use ctx.save()/restore() — no state leaks.
//  Functions that advance the vertical cursor return the new cursorY.
// ═══════════════════════════════════════════════════════════════

import { interpolate, spring } from './animation.js';
import {
  W as CONST_W, H as CONST_H,
  SAFE_TOP as CONST_SAFE_TOP,
  POLL_ZONE_TOP as CONST_POLL_ZONE_TOP,
  POLL_ZONE_BOTTOM as CONST_POLL_ZONE_BOTTOM,
  PAD as CONST_PAD,
  CONTENT_W as CONST_CONTENT_W,
  FONT_DISPLAY as CONST_FONT_DISPLAY,
  FONT_BODY as CONST_FONT_BODY,
} from './constants.js';
import {
  getGrainTexture, setShadow, setGlow, clearShadow,
  getFormattedDate, wrapText, measureWrappedHeight,
  roundRect, computeWordPositions, themeRgb,
} from './renderHelpers.js';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// Shorthand aliases for constants
const W = CONST_W;
const H = CONST_H;
const SAFE_TOP = CONST_SAFE_TOP;
const POLL_ZONE_TOP = CONST_POLL_ZONE_TOP;
const POLL_ZONE_BOTTOM = CONST_POLL_ZONE_BOTTOM;
const PAD = CONST_PAD;
const CONTENT_W = CONST_CONTENT_W;
const FONT_DISPLAY = CONST_FONT_DISPLAY;
const FONT_BODY = CONST_FONT_BODY;

// ═══════════════════════════════════════════════════════════════
//  §1-3  BACKGROUND — image + overlay + grain
// ═══════════════════════════════════════════════════════════════

export function drawBackground(ctx, img, cropRect, frame, T) {
  // Clear
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050514';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // Ken Burns zoom
  const bgOpacity = interpolate(frame, [0, 20], [0, 1], CLAMP);
  const zoom = interpolate(frame, [0, 240], [1.0, 1.12], CLAMP);
  const panX = interpolate(frame, [0, 240], [0, -15], CLAMP);
  const panY = interpolate(frame, [0, 240], [0, -10], CLAMP);

  if (img && bgOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = bgOpacity;
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
      ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, W, H);
    } else {
      const imgRatio = img.width / img.height;
      const canvasRatio = W / H;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (imgRatio > canvasRatio) {
        sw = img.height * canvasRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / canvasRatio;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    }
    ctx.restore();
  }

  // Dark overlay
  const overlayAlpha = interpolate(frame - T.overlayStart, [0, 15], [0, 1], CLAMP);
  if (overlayAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = overlayAlpha;
    const fullOverlay = ctx.createLinearGradient(0, 0, 0, H);
    fullOverlay.addColorStop(0, 'rgba(5, 5, 20, 0.78)');
    fullOverlay.addColorStop(0.22, 'rgba(5, 5, 20, 0.50)');
    fullOverlay.addColorStop(0.45, 'rgba(5, 5, 20, 0.12)');
    fullOverlay.addColorStop(0.62, 'rgba(5, 5, 20, 0.08)');
    fullOverlay.addColorStop(0.78, 'rgba(5, 5, 20, 0.40)');
    fullOverlay.addColorStop(1, 'rgba(5, 5, 20, 0.88)');
    ctx.fillStyle = fullOverlay;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Film grain
  if (frame > T.overlayStart) {
    const noiseCanvas = getGrainTexture(frame);
    if (noiseCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(noiseCanvas, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  §4  CORNER FRAME ACCENTS
// ═══════════════════════════════════════════════════════════════

export function drawCornerAccents(ctx, frame, T, theme, fps) {
  const corners = [
    { sx: 1, sy: 1, ax: 45, ay: 45 },
    { sx: -1, sy: 1, ax: W - 45, ay: 45 },
    { sx: 1, sy: -1, ax: 45, ay: H - 45 },
    { sx: -1, sy: -1, ax: W - 45, ay: H - 45 },
  ];
  corners.forEach((c, i) => {
    const s = spring({ frame: frame - T.cornerFrames - i * 3, fps, config: { damping: 15 } });
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = s;
    ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.20)`;
    ctx.lineWidth = 2;
    ctx.translate(c.ax, c.ay);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, c.sy * 60);
    ctx.lineTo(0, 0);
    ctx.lineTo(c.sx * 60, 0);
    ctx.stroke();
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
//  §5  STORY DOTS
// ═══════════════════════════════════════════════════════════════

export function drawStoryDots(ctx, frame, T) {
  const dotsAlpha = interpolate(frame - (T.accentBar - 5), [0, 10], [0, 1], CLAMP);
  if (dotsAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = dotsAlpha;
  clearShadow(ctx);
  const dotY = SAFE_TOP - 30;
  const dotSpacing = 18;
  const totalDots = 4;
  const dotsStartX = W / 2 - ((totalDots - 1) * dotSpacing) / 2;
  for (let i = 0; i < totalDots; i++) {
    ctx.beginPath();
    ctx.arc(dotsStartX + i * dotSpacing, dotY, i === 0 ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §6  ACCENT BAR — returns cursorY
// ═══════════════════════════════════════════════════════════════

export function drawAccentBar(ctx, frame, T, theme) {
  const barScaleX = interpolate(frame - T.accentBar, [0, 20], [0, 1], CLAMP);
  if (barScaleX > 0) {
    ctx.save();
    setGlow(ctx, `rgba(${theme.primaryRgb}, 0.5)`, 12);
    const accentGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    accentGrad.addColorStop(0, `rgba(${theme.primaryRgb}, 0.9)`);
    accentGrad.addColorStop(0.5, `rgba(${theme.accentRgb}, 0.9)`);
    accentGrad.addColorStop(1, `rgba(${theme.warmRgb}, 0.9)`);
    ctx.fillStyle = accentGrad;
    ctx.fillRect(PAD, SAFE_TOP, CONTENT_W * barScaleX, 4);
    clearShadow(ctx);
    ctx.restore();
  }
  return SAFE_TOP + 18;
}

// ═══════════════════════════════════════════════════════════════
//  §7  BADGE — parameterized text & gradient
// ═══════════════════════════════════════════════════════════════

export function drawBadge(ctx, cursorY, frame, T, theme, fps, badgeText, gradStart, gradEnd, metrics = {}) {
  const badgeS = spring({ frame: frame - T.badge, fps, config: { damping: 12 } });
  if (badgeS <= 0) return;

  const startRgb = themeRgb(theme, gradStart || 'warm');
  const endRgb = themeRgb(theme, gradEnd || 'accent');

  ctx.font = `600 ${metrics.badgeSize || 22}px ${FONT_BODY}`;
  const badgeW = ctx.measureText(badgeText).width + 28;
  const badgeH = 36;

  ctx.save();
  ctx.globalAlpha = badgeS;
  const badgeCenterX = PAD + badgeW / 2;
  const badgeCenterY = cursorY + badgeH / 2;
  ctx.translate(badgeCenterX, badgeCenterY);
  const s = interpolate(badgeS, [0, 1], [0.85, 1]);
  ctx.scale(s, s);
  ctx.translate(-badgeCenterX, -badgeCenterY);

  const badgeGrad = ctx.createLinearGradient(PAD, cursorY, PAD + badgeW, cursorY);
  badgeGrad.addColorStop(0, `rgba(${startRgb}, 0.9)`);
  badgeGrad.addColorStop(1, `rgba(${endRgb}, 0.9)`);
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
  ctx.fill();

  setGlow(ctx, `rgba(${startRgb}, 0.3)`, 15);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
  ctx.fill();
  clearShadow(ctx);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${Math.max(18, (metrics.badgeSize || 22) - 2)}px ${FONT_BODY}`;
  ctx.fillText(badgeText, PAD + 14, cursorY + 8);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §8  DATE — accepts optional dateStr from sheet
// ═══════════════════════════════════════════════════════════════

export function drawDate(ctx, cursorY, frame, T, dateStr, metrics = {}) {
  const dateAlpha = interpolate(frame - T.date, [0, 10], [0, 1], CLAMP);
  const dateSlide = interpolate(frame - T.date, [0, 10], [30, 0], CLAMP);
  if (dateAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = dateAlpha;
  ctx.translate(0, dateSlide);
  const today = getFormattedDate(dateStr);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `400 ${metrics.dateSize || 20}px ${FONT_BODY}`;
  ctx.textAlign = 'right';
  ctx.fillText(today, W - PAD, cursorY + 8);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §9  HEADLINE — word-by-word spring reveal → returns cursorY
// ═══════════════════════════════════════════════════════════════

export function drawHeadline(ctx, cursorY, text, frame, T, theme, fps, metrics = {}) {
  const headlineSize = metrics.headlineSize || 80;
  const headlineLeading = metrics.headlineLeading || 88;
  const headlineText = (text || '').toUpperCase();
  const headlineWords = headlineText.split(' ');

  if (!headlineWords.length || !headlineWords[0]) return cursorY + headlineLeading + 15;

  ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';

  const wordPositions = computeWordPositions(
    ctx, headlineWords, PAD, cursorY, CONTENT_W, headlineLeading
  );

  wordPositions.forEach((wp, i) => {
    const wordDelay = T.headlineStart + i * 4;
    const s = spring({ frame: frame - wordDelay, fps, config: { damping: 14 } });
    if (s <= 0) return;

    ctx.save();
    ctx.globalAlpha = s;
    const slideY = interpolate(s, [0, 1], [30, 0]);

    if (i === 0) {
      setGlow(ctx, `rgba(${theme.primaryRgb}, 0.7)`, 30);
    } else {
      setShadow(ctx, 12, 0.7);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillText(wp.word, wp.x, wp.y + slideY);
    clearShadow(ctx);
    ctx.restore();
  });

  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  const lastWord = wordPositions[wordPositions.length - 1];
  return lastWord ? lastWord.y + headlineLeading + 15 : cursorY + headlineLeading + 15;
}

// ═══════════════════════════════════════════════════════════════
//  §10  GRADIENT DIVIDER → returns cursorY
// ═══════════════════════════════════════════════════════════════

export function drawDivider(ctx, cursorY, frame, T, theme) {
  const divScaleX = interpolate(frame - T.divider, [0, 15], [0, 1], CLAMP);
  if (divScaleX > 0) {
    ctx.save();
    setGlow(ctx, `rgba(${theme.primaryRgb}, 0.4)`, 8);
    const divGrad = ctx.createLinearGradient(PAD, 0, PAD + 250, 0);
    divGrad.addColorStop(0, `rgba(${theme.primaryRgb}, 0.8)`);
    divGrad.addColorStop(1, `rgba(${theme.primaryRgb}, 0)`);
    ctx.fillStyle = divGrad;
    ctx.fillRect(PAD, cursorY, 250 * divScaleX, 3);
    clearShadow(ctx);
    ctx.restore();
  }
  return cursorY + 20;
}

// ═══════════════════════════════════════════════════════════════
//  §11  GLASSMORPHISM SUMMARY CARD → returns cursorY
// ═══════════════════════════════════════════════════════════════

export function drawSummaryCard(ctx, cursorY, summaryText, sourceText, frame, T, theme, metrics = {}) {
  const cardAlpha = interpolate(frame - T.cardReveal, [0, 20], [0, 1], CLAMP);
  const cardSlide = interpolate(frame - T.cardReveal, [0, 20], [40, 0], CLAMP);

  if (cardAlpha <= 0 || !summaryText) return cursorY;

  ctx.save();
  ctx.globalAlpha = cardAlpha;
  ctx.translate(0, cardSlide);

  const summarySize = metrics.summarySize || 34;
  const summaryLineHeight = metrics.summaryLineHeight || 48;

  ctx.font = `400 ${summarySize}px ${FONT_BODY}`;
  const summaryH = measureWrappedHeight(ctx, summaryText, CONTENT_W - 60, summaryLineHeight);
  const cardPadV = 20;
  const cardH = cardPadV + summaryH + cardPadV;

  // Glass card background
  clearShadow(ctx);
  ctx.fillStyle = `rgba(${theme.dominantRgb}, 0.10)`;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
  ctx.fill();

  // Glass card border
  setGlow(ctx, `rgba(${theme.primaryRgb}, 0.15)`, 6);
  ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.20)`;
  ctx.lineWidth = 1.5;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
  ctx.stroke();
  clearShadow(ctx);

  // Left accent bar
  setGlow(ctx, `rgba(${theme.primaryRgb}, 0.4)`, 6);
  ctx.fillStyle = `rgba(${theme.primaryRgb}, 0.7)`;
  roundRect(ctx, PAD + 3, cursorY + 10, 4, cardH - 20, 2);
  ctx.fill();
  clearShadow(ctx);

  // Summary text
  const textAlpha = interpolate(frame - T.summaryText, [0, 25], [0, 1], CLAMP);
  setShadow(ctx, 6, 0.4);
  ctx.fillStyle = `rgba(230, 235, 245, ${0.95 * textAlpha})`;
  ctx.font = `400 ${summarySize}px ${FONT_BODY}`;
  wrapText(ctx, summaryText, PAD + 22, cursorY + cardPadV, CONTENT_W - 60, summaryLineHeight);
  clearShadow(ctx);

  const cardBottomY = cursorY + cardH;
  let outY = cardBottomY + 12;

  // Source attribution
  const srcAlpha = interpolate(frame - T.source, [0, 10], [0, 1], CLAMP);
  const srcSlide = interpolate(frame - T.source, [0, 10], [20, 0], CLAMP);
  if (srcAlpha > 0 && sourceText) {
    ctx.globalAlpha = cardAlpha * srcAlpha;
    ctx.translate(0, srcSlide);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = `italic 400 ${metrics.sourceSize || 20}px ${FONT_BODY}`;
    ctx.fillText(sourceText, PAD + 22, outY);
  }
  outY += 35;

  ctx.restore();
  outY += cardSlide;
  return outY;
}

// ═══════════════════════════════════════════════════════════════
//  §11b  DUAL CARD (myth/fact or comparison) → returns cursorY
// ═══════════════════════════════════════════════════════════════

export function drawDualCard(ctx, cursorY, part1, part2, label1, label2, color1Rgb, color2Rgb, frame, T, metrics = {}) {
  const cardAlpha = interpolate(frame - T.cardReveal, [0, 20], [0, 1], CLAMP);
  const cardSlide = interpolate(frame - T.cardReveal, [0, 20], [40, 0], CLAMP);

  if (cardAlpha <= 0) return cursorY;

  ctx.save();
  ctx.globalAlpha = cardAlpha;
  ctx.translate(0, cardSlide);

  const cardPadV = 16;
  const textAlpha = interpolate(frame - T.summaryText, [0, 25], [0, 1], CLAMP);

  // Measure both parts
  const dualSize = metrics.dualCardSize || 30;
  const dualLineHeight = metrics.dualCardLineHeight || 42;

  ctx.font = `400 ${dualSize}px ${FONT_BODY}`;
  const part1H = measureWrappedHeight(ctx, part1, CONTENT_W - 70, dualLineHeight);
  const part2H = measureWrappedHeight(ctx, part2, CONTENT_W - 70, dualLineHeight);

  const labelH = 30;
  const gap = 14;

  // Card 1
  const card1TotalH = cardPadV + labelH + 6 + part1H + cardPadV;
  clearShadow(ctx);
  ctx.fillStyle = `rgba(${color1Rgb}, 0.10)`;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, card1TotalH, 14);
  ctx.fill();

  // Card 1 border
  ctx.strokeStyle = `rgba(${color1Rgb}, 0.25)`;
  ctx.lineWidth = 1.5;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, card1TotalH, 14);
  ctx.stroke();

  // Card 1 label
  ctx.fillStyle = `rgba(${color1Rgb}, 0.9)`;
  ctx.font = `700 ${Math.max(18, dualSize - 8)}px ${FONT_BODY}`;
  ctx.fillText(label1, PAD + 16, cursorY + cardPadV);

  // Card 1 text
  ctx.fillStyle = `rgba(230, 235, 245, ${0.95 * textAlpha})`;
  ctx.font = `400 ${dualSize}px ${FONT_BODY}`;
  wrapText(ctx, part1, PAD + 16, cursorY + cardPadV + labelH + 6, CONTENT_W - 70, dualLineHeight);

  cursorY += card1TotalH + gap;

  // Card 2
  const card2TotalH = cardPadV + labelH + 6 + part2H + cardPadV;
  ctx.fillStyle = `rgba(${color2Rgb}, 0.10)`;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, card2TotalH, 14);
  ctx.fill();

  ctx.strokeStyle = `rgba(${color2Rgb}, 0.25)`;
  ctx.lineWidth = 1.5;
  roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, card2TotalH, 14);
  ctx.stroke();

  // Card 2 label
  ctx.fillStyle = `rgba(${color2Rgb}, 0.9)`;
  ctx.font = `700 ${Math.max(18, dualSize - 8)}px ${FONT_BODY}`;
  ctx.fillText(label2, PAD + 16, cursorY + cardPadV);

  // Card 2 text
  ctx.fillStyle = `rgba(230, 235, 245, ${0.95 * textAlpha})`;
  ctx.font = `400 ${dualSize}px ${FONT_BODY}`;
  wrapText(ctx, part2, PAD + 16, cursorY + cardPadV + labelH + 6, CONTENT_W - 70, dualLineHeight);

  cursorY += card2TotalH + 12;

  ctx.restore();
  cursorY += cardSlide;
  return cursorY;
}

// ═══════════════════════════════════════════════════════════════
//  §CTA  CALL TO ACTION — rendered on canvas
// ═══════════════════════════════════════════════════════════════

export function drawCTA(ctx, cursorY, ctaText, ctaEmoji, frame, T, theme, opts = {}, metrics = {}) {
  if (!ctaText) return cursorY;

  const ctaFrame = T.source + 10; // appears shortly after source
  const ctaAlpha = interpolate(frame - ctaFrame, [0, 12], [0, 1], CLAMP);
  const ctaSlide = interpolate(frame - ctaFrame, [0, 12], [25, 0], CLAMP);

  if (ctaAlpha <= 0) return cursorY;

  const fullText = ctaEmoji ? `${ctaEmoji} ${ctaText}` : ctaText;
  const isProminent = opts.prominent || false;

  ctx.save();
  ctx.globalAlpha = ctaAlpha;
  ctx.translate(0, ctaSlide);

  if (isProminent) {
    // Prominent CTA: full-width gradient pill
    const ctaPillSize = metrics.ctaPillSize || 28;
    ctx.font = `600 ${ctaPillSize}px ${FONT_BODY}`;
    const textW = ctx.measureText(fullText).width;
    const pillW = Math.min(textW + 48, CONTENT_W);
    const pillH = 52;
    const pillX = PAD + (CONTENT_W - pillW) / 2;

    const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillGrad.addColorStop(0, `rgba(${theme.accentRgb}, 0.85)`);
    pillGrad.addColorStop(1, `rgba(${theme.primaryRgb}, 0.85)`);
    ctx.fillStyle = pillGrad;
    roundRect(ctx, pillX, cursorY, pillW, pillH, 26);
    ctx.fill();

    setGlow(ctx, `rgba(${theme.accentRgb}, 0.3)`, 12);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    roundRect(ctx, pillX, cursorY, pillW, pillH, 26);
    ctx.fill();
    clearShadow(ctx);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 ${Math.max(18, ctaPillSize - 2)}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(fullText, W / 2, cursorY + 14);
    ctx.textAlign = 'left';

    cursorY += pillH + 14;
  } else {
    // Subtle CTA: small text with accent color
    const ctaSize = metrics.ctaSize || 24;
    ctx.font = `500 ${ctaSize}px ${FONT_BODY}`;
    ctx.fillStyle = `rgba(${theme.accentRgb}, 0.85)`;
    ctx.fillText(fullText, PAD + 22, cursorY);
    cursorY += 36;
  }

  ctx.restore();
  return cursorY;
}

// ═══════════════════════════════════════════════════════════════
//  §12  DECORATIVE DOT GRID
// ═══════════════════════════════════════════════════════════════

export function drawDotGrid(ctx, cursorY, frame, T, theme) {
  const dotGridAlpha = interpolate(frame - T.dotGrid, [0, 20], [0, 0.5], CLAMP);
  if (dotGridAlpha <= 0) return;

  const dotGridStartY = cursorY + 20;
  const dotGridEndY = POLL_ZONE_TOP - 180;
  if (dotGridEndY <= dotGridStartY + 40) return;

  ctx.save();
  ctx.globalAlpha = dotGridAlpha;
  clearShadow(ctx);
  const gridCenterX = W / 2;
  const gridCenterY = (dotGridStartY + dotGridEndY) / 2;
  const gridSize = Math.min(dotGridEndY - dotGridStartY, 200);
  const gridCols = 6;
  const gridRows = Math.floor(gridSize / 35);
  const gridSpacing = 35;

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const dx = gridCenterX - ((gridCols - 1) * gridSpacing) / 2 + col * gridSpacing;
      const dy = gridCenterY - ((gridRows - 1) * gridSpacing) / 2 + row * gridSpacing;
      const dist = Math.sqrt(
        Math.pow((col - (gridCols - 1) / 2) / gridCols, 2) +
        Math.pow((row - (gridRows - 1) / 2) / gridRows, 2)
      );
      const alpha = Math.max(0.03, 0.12 - dist * 0.15);

      const dotIdx = row * gridCols + col;
      const dotDelay = T.dotGrid + dotIdx * 0.5;
      const dotScale = interpolate(frame - dotDelay, [0, 10], [0, 1], CLAMP);
      if (dotScale <= 0) continue;

      ctx.beginPath();
      ctx.arc(dx, dy, 2 * dotScale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${theme.primaryRgb}, ${alpha * dotScale})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §13-14  POLL SECTION + POLL ZONE
// ═══════════════════════════════════════════════════════════════

export function drawPollSection(ctx, pollQ, frame, T, theme, fps, metrics = {}) {
  if (!pollQ) return;

  // Dark band
  const pollBandAlpha = interpolate(frame - (T.pollBadge - 5), [0, 10], [0, 1], CLAMP);
  if (pollBandAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = pollBandAlpha;

  const pollQuestionSize = metrics.pollQuestionSize || 36;
  const pollQuestionLineHeight = metrics.pollQuestionLineHeight || 46;

  ctx.font = `600 ${pollQuestionSize}px ${FONT_BODY}`;
  const pollQHeight = measureWrappedHeight(ctx, pollQ, CONTENT_W, pollQuestionLineHeight);
  const pollBadgeH = 32;
  const gapAfterBadge = 12;
  const totalPollBlock = pollBadgeH + gapAfterBadge + pollQHeight;
  const pollBlockStartY = POLL_ZONE_TOP - totalPollBlock - 20;

  clearShadow(ctx);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, pollBlockStartY - 15, W, totalPollBlock + 35);

  ctx.restore();

  // Poll badge — spring
  const pollBadgeS = spring({ frame: frame - T.pollBadge, fps, config: { damping: 12 } });
  if (pollBadgeS > 0) {
    ctx.save();
    ctx.globalAlpha = pollBadgeS;
    setGlow(ctx, `rgba(${theme.accentRgb}, 0.3)`, 10);
    ctx.fillStyle = `rgba(${theme.accentRgb}, 0.85)`;
    roundRect(ctx, PAD, pollBlockStartY, 100, pollBadgeH, 6);
    ctx.fill();
    clearShadow(ctx);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.max(16, pollQuestionSize - 16)}px ${FONT_BODY}`;
    ctx.fillText('📊 POLL', PAD + 12, pollBlockStartY + 7);
    ctx.restore();
  }

  // Poll question — fade + slide
  const pollQAlpha = interpolate(frame - T.pollQuestion, [0, 15], [0, 1], CLAMP);
  const pollQSlide = interpolate(frame - T.pollQuestion, [0, 15], [30, 0], CLAMP);
  if (pollQAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = pollQAlpha;
    ctx.translate(0, pollQSlide);
    setShadow(ctx, 8, 0.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 ${pollQuestionSize}px ${FONT_BODY}`;
    wrapText(ctx, pollQ, PAD, pollBlockStartY + pollBadgeH + gapAfterBadge, CONTENT_W, pollQuestionLineHeight);
    clearShadow(ctx);
    ctx.restore();
  }
}

// ── Poll zone (dashed outline + pulse) ──
export function drawPollZone(ctx, frame, T, theme, metrics = {}) {
  const pzAlpha = interpolate(frame - T.pollZone, [0, 20], [0, 1], CLAMP);
  if (pzAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = pzAlpha;
  clearShadow(ctx);

  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.10)`;
  ctx.lineWidth = 1.5;
  const pzX = PAD + 60;
  const pzW = CONTENT_W - 120;
  const pzY = POLL_ZONE_TOP + 15;
  const pzH = POLL_ZONE_BOTTOM - POLL_ZONE_TOP - 30;
  roundRect(ctx, pzX, pzY, pzW, pzH, 20);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pulsing "Tap to Vote"
  const pulse = interpolate(frame % 30, [0, 15, 30], [1, 1.1, 1]);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `700 ${Math.max(22, metrics.pollQuestionSize ? metrics.pollQuestionSize - 8 : 28)}px ${FONT_BODY}`;
  ctx.textAlign = 'center';

  const tapY = (POLL_ZONE_TOP + POLL_ZONE_BOTTOM) / 2;
  ctx.save();
  ctx.translate(W / 2, tapY - 20);
  ctx.scale(pulse, pulse);
  ctx.fillText('👆 Tap to Vote', 0, 0);
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.font = `400 ${Math.max(16, metrics.dateSize ? metrics.dateSize + 2 : 22)}px ${FONT_BODY}`;
  ctx.fillText('Add Instagram Poll Sticker Here', W / 2, tapY + 18);
  ctx.textAlign = 'left';

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §14b  VISUAL POLL OPTIONS (for debate layout)
// ═══════════════════════════════════════════════════════════════

export function drawVisualPollOptions(ctx, pollOptions, frame, T, theme, metrics = {}) {
  if (!pollOptions) return;

  const options = pollOptions.split('|').map(o => o.trim()).filter(o => o.length > 0).slice(0, 4);
  if (options.length < 2) return;

  const pzAlpha = interpolate(frame - T.pollZone, [0, 20], [0, 1], CLAMP);
  if (pzAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = pzAlpha;
  clearShadow(ctx);

  const chipH = metrics.pollOptionChipHeight || 48;
  const chipGap = 12;
  const totalH = options.length * chipH + (options.length - 1) * chipGap;
  const startY = POLL_ZONE_TOP + (POLL_ZONE_BOTTOM - POLL_ZONE_TOP - totalH) / 2;
  const chipW = CONTENT_W - 60;
  const chipX = PAD + 30;

  options.forEach((opt, i) => {
    const chipY = startY + i * (chipH + chipGap);
    const chipAlpha = interpolate(frame - (T.pollZone + i * 5), [0, 15], [0, 1], CLAMP);
    if (chipAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = pzAlpha * chipAlpha;

    // Chip background
    const colorRgb = i % 2 === 0 ? theme.accentRgb : theme.warmRgb;
    ctx.fillStyle = `rgba(${colorRgb}, 0.15)`;
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.fill();

    // Chip border
    ctx.strokeStyle = `rgba(${colorRgb}, 0.35)`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
    ctx.stroke();

    // Chip text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `500 ${metrics.pollOptionSize || 24}px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(opt, W / 2, chipY + Math.max(12, (chipH / 2) - 4));
    ctx.textAlign = 'left';

    ctx.restore();
  });

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §15  BOTTOM BRANDING
// ═══════════════════════════════════════════════════════════════

export function drawBranding(ctx, frame, T, theme, metrics = {}) {
  const brandAlpha = interpolate(frame - T.branding, [0, 15], [0, 1], CLAMP);
  const brandSlide = interpolate(frame - T.branding, [0, 15], [30, 0], CLAMP);
  if (brandAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = brandAlpha;
  ctx.translate(0, brandSlide);
  clearShadow(ctx);

  const brandLineGrad = ctx.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
  brandLineGrad.addColorStop(0, 'rgba(255,255,255,0)');
  brandLineGrad.addColorStop(0.5, `rgba(${theme.primaryRgb}, 0.20)`);
  brandLineGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = brandLineGrad;
  ctx.fillRect(W / 2 - 80, POLL_ZONE_BOTTOM + 15, 160, 1);

  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.font = `500 ${metrics.dateSize || 18}px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.fillText('HITAM AI  •  Powered by AI', W / 2, POLL_ZONE_BOTTOM + 28);
  ctx.textAlign = 'left';

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  §VS  VS SEPARATOR (for model_battle comparison layout)
// ═══════════════════════════════════════════════════════════════

export function drawVsSeparator(ctx, y, frame, T, theme, fps) {
  const s = spring({ frame: frame - (T.cardReveal + 10), fps, config: { damping: 12 } });
  if (s <= 0) return;

  ctx.save();
  ctx.globalAlpha = s;

  // Circle background
  const cx = W / 2;
  ctx.beginPath();
  ctx.arc(cx, y, 24 * s, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${theme.warmRgb}, 0.9)`;
  ctx.fill();

  setGlow(ctx, `rgba(${theme.warmRgb}, 0.5)`, 15);
  ctx.beginPath();
  ctx.arc(cx, y, 24 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fill();
  clearShadow(ctx);

  // VS text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 22px ${FONT_BODY}`;
  ctx.textAlign = 'center';
  ctx.fillText('VS', cx, y - 10);
  ctx.textAlign = 'left';

  ctx.restore();
}
