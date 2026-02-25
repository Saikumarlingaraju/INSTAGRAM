// ═══════════════════════════════════════════════════════════════
//  renderAnimatedFrame.js
//
//  Renders ONE frame of the animated Instagram story onto a
//  canvas context. Uses Remotion's interpolate/spring for the
//  exact same easing curves as the live Player preview.
//
//  Called 240 times (8s × 30fps) by the video export pipeline.
// ═══════════════════════════════════════════════════════════════

import { interpolate, spring } from 'remotion';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

// ── Reusable helpers (same as static renderer) ──

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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

function measureWrappedHeight(ctx, text, maxWidth, lineHeight) {
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

function roundRect(ctx, x, y, w, h, r) {
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

function computeWordPositions(ctx, words, startX, startY, maxWidth, lineHeight) {
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

// ═══════════════════════════════════════════════════════════════
//  Main render function
// ═══════════════════════════════════════════════════════════════

export function renderAnimatedFrame({ ctx, img, cropRect, storyData, theme, frame, fps = 30 }) {
  const W = ctx.canvas.width;  // 1080
  const H = ctx.canvas.height; // 1920
  const t = theme;

  // ── Safe zones ──
  const SAFE_TOP = 250;
  const POLL_ZONE_TOP = 1310;
  const POLL_ZONE_BOTTOM = 1600;
  const PAD = 70;
  const CONTENT_W = W - PAD * 2;

  // ── Fonts ──
  const FONT_DISPLAY = '"Bebas Neue", "Impact", sans-serif';
  const FONT_BODY = '"Poppins", "Segoe UI", sans-serif';

  // ── Animation timeline (same as AnimatedStory.jsx) ──
  const T = {
    bgStart: 0,
    overlayStart: 5,
    cornerFrames: 10,
    accentBar: 15,
    badge: 22,
    date: 25,
    headlineStart: 30,
    divider: 55,
    cardReveal: 60,
    summaryText: 70,
    source: 90,
    dotGrid: 95,
    pollBadge: 110,
    pollQuestion: 118,
    pollZone: 135,
    branding: 150,
  };

  // ── Shared shadow helpers ──
  const setShadow = (blur = 8, alpha = 0.6) => {
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  };
  const setGlow = (color, blur = 20) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
  const clearShadow = () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  // ── Start fresh ──
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#050514';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // ═══════════════════════════════════════
  //  1. BACKGROUND IMAGE — Ken Burns zoom
  // ═══════════════════════════════════════

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

  // ═══════════════════════════════════════
  //  2. DARK OVERLAY — fade in
  // ═══════════════════════════════════════

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

  // ═══════════════════════════════════════
  //  3. FILM GRAIN — fast noise overlay (no pixel loop)
  // ═══════════════════════════════════════

  if (frame > T.overlayStart) {
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 270;
    noiseCanvas.height = 480;
    const nCtx = noiseCanvas.getContext('2d');
    const noiseImg = nCtx.createImageData(270, 480);
    const nd = noiseImg.data;
    for (let i = 0; i < nd.length; i += 4) {
      const v = Math.random() * 255;
      nd[i] = v;
      nd[i + 1] = v;
      nd[i + 2] = v;
      nd[i + 3] = 255;
    }
    nCtx.putImageData(noiseImg, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(noiseCanvas, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ═══════════════════════════════════════
  //  4. CORNER FRAME ACCENTS — staggered spring
  // ═══════════════════════════════════════

  const corners = [
    { sx: 1, sy: 1, ax: 45, ay: 45 },                          // top-left
    { sx: -1, sy: 1, ax: W - 45, ay: 45 },                     // top-right
    { sx: 1, sy: -1, ax: 45, ay: H - 45 },                     // bottom-left
    { sx: -1, sy: -1, ax: W - 45, ay: H - 45 },                // bottom-right
  ];
  corners.forEach((c, i) => {
    const s = spring({ frame: frame - T.cornerFrames - i * 3, fps, config: { damping: 15 } });
    if (s <= 0) return;
    ctx.save();
    ctx.globalAlpha = s;
    ctx.strokeStyle = `rgba(${t.primaryRgb}, 0.20)`;
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

  // ═══════════════════════════════════════
  //  5. STORY DOTS — fade in
  // ═══════════════════════════════════════

  const dotsAlpha = interpolate(frame - (T.accentBar - 5), [0, 10], [0, 1], CLAMP);
  if (dotsAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = dotsAlpha;
    clearShadow();
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

  // ═══════════════════════════════════════
  //  6. ACCENT BAR — wipe in from left
  // ═══════════════════════════════════════

  const barScaleX = interpolate(frame - T.accentBar, [0, 20], [0, 1], CLAMP);
  if (barScaleX > 0) {
    ctx.save();
    setGlow(`rgba(${t.primaryRgb}, 0.5)`, 12);
    const accentGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    accentGrad.addColorStop(0, `rgba(${t.primaryRgb}, 0.9)`);
    accentGrad.addColorStop(0.5, `rgba(${t.accentRgb}, 0.9)`);
    accentGrad.addColorStop(1, `rgba(${t.warmRgb}, 0.9)`);
    ctx.fillStyle = accentGrad;
    ctx.fillRect(PAD, SAFE_TOP, CONTENT_W * barScaleX, 4);
    clearShadow();
    ctx.restore();
  }

  let cursorY = SAFE_TOP + 18;

  // ═══════════════════════════════════════
  //  7. TRENDING BADGE — spring scale-in
  // ═══════════════════════════════════════

  const badgeS = spring({ frame: frame - T.badge, fps, config: { damping: 12 } });
  if (badgeS > 0) {
    const badgeText = '⚡ TRENDING NEWS';
    ctx.font = `600 22px ${FONT_BODY}`;
    const badgeW = ctx.measureText(badgeText).width + 28;
    const badgeH = 36;

    ctx.save();
    ctx.globalAlpha = badgeS;
    const badgeCenterX = PAD + badgeW / 2;
    const badgeCenterY = cursorY + badgeH / 2;
    ctx.translate(badgeCenterX, badgeCenterY);
    ctx.scale(interpolate(badgeS, [0, 1], [0.85, 1]), interpolate(badgeS, [0, 1], [0.85, 1]));
    ctx.translate(-badgeCenterX, -badgeCenterY);

    const badgeGrad = ctx.createLinearGradient(PAD, cursorY, PAD + badgeW, cursorY);
    badgeGrad.addColorStop(0, `rgba(${t.warmRgb}, 0.9)`);
    badgeGrad.addColorStop(1, `rgba(${t.accentRgb}, 0.9)`);
    ctx.fillStyle = badgeGrad;
    roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
    ctx.fill();

    setGlow(`rgba(${t.warmRgb}, 0.3)`, 15);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
    ctx.fill();
    clearShadow();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `600 20px ${FONT_BODY}`;
    ctx.fillText(badgeText, PAD + 14, cursorY + 8);
    ctx.restore();
  }

  // ═══════════════════════════════════════
  //  8. DATE — fade + slide up
  // ═══════════════════════════════════════

  const dateAlpha = interpolate(frame - T.date, [0, 10], [0, 1], CLAMP);
  const dateSlide = interpolate(frame - T.date, [0, 10], [30, 0], CLAMP);
  if (dateAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = dateAlpha;
    ctx.translate(0, dateSlide);
    const today = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `400 20px ${FONT_BODY}`;
    ctx.textAlign = 'right';
    ctx.fillText(today, W - PAD, cursorY + 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  cursorY += 36 + 20; // badgeH + gap → 324

  // ═══════════════════════════════════════
  //  9. HEADLINE — word-by-word spring reveal
  // ═══════════════════════════════════════

  const headlineSize = 80;
  const headlineLeading = 88;
  const headlineText = (storyData['Headline'] || '').toUpperCase();
  const headlineWords = headlineText.split(' ');

  if (headlineWords.length > 0 && headlineWords[0]) {
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

      // First word gets extra glow
      if (i === 0) {
        setGlow(`rgba(${t.primaryRgb}, 0.7)`, 30);
      } else {
        setShadow(12, 0.7);
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText(wp.word, wp.x, wp.y + slideY);
      clearShadow();
      ctx.restore();
    });

    // Advance cursorY past headline
    const lastWord = wordPositions[wordPositions.length - 1];
    if (lastWord) {
      cursorY = lastWord.y + headlineLeading + 15;
    } else {
      cursorY += headlineLeading + 15;
    }

    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ═══════════════════════════════════════
  //  10. GRADIENT DIVIDER — wipe in
  // ═══════════════════════════════════════

  const divScaleX = interpolate(frame - T.divider, [0, 15], [0, 1], CLAMP);
  if (divScaleX > 0) {
    ctx.save();
    setGlow(`rgba(${t.primaryRgb}, 0.4)`, 8);
    const divGrad = ctx.createLinearGradient(PAD, 0, PAD + 250, 0);
    divGrad.addColorStop(0, `rgba(${t.primaryRgb}, 0.8)`);
    divGrad.addColorStop(1, `rgba(${t.primaryRgb}, 0)`);
    ctx.fillStyle = divGrad;
    ctx.fillRect(PAD, cursorY, 250 * divScaleX, 3);
    clearShadow();
    ctx.restore();
  }
  cursorY += 20;

  // ═══════════════════════════════════════
  //  11. GLASSMORPHISM SUMMARY CARD — slide up
  // ═══════════════════════════════════════

  const cardAlpha = interpolate(frame - T.cardReveal, [0, 20], [0, 1], CLAMP);
  const cardSlide = interpolate(frame - T.cardReveal, [0, 20], [40, 0], CLAMP);
  const summaryText = storyData['News Summary'] || '';

  if (cardAlpha > 0 && summaryText) {
    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.translate(0, cardSlide);

    ctx.font = `400 34px ${FONT_BODY}`;
    const summaryH = measureWrappedHeight(ctx, summaryText, CONTENT_W - 60, 48);
    const cardPadV = 20;
    const cardH = cardPadV + summaryH + cardPadV;

    // Glass card background
    clearShadow();
    ctx.fillStyle = `rgba(${t.dominantRgb}, 0.10)`;
    roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
    ctx.fill();

    // Glass card border
    setGlow(`rgba(${t.primaryRgb}, 0.15)`, 6);
    ctx.strokeStyle = `rgba(${t.primaryRgb}, 0.20)`;
    ctx.lineWidth = 1.5;
    roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
    ctx.stroke();
    clearShadow();

    // Left accent bar
    setGlow(`rgba(${t.primaryRgb}, 0.4)`, 6);
    ctx.fillStyle = `rgba(${t.primaryRgb}, 0.7)`;
    roundRect(ctx, PAD + 3, cursorY + 10, 4, cardH - 20, 2);
    ctx.fill();
    clearShadow();

    // Summary text — sentence-by-sentence reveal
    const sentences = summaryText.split('. ');
    ctx.font = `400 34px ${FONT_BODY}`;

    // For sentence-by-sentence: draw all text but vary alpha per sentence
    // Simplified: draw full text with uniform alpha since per-sentence on canvas is complex
    const textAlpha = interpolate(frame - T.summaryText, [0, 25], [0, 1], CLAMP);
    setShadow(6, 0.4);
    ctx.fillStyle = `rgba(230, 235, 245, ${0.95 * textAlpha})`;
    wrapText(ctx, summaryText, PAD + 22, cursorY + cardPadV, CONTENT_W - 60, 48);
    clearShadow();

    const cardBottomY = cursorY + cardH;
    cursorY = cardBottomY + 12;

    // Source attribution
    const srcAlpha = interpolate(frame - T.source, [0, 10], [0, 1], CLAMP);
    const srcSlide = interpolate(frame - T.source, [0, 10], [20, 0], CLAMP);
    if (srcAlpha > 0) {
      ctx.globalAlpha = cardAlpha * srcAlpha;
      ctx.translate(0, srcSlide);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = `italic 400 20px ${FONT_BODY}`;
      ctx.fillText('Source: AI-curated news feed', PAD + 22, cursorY);
    }
    cursorY += 35;

    ctx.restore();
    // Advance cursorY outside the transform
    cursorY += cardSlide; // adjust for slide
  }

  // ═══════════════════════════════════════
  //  12. DECORATIVE DOT GRID — fade in
  // ═══════════════════════════════════════

  const dotGridAlpha = interpolate(frame - T.dotGrid, [0, 20], [0, 0.5], CLAMP);
  if (dotGridAlpha > 0) {
    const dotGridStartY = cursorY + 20;
    const dotGridEndY = POLL_ZONE_TOP - 180;
    if (dotGridEndY > dotGridStartY + 40) {
      ctx.save();
      ctx.globalAlpha = dotGridAlpha;
      clearShadow();
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
          ctx.fillStyle = `rgba(${t.primaryRgb}, ${alpha * dotScale})`;
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ═══════════════════════════════════════
  //  13. POLL SECTION
  // ═══════════════════════════════════════

  const pollQ = storyData['Poll Question'] || '';
  if (pollQ) {
    // Dark band
    const pollBandAlpha = interpolate(frame - (T.pollBadge - 5), [0, 10], [0, 1], CLAMP);
    if (pollBandAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = pollBandAlpha;

      ctx.font = `600 36px ${FONT_BODY}`;
      const pollQHeight = measureWrappedHeight(ctx, pollQ, CONTENT_W, 46);
      const pollBadgeH = 32;
      const gapAfterBadge = 12;
      const totalPollBlock = pollBadgeH + gapAfterBadge + pollQHeight;
      const pollBlockStartY = POLL_ZONE_TOP - totalPollBlock - 20;

      clearShadow();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, pollBlockStartY - 15, W, totalPollBlock + 35);

      ctx.restore();

      // Poll badge — spring
      const pollBadgeS = spring({ frame: frame - T.pollBadge, fps, config: { damping: 12 } });
      if (pollBadgeS > 0) {
        ctx.save();
        ctx.globalAlpha = pollBadgeS;
        setGlow(`rgba(${t.accentRgb}, 0.3)`, 10);
        ctx.fillStyle = `rgba(${t.accentRgb}, 0.85)`;
        roundRect(ctx, PAD, pollBlockStartY, 100, pollBadgeH, 6);
        ctx.fill();
        clearShadow();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 18px ${FONT_BODY}`;
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
        setShadow(8, 0.5);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 36px ${FONT_BODY}`;
        wrapText(ctx, pollQ, PAD, pollBlockStartY + pollBadgeH + gapAfterBadge, CONTENT_W, 46);
        clearShadow();
        ctx.restore();
      }
    }
  }

  // ═══════════════════════════════════════
  //  14. POLL ZONE — dashed outline + pulse
  // ═══════════════════════════════════════

  const pzAlpha = interpolate(frame - T.pollZone, [0, 20], [0, 1], CLAMP);
  if (pzAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = pzAlpha;
    clearShadow();

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = `rgba(${t.primaryRgb}, 0.10)`;
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
    ctx.font = `700 28px ${FONT_BODY}`;
    ctx.textAlign = 'center';

    const tapY = (POLL_ZONE_TOP + POLL_ZONE_BOTTOM) / 2;
    ctx.save();
    ctx.translate(W / 2, tapY - 20);
    ctx.scale(pulse, pulse);
    ctx.fillText('👆 Tap to Vote', 0, 0);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.font = `400 22px ${FONT_BODY}`;
    ctx.fillText('Add Instagram Poll Sticker Here', W / 2, tapY + 18);
    ctx.textAlign = 'left';

    ctx.restore();
  }

  // ═══════════════════════════════════════
  //  15. BOTTOM BRANDING — fade in
  // ═══════════════════════════════════════

  const brandAlpha = interpolate(frame - T.branding, [0, 15], [0, 1], CLAMP);
  const brandSlide = interpolate(frame - T.branding, [0, 15], [30, 0], CLAMP);
  if (brandAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = brandAlpha;
    ctx.translate(0, brandSlide);
    clearShadow();

    const brandLineGrad = ctx.createLinearGradient(W / 2 - 80, 0, W / 2 + 80, 0);
    brandLineGrad.addColorStop(0, 'rgba(255,255,255,0)');
    brandLineGrad.addColorStop(0.5, `rgba(${t.primaryRgb}, 0.20)`);
    brandLineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = brandLineGrad;
    ctx.fillRect(W / 2 - 80, POLL_ZONE_BOTTOM + 15, 160, 1);

    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.font = `500 18px ${FONT_BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('HITAM AI  •  Powered by AI', W / 2, POLL_ZONE_BOTTOM + 28);
    ctx.textAlign = 'left';

    ctx.restore();
  }
}
