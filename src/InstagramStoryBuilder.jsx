import React, { useEffect, useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import ColorThief from 'colorthief';
import smartcrop from 'smartcrop';
import { Player } from '@remotion/player';
import { AnimatedStory } from './components/AnimatedStory';
import { renderAnimatedFrame } from './utils/renderAnimatedFrame';
import { sendPhoto, sendVideo, sendPoll } from './utils/telegram';
import { GOOGLE_SHEETS_CSV_URL } from './utils/constants';

// ═══════════════════════════════════════════════════════
//  GOOGLE FONTS — loaded via FontFace API (zero CSS needed)
// ═══════════════════════════════════════════════════════
const loadGoogleFonts = async () => {
  const specs = [
    {
      family: 'Bebas Neue',
      url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2',
      descriptors: { weight: '400' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2',
      descriptors: { weight: '400' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLGT9Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '500' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '600' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '700' },
    },
  ];

  const promises = specs.map(({ family, url, descriptors }) => {
    const face = new FontFace(family, `url(${url})`, descriptors);
    return face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
  });

  await Promise.all(promises);
  console.log('✅ Google Fonts loaded: Bebas Neue, Poppins (400–700)');
};

// ═══════════════════════════════════════════════════════
//  DYNAMIC COLOR THEME — derived from image palette
// ═══════════════════════════════════════════════════════
const rgb = (c) => `${c[0]}, ${c[1]}, ${c[2]}`;

const createTheme = (dominant, palette) => {
  const vibrancy = (c) =>
    Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
  const sorted = [...palette].sort((a, b) => vibrancy(b) - vibrancy(a));

  const primary = sorted[0] || dominant;
  const accent = sorted[1] || [140, 80, 255];
  const warm =
    sorted.find((c) => c[0] > 130 && c[0] > c[2]) || [255, 80, 60];
  const cool =
    sorted.find((c) => c[2] > 130 && c[2] > c[0]) || primary;

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
};

const DEFAULT_THEME = createTheme(
  [0, 180, 255],
  [
    [0, 180, 255],
    [140, 80, 255],
    [255, 60, 120],
    [255, 200, 50],
    [50, 200, 150],
    [255, 120, 50],
  ]
);

// ═══════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════
export default function InstagramStoryBuilder() {
  const canvasRef = useRef(null);
  const [storyData, setStoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [mode, setMode] = useState('static'); // 'static' | 'animated'
  const [colorTheme, setColorTheme] = useState(DEFAULT_THEME);
  const [loadedImage, setLoadedImage] = useState(null);
  const [smartcropRect, setSmartcropRect] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);

  // ── Auto-mode state ──
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [lastSentHeadline, setLastSentHeadline] = useState(
    () => localStorage.getItem('hitam-ai-last-headline') || ''
  );
  const [lastSentAt, setLastSentAt] = useState(
    () => localStorage.getItem('hitam-ai-last-sent-at') || ''
  );
  const [sending, setSending] = useState(false);
  const [sendStep, setSendStep] = useState(''); // 'png' | 'mp4' | 'poll' | 'done' | 'error'
  const [activityLog, setActivityLog] = useState([]);
  const [nextCheckIn, setNextCheckIn] = useState(0);

  // ── 1. Load Google Fonts on mount ──
  useEffect(() => {
    loadGoogleFonts()
      .then(() => setFontsReady(true))
      .catch((err) => {
        console.warn('Font loading failed, falling back to system fonts:', err);
        setFontsReady(true); // proceed with fallbacks
      });
  }, []);

  // ── Activity log helper ──
  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setActivityLog((prev) => [{ time, msg }, ...prev].slice(0, 20));
    console.log(`[${time}] ${msg}`);
  }, []);

  // ── 2. Fetch Data from Google Sheets ──
  const fetchLatestStory = useCallback(async () => {
    try {
      const response = await fetch(GOOGLE_SHEETS_CSV_URL);
      const csvText = await response.text();
      return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data;
            if (data.length > 0) {
              resolve(data[data.length - 1]);
            } else {
              reject(new Error('No data found'));
            }
          },
          error: () => reject(new Error('Failed to parse CSV')),
        });
      });
    } catch {
      throw new Error('Failed to fetch from Google Sheets');
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchLatestStory()
      .then((data) => {
        setStoryData(data);
        setLoading(false);
        addLog(`Loaded story: "${data['Headline']}"`);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [fetchLatestStory, addLog]);

  // ── 3. Utility: Word Wrap (returns final Y position) ──
  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, currentY);
    return currentY;
  };

  // ── 4. Measure wrapped text height without drawing ──
  const measureWrappedHeight = (ctx, text, maxWidth, lineHeight) => {
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
  };

  // ── 5. Rounded rectangle path ──
  const roundRect = (ctx, x, y, w, h, r) => {
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
  };

  // ══════════════════════════════════════════
  //  6. DRAW THE CANVAS
  // ══════════════════════════════════════════
  useEffect(() => {
    if (!storyData || !canvasRef.current || !fontsReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width; // 1080
    const H = canvas.height; // 1920

    // ═══════════════════════════════════════════
    //  INSTAGRAM STORY SAFE ZONES
    //  Top    0–250px    → IG header
    //  Content 250–1300px → Our design area
    //  Poll   1300–1600px → IG native poll sticker
    //  Bottom 1600–1920px → IG footer
    // ═══════════════════════════════════════════

    const SAFE_TOP = 250;
    const CONTENT_BOTTOM = 1300;
    const POLL_ZONE_TOP = 1310;
    const POLL_ZONE_BOTTOM = 1600;
    const PAD = 70;
    const CONTENT_W = W - PAD * 2; // 940

    // ── Font families (with fallbacks) ──
    const FONT_DISPLAY = '"Bebas Neue", "Impact", sans-serif';
    const FONT_BODY = '"Poppins", "Segoe UI", sans-serif';

    ctx.clearRect(0, 0, W, H);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = storyData['Image URL'];

    img.onload = async () => {
      // ══════════════════════════════════════
      //  SMARTCROP — content-aware cropping
      // ══════════════════════════════════════
      let cropRect = null;
      try {
        const result = await smartcrop.crop(img, {
          width: W,
          height: H,
          minScale: 1.0,
        });
        cropRect = result.topCrop;
        setSmartcropRect(cropRect);
        console.log('✅ smartcrop:', cropRect);
      } catch (e) {
        console.warn('smartcrop failed, using center-crop fallback:', e);
      }

      // Store loaded image for video export
      setLoadedImage(img);

      // ── 1. BACKGROUND IMAGE ──
      if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
        // Content-aware crop
        ctx.drawImage(
          img,
          cropRect.x,
          cropRect.y,
          cropRect.width,
          cropRect.height,
          0,
          0,
          W,
          H
        );
      } else {
        // Fallback: geometric center cover-fit
        const imgRatio = img.width / img.height;
        const canvasRatio = W / H;
        let sx = 0,
          sy = 0,
          sw = img.width,
          sh = img.height;
        if (imgRatio > canvasRatio) {
          sw = img.height * canvasRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / canvasRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      }

      // ══════════════════════════════════════
      //  COLOR THIEF — extract palette from image
      // ══════════════════════════════════════
      let theme = DEFAULT_THEME;
      try {
        const colorThief = new ColorThief();
        const dominant = colorThief.getColor(img);
        const palette = colorThief.getPalette(img, 6);
        theme = createTheme(dominant, palette);
        setColorTheme(theme); // share palette with Remotion player
        console.log('✅ Color palette extracted:', {
          dominant: rgb(dominant),
          primary: rgb(theme.primary),
          accent: rgb(theme.accent),
        });
      } catch (e) {
        console.warn('Color Thief failed, using default theme:', e);
      }

      // ── 2. FULL-SCREEN DARK OVERLAY ──
      const fullOverlay = ctx.createLinearGradient(0, 0, 0, H);
      fullOverlay.addColorStop(0, 'rgba(5, 5, 20, 0.78)');
      fullOverlay.addColorStop(0.22, 'rgba(5, 5, 20, 0.50)');
      fullOverlay.addColorStop(0.45, 'rgba(5, 5, 20, 0.12)');
      fullOverlay.addColorStop(0.62, 'rgba(5, 5, 20, 0.08)');
      fullOverlay.addColorStop(0.78, 'rgba(5, 5, 20, 0.40)');
      fullOverlay.addColorStop(1, 'rgba(5, 5, 20, 0.88)');
      ctx.fillStyle = fullOverlay;
      ctx.fillRect(0, 0, W, H);

      // ── 3. FILM GRAIN — fast noise overlay (no pixel loop) ──
      {
        const noiseCanvas = document.createElement('canvas');
        noiseCanvas.width = 270;  // small tile, tiled across
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

      // ── HELPERS ──
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

      // ── CRITICAL: textBaseline = 'top' → Y = top of text ──
      ctx.textBaseline = 'top';

      // ═══════════════════════════════
      //  CORNER FRAME ACCENTS
      // ═══════════════════════════════

      clearShadow();
      ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.20)`;
      ctx.lineWidth = 2;
      const cornerLen = 60;
      const cm = 45;

      ctx.beginPath();
      ctx.moveTo(cm, cm + cornerLen);
      ctx.lineTo(cm, cm);
      ctx.lineTo(cm + cornerLen, cm);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(W - cm - cornerLen, cm);
      ctx.lineTo(W - cm, cm);
      ctx.lineTo(W - cm, cm + cornerLen);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cm, H - cm - cornerLen);
      ctx.lineTo(cm, H - cm);
      ctx.lineTo(cm + cornerLen, H - cm);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(W - cm - cornerLen, H - cm);
      ctx.lineTo(W - cm, H - cm);
      ctx.lineTo(W - cm, H - cm - cornerLen);
      ctx.stroke();

      // ═══════════════════════════════
      //  STORY SLIDE INDICATOR (dots)
      // ═══════════════════════════════

      clearShadow();
      const dotY = SAFE_TOP - 30;
      const dotSpacing = 18;
      const totalDots = 4;
      const activeDot = 0;
      const dotsStartX = W / 2 - ((totalDots - 1) * dotSpacing) / 2;
      for (let i = 0; i < totalDots; i++) {
        ctx.beginPath();
        ctx.arc(
          dotsStartX + i * dotSpacing,
          dotY,
          i === activeDot ? 5 : 3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle =
          i === activeDot
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.3)';
        ctx.fill();
      }

      // ═══════════════════════════════
      //  TOP SECTION: Branding Bar
      // ═══════════════════════════════

      let cursorY = SAFE_TOP; // 250

      // Neon accent bar — uses extracted palette!
      setGlow(`rgba(${theme.primaryRgb}, 0.5)`, 12);
      const accentGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
      accentGrad.addColorStop(0, `rgba(${theme.primaryRgb}, 0.9)`);
      accentGrad.addColorStop(0.5, `rgba(${theme.accentRgb}, 0.9)`);
      accentGrad.addColorStop(1, `rgba(${theme.warmRgb}, 0.9)`);
      ctx.fillStyle = accentGrad;
      ctx.fillRect(PAD, cursorY, CONTENT_W, 4);
      clearShadow();
      cursorY += 18;

      // "TRENDING NEWS" badge + date
      const badgeText = '⚡ TRENDING NEWS';
      ctx.font = `600 22px ${FONT_BODY}`;
      const badgeW = ctx.measureText(badgeText).width + 28;
      const badgeH = 36;
      const badgeGrad = ctx.createLinearGradient(
        PAD,
        cursorY,
        PAD + badgeW,
        cursorY
      );
      badgeGrad.addColorStop(0, `rgba(${theme.warmRgb}, 0.9)`);
      badgeGrad.addColorStop(1, `rgba(${theme.accentRgb}, 0.9)`);
      ctx.fillStyle = badgeGrad;
      roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
      ctx.fill();

      // Badge glow
      setGlow(`rgba(${theme.warmRgb}, 0.3)`, 15);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      roundRect(ctx, PAD, cursorY, badgeW, badgeH, 8);
      ctx.fill();
      clearShadow();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `600 20px ${FONT_BODY}`;
      ctx.fillText(badgeText, PAD + 14, cursorY + 8);

      // Date on the right
      const today = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `400 20px ${FONT_BODY}`;
      ctx.textAlign = 'right';
      ctx.fillText(today, W - PAD, cursorY + 8);
      ctx.textAlign = 'left';

      cursorY += badgeH + 20;

      // ═══════════════════════════════
      //  HEADLINE — Bebas Neue (display font)
      // ═══════════════════════════════

      const headlineSize = 80; // Bebas Neue is condensed → go bigger
      const headlineLeading = 88;
      ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
      const headlineText = (storyData['Headline'] || '').toUpperCase();
      const headlineWords = headlineText.split(' ');

      // Add letter spacing for Bebas Neue
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
      }

      if (headlineWords.length > 0) {
        // First word with themed glow
        const firstWord = headlineWords[0];
        setGlow(`rgba(${theme.primaryRgb}, 0.6)`, 25);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
        ctx.fillText(firstWord, PAD, cursorY);

        const firstWordW = ctx.measureText(firstWord + ' ').width;
        clearShadow();

        setShadow(12, 0.7);
        ctx.fillStyle = '#FFFFFF';
        const restText = headlineWords.slice(1).join(' ');

        const restW = ctx.measureText(restText).width;
        if (firstWordW + restW <= CONTENT_W && !restText.includes('\n')) {
          ctx.fillText(restText, PAD + firstWordW, cursorY);
          cursorY += headlineLeading + 15;
        } else {
          clearShadow();
          ctx.clearRect(PAD - 5, cursorY - 2, CONTENT_W + 10, 260);
          // Repaint overlay for cleared area
          const patchOverlay = ctx.createLinearGradient(
            0,
            cursorY,
            0,
            cursorY + 260
          );
          patchOverlay.addColorStop(0, 'rgba(5, 5, 20, 0.55)');
          patchOverlay.addColorStop(1, 'rgba(5, 5, 20, 0.30)');
          ctx.fillStyle = patchOverlay;
          ctx.fillRect(PAD - 5, cursorY - 2, CONTENT_W + 10, 260);

          setGlow(`rgba(${theme.primaryRgb}, 0.35)`, 20);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `400 ${headlineSize}px ${FONT_DISPLAY}`;
          const headlineEndY = wrapText(
            ctx,
            headlineText,
            PAD,
            cursorY,
            CONTENT_W,
            headlineLeading
          );
          cursorY = headlineEndY + headlineLeading + 15;
        }
      } else {
        cursorY += headlineLeading + 15;
      }
      clearShadow();

      // Reset letter spacing
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '0px';
      }

      // Short gradient divider with themed glow
      setGlow(`rgba(${theme.primaryRgb}, 0.4)`, 8);
      const divGrad = ctx.createLinearGradient(PAD, 0, PAD + 250, 0);
      divGrad.addColorStop(0, `rgba(${theme.primaryRgb}, 0.8)`);
      divGrad.addColorStop(1, `rgba(${theme.primaryRgb}, 0)`);
      ctx.fillStyle = divGrad;
      ctx.fillRect(PAD, cursorY, 250, 3);
      clearShadow();
      cursorY += 20;

      // ═══════════════════════════════
      //  NEWS SUMMARY — Glassmorphism Card (Poppins)
      // ═══════════════════════════════

      const summaryText = storyData['News Summary'] || '';
      ctx.font = `400 34px ${FONT_BODY}`;
      const summaryH = measureWrappedHeight(
        ctx,
        summaryText,
        CONTENT_W - 60,
        48
      );
      const cardPadV = 20;
      const cardH = cardPadV + summaryH + cardPadV;

      // Glass card background — tinted by palette
      clearShadow();
      ctx.fillStyle = `rgba(${theme.dominantRgb}, 0.10)`;
      roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
      ctx.fill();

      // Glass card border
      setGlow(`rgba(${theme.primaryRgb}, 0.15)`, 6);
      ctx.strokeStyle = `rgba(${theme.primaryRgb}, 0.20)`;
      ctx.lineWidth = 1.5;
      roundRect(ctx, PAD - 5, cursorY, CONTENT_W + 10, cardH, 16);
      ctx.stroke();
      clearShadow();

      // Left accent bar — themed
      setGlow(`rgba(${theme.primaryRgb}, 0.4)`, 6);
      ctx.fillStyle = `rgba(${theme.primaryRgb}, 0.7)`;
      roundRect(ctx, PAD + 3, cursorY + 10, 4, cardH - 20, 2);
      ctx.fill();
      clearShadow();

      // Summary text — Poppins
      setShadow(6, 0.4);
      ctx.fillStyle = 'rgba(230, 235, 245, 0.95)';
      ctx.font = `400 34px ${FONT_BODY}`;
      wrapText(
        ctx,
        summaryText,
        PAD + 22,
        cursorY + cardPadV,
        CONTENT_W - 60,
        48
      );
      clearShadow();
      const cardBottomY = cursorY + cardH;
      cursorY = cardBottomY + 12;

      // Source attribution — Poppins italic
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = `italic 400 20px ${FONT_BODY}`;
      ctx.fillText('Source: AI-curated news feed', PAD + 22, cursorY);
      cursorY += 35;

      // ═══════════════════════════════
      //  MIDDLE ZONE — Decorative dot grid (themed)
      // ═══════════════════════════════

      clearShadow();
      const dotGridStartY = cursorY + 20;
      const dotGridEndY = POLL_ZONE_TOP - 180;
      if (dotGridEndY > dotGridStartY + 40) {
        const gridCenterX = W / 2;
        const gridCenterY = (dotGridStartY + dotGridEndY) / 2;
        const gridSize = Math.min(dotGridEndY - dotGridStartY, 200);
        const gridCols = 6;
        const gridRows = Math.floor(gridSize / 35);
        const gridSpacing = 35;

        for (let row = 0; row < gridRows; row++) {
          for (let col = 0; col < gridCols; col++) {
            const dx =
              gridCenterX -
              ((gridCols - 1) * gridSpacing) / 2 +
              col * gridSpacing;
            const dy =
              gridCenterY -
              ((gridRows - 1) * gridSpacing) / 2 +
              row * gridSpacing;
            const dist = Math.sqrt(
              Math.pow((col - (gridCols - 1) / 2) / gridCols, 2) +
                Math.pow((row - (gridRows - 1) / 2) / gridRows, 2)
            );
            const alpha = Math.max(0.03, 0.12 - dist * 0.15);
            ctx.beginPath();
            ctx.arc(dx, dy, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${theme.primaryRgb}, ${alpha})`;
            ctx.fill();
          }
        }
      }

      // ═══════════════════════════════
      //  POLL PROMPT — Poppins
      // ═══════════════════════════════

      const pollQ = storyData['Poll Question'] || '';
      let pollBlockStartY = 0;
      if (pollQ) {
        ctx.font = `600 36px ${FONT_BODY}`;
        const pollQHeight = measureWrappedHeight(ctx, pollQ, CONTENT_W, 46);

        const pollBadgeH = 32;
        const gapAfterBadge = 12;
        const totalPollBlock = pollBadgeH + gapAfterBadge + pollQHeight;
        pollBlockStartY = POLL_ZONE_TOP - totalPollBlock - 20;

        // Dark band behind poll question
        clearShadow();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        roundRect(ctx, 0, pollBlockStartY - 15, W, totalPollBlock + 35, 0);
        ctx.fill();

        // "POLL" label badge — themed
        setGlow(`rgba(${theme.accentRgb}, 0.3)`, 10);
        ctx.fillStyle = `rgba(${theme.accentRgb}, 0.85)`;
        roundRect(ctx, PAD, pollBlockStartY, 100, pollBadgeH, 6);
        ctx.fill();
        clearShadow();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 18px ${FONT_BODY}`;
        ctx.fillText('📊 POLL', PAD + 12, pollBlockStartY + 7);

        // Poll question text — Poppins semibold
        setShadow(8, 0.5);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 36px ${FONT_BODY}`;
        wrapText(
          ctx,
          pollQ,
          PAD,
          pollBlockStartY + pollBadgeH + gapAfterBadge,
          CONTENT_W,
          46
        );
        clearShadow();
      }

      // ── Layout Validation ──
      console.log('──── Story Layout Audit ────');
      console.log(`Canvas: ${W}x${H}`);
      console.log(`IG Header zone: 0–${SAFE_TOP} (nothing drawn here ✓)`);
      console.log(`Content ends at cursorY: ${cursorY}`);
      console.log(`Poll block starts at: ${pollBlockStartY}`);
      console.log(
        `Gap between content & poll: ${pollBlockStartY - cursorY}px ${
          pollBlockStartY - cursorY > 50 ? '✓' : '⚠ TOO TIGHT'
        }`
      );
      console.log(
        `Poll zone (blank for sticker): ${POLL_ZONE_TOP}–${POLL_ZONE_BOTTOM}`
      );
      console.log(
        `IG Footer zone: ${POLL_ZONE_BOTTOM}–${H} (nothing drawn here ✓)`
      );
      console.log(`🎨 Theme: primary=${theme.primaryRgb} accent=${theme.accentRgb} warm=${theme.warmRgb}`);
      console.log('────────────────────────────');

      // ═══════════════════════════════
      //  POLL ZONE (1310–1600) — "Tap to Vote"
      // ═══════════════════════════════

      clearShadow();
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

      // "Tap to Vote" — Poppins
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = `700 28px ${FONT_BODY}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        '👆 Tap to Vote',
        W / 2,
        (POLL_ZONE_TOP + POLL_ZONE_BOTTOM) / 2 - 20
      );
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.font = `400 22px ${FONT_BODY}`;
      ctx.fillText(
        'Add Instagram Poll Sticker Here',
        W / 2,
        (POLL_ZONE_TOP + POLL_ZONE_BOTTOM) / 2 + 18
      );
      ctx.textAlign = 'left';

      // ═══════════════════════════════
      //  BOTTOM BRANDING — Poppins
      // ═══════════════════════════════

      clearShadow();
      const brandLineGrad = ctx.createLinearGradient(
        W / 2 - 80,
        0,
        W / 2 + 80,
        0
      );
      brandLineGrad.addColorStop(0, 'rgba(255,255,255,0)');
      brandLineGrad.addColorStop(0.5, `rgba(${theme.primaryRgb}, 0.20)`);
      brandLineGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = brandLineGrad;
      ctx.fillRect(W / 2 - 80, POLL_ZONE_BOTTOM + 15, 160, 1);

      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.font = `500 18px ${FONT_BODY}`;
      ctx.textAlign = 'center';
      ctx.fillText('HITAM AI  •  Powered by AI', W / 2, POLL_ZONE_BOTTOM + 28);
      ctx.textAlign = 'left';
    };

    img.onerror = () => {
      console.error(
        'Failed to load the background image. Check CORS policy.'
      );
    };
  }, [storyData, fontsReady]);

  // ── 7. Download Handler (PNG) ──
  const handleDownload = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const dataURL = canvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'hitam-ai-story.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Generate PNG Blob from canvas ──
  const generatePngBlob = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!canvasRef.current) return reject(new Error('Canvas not ready'));
      canvasRef.current.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/png'
      );
    });
  }, []);

  // ── Generate MP4 Blob (reusable — used by both download and auto-send) ──
  const generateMp4Blob = useCallback(
    async (data, img, crop, theme, onProgress) => {
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('WebCodecs not supported');
      }

      const totalFrames = 240;
      const fps = 30;
      const W = 1080;
      const H = 1920;

      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d');

      // Find working codec
      const codecs = [
        { codec: 'avc1.4d0032', label: 'AVC Main L5.0' },
        { codec: 'avc1.42003e', label: 'AVC Baseline L6.2' },
        { codec: 'avc1.42001f', label: 'AVC Baseline L3.1' },
        { codec: 'avc1.640032', label: 'AVC High L5.0' },
      ];

      let selectedCodec = null;
      for (const c of codecs) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec: c.codec,
            width: W,
            height: H,
            bitrate: 6_000_000,
            framerate: fps,
            hardwareAcceleration: 'prefer-software',
          });
          if (support.supported) {
            selectedCodec = c;
            break;
          }
        } catch (e) {
          // try next
        }
      }

      if (!selectedCodec) {
        throw new Error('No supported H.264 codec');
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory',
      });

      let encoderError = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encoderError = e; },
      });

      encoder.configure({
        codec: selectedCodec.codec,
        width: W,
        height: H,
        bitrate: 6_000_000,
        framerate: fps,
        hardwareAcceleration: 'prefer-software',
      });

      await new Promise((r) => setTimeout(r, 50));
      if (encoder.state === 'closed' || encoderError) {
        throw new Error(encoderError?.message || 'Encoder closed after configure');
      }

      for (let i = 0; i < totalFrames; i++) {
        if (encoder.state === 'closed') {
          throw new Error('Encoder closed at frame ' + i);
        }

        renderAnimatedFrame({
          ctx: offCtx,
          img,
          cropRect: crop,
          storyData: data,
          theme,
          frame: i,
          fps,
        });

        const videoFrame = new VideoFrame(offscreen, {
          timestamp: i * (1_000_000 / fps),
          duration: 1_000_000 / fps,
        });

        encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
        videoFrame.close();

        if (onProgress) onProgress(Math.round(((i + 1) / totalFrames) * 100));

        if (i % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();

      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    []
  );

  // ── 8. Download Video (MP4) — uses generateMp4Blob ──
  const handleDownloadVideo = async () => {
    if (!storyData || !loadedImage || recording) return;

    if (typeof VideoEncoder === 'undefined') {
      alert('Your browser does not support WebCodecs (VideoEncoder).\nPlease use Chrome 94+ or Edge 94+.');
      return;
    }

    setRecording(true);
    setRecordProgress(0);

    try {
      const blob = await generateMp4Blob(
        storyData,
        loadedImage,
        smartcropRect,
        colorTheme,
        (p) => setRecordProgress(p)
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hitam-ai-story.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('✅ MP4 exported successfully');
    } catch (err) {
      console.error('Video export failed:', err);
      alert('Video export failed: ' + err.message);
    } finally {
      setRecording(false);
      setRecordProgress(0);
    }
  };

  // ═════════════════════════════════════════════════════════
  //  9. AUTO-SEND TO TELEGRAM PIPELINE
  // ═════════════════════════════════════════════════════════
  const sendToTelegram = useCallback(
    async (data, img, crop, theme) => {
      if (sending) return;
      setSending(true);

      const headline = data['Headline'] || 'AI News';
      const summary = data['News Summary'] || '';
      const pollQ = data['Poll Question'] || '';
      const pollOpts = data['Poll Options'] || '';

      const caption = `🚀 *${headline}*\n\n📰 ${summary}`;

      try {
        // Step 1: Send PNG
        setSendStep('png');
        addLog('Sending static image to Telegram…');

        // Wait for canvas to be ready
        await new Promise((r) => setTimeout(r, 500));
        const pngBlob = await generatePngBlob();
        await sendPhoto(pngBlob, caption);
        addLog('✅ Static image sent');

        // Step 2: Send MP4
        setSendStep('mp4');
        addLog('Rendering & sending animated video…');
        setRecording(true);
        setRecordProgress(0);

        const mp4Blob = await generateMp4Blob(
          data,
          img,
          crop,
          theme,
          (p) => setRecordProgress(p)
        );

        setRecording(false);
        setRecordProgress(0);

        await sendVideo(mp4Blob, `🎬 *${headline}* — Animated Story`);
        addLog('✅ Animated video sent');

        // Step 3: Send Poll
        if (pollQ && pollOpts) {
          setSendStep('poll');
          addLog(`Sending poll: "${pollQ}"`);
          await sendPoll(pollQ, pollOpts);
          addLog('✅ Poll sent');
        }

        // Mark as sent
        setSendStep('done');
        setLastSentHeadline(headline);
        setLastSentAt(new Date().toLocaleString());
        localStorage.setItem('hitam-ai-last-headline', headline);
        localStorage.setItem('hitam-ai-last-sent-at', new Date().toLocaleString());
        addLog(`✅ All sent! Headline: "${headline}"`);
      } catch (err) {
        setSendStep('error');
        addLog(`❌ Error: ${err.message}`);
        console.error('Telegram send error:', err);
      } finally {
        setSending(false);
        setRecording(false);
        setRecordProgress(0);
      }
    },
    [sending, generatePngBlob, generateMp4Blob, addLog]
  );

  // ── Manual send button handler (with dedup check) ──
  const handleManualSend = () => {
    if (!storyData || !loadedImage || sending) return;

    const currentHeadline = storyData['Headline'] || '';
    const alreadySent = localStorage.getItem('hitam-ai-last-headline');

    if (currentHeadline && currentHeadline === alreadySent) {
      addLog('⚠️ Already sent — check Telegram!');
      alert(`This story was already sent to Telegram!\n\n"${currentHeadline}"\n\nCheck your Telegram group — no need to send again.`);
      return;
    }

    sendToTelegram(storyData, loadedImage, smartcropRect, colorTheme);
  };

  // ═════════════════════════════════════════════════════════
  //  10. AUTO-POLLING — Check Google Sheets for new data
  // ═════════════════════════════════════════════════════════
  useEffect(() => {
    if (!autoEnabled || !fontsReady) return;

    const getInterval = () => {
      const now = new Date();
      const hour = now.getHours();
      const min = now.getMinutes();
      // During 7:50–8:20 window: check every 2 minutes
      if (hour === 7 && min >= 50) return 2 * 60 * 1000;
      if (hour === 8 && min <= 20) return 2 * 60 * 1000;
      // Otherwise: every 10 minutes
      return 10 * 60 * 1000;
    };

    let timerId;

    const poll = async () => {
      try {
        const latest = await fetchLatestStory();
        const headline = latest['Headline'] || '';
        const savedHeadline = localStorage.getItem('hitam-ai-last-headline') || '';

        if (headline && headline !== savedHeadline) {
          addLog(`🆕 New story detected: "${headline}"`);
          setStoryData(latest);

          // Wait for image + canvas to re-render
          addLog('Waiting for image to load & render…');

          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = latest['Image URL'];

          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Image failed to load'));
          });

          let crop = null;
          try {
            const result = await smartcrop.crop(img, {
              width: 1080,
              height: 1920,
              minScale: 1.0,
            });
            crop = result.topCrop;
          } catch (e) {
            // fallback to center crop
          }

          let theme = DEFAULT_THEME;
          try {
            const ct = new ColorThief();
            const dominant = ct.getColor(img);
            const palette = ct.getPalette(img, 6);
            theme = createTheme(dominant, palette);
          } catch (e) {
            // fallback
          }

          // Wait for canvas to finish rendering
          await new Promise((r) => setTimeout(r, 3000));

          addLog('Auto-sending to Telegram…');
          await sendToTelegram(latest, img, crop, theme);
        } else {
          addLog('Checked sheet — no new story');
        }
      } catch (err) {
        addLog(`⚠ Poll failed: ${err.message}`);
      }

      // Schedule next check
      const interval = getInterval();
      setNextCheckIn(Math.round(interval / 60000));
      timerId = setTimeout(poll, interval);
    };

    // Start first poll after 30 seconds (let the page settle)
    const startDelay = setTimeout(() => {
      const interval = getInterval();
      setNextCheckIn(Math.round(interval / 60000));
      poll();
    }, 30000);

    return () => {
      clearTimeout(startDelay);
      clearTimeout(timerId);
    };
  }, [autoEnabled, fontsReady, fetchLatestStory, sendToTelegram, addLog]);

  if (loading || !fontsReady)
    return <div style={styles.centerBox}>Loading Fonts & Data…</div>;
  if (error)
    return (
      <div style={styles.centerBox}>
        <p style={{ color: 'red' }}>{error}</p>
      </div>
    );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', letterSpacing: '3px', fontSize: '28px' }}>
          AI Story Generator
        </h2>
        <p style={{ fontFamily: '"Poppins", sans-serif', fontSize: '13px', opacity: 0.5, marginTop: '4px' }}>
          Bebas Neue + Poppins • Color-themed • Smart-cropped • Animated
        </p>

        {/* ── Mode Toggle ── */}
        <div style={styles.toggleRow}>
          <button
            onClick={() => setMode('static')}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'static' ? styles.toggleActive : {}),
            }}
          >
            📸 Static
          </button>
          <button
            onClick={() => setMode('animated')}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'animated' ? styles.toggleActive : {}),
            }}
          >
            🎬 Animated
          </button>
        </div>

        {/* ── Download Buttons ── */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {mode === 'static' && (
            <button onClick={handleDownload} style={styles.button}>
              ⬇️ Download PNG
            </button>
          )}
          {mode === 'animated' && (
            <button
              onClick={handleDownloadVideo}
              disabled={recording || !loadedImage}
              style={{
                ...styles.button,
                backgroundColor: recording ? '#555' : '#28a745',
                cursor: recording ? 'not-allowed' : 'pointer',
              }}
            >
              {recording
                ? `🔴 Rendering MP4… ${recordProgress}%`
                : '⬇️ Download MP4'}
            </button>
          )}

          {/* ── Manual Send to Telegram ── */}
          <button
            onClick={handleManualSend}
            disabled={sending || !loadedImage || recording}
            style={{
              ...styles.button,
              backgroundColor: sending ? '#555' : '#0088cc',
              cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending
              ? `📤 Sending ${sendStep}…`
              : '📤 Send to Telegram'}
          </button>
        </div>
      </div>

      {/* ══════ STATUS PANEL ══════ */}
      <div style={styles.statusPanel}>
        {/* Auto-mode toggle */}
        <div style={styles.statusRow}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>
            🤖 Auto-mode
          </span>
          <button
            onClick={() => setAutoEnabled(!autoEnabled)}
            style={{
              ...styles.statusBadge,
              backgroundColor: autoEnabled ? '#28a74533' : '#dc354533',
              color: autoEnabled ? '#28a745' : '#dc3545',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {autoEnabled ? '● ACTIVE' : '○ OFF'}
          </button>
        </div>

        {/* Polling info */}
        {autoEnabled && (
          <div style={styles.statusRow}>
            <span style={{ fontSize: '12px', opacity: 0.6 }}>
              Next check in ~{nextCheckIn} min
            </span>
          </div>
        )}

        {/* Last sent info */}
        {lastSentHeadline && (
          <div style={{ ...styles.statusRow, flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              Last sent: {lastSentAt}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              "{lastSentHeadline}"
            </span>
          </div>
        )}

        {/* Activity Log */}
        {activityLog.length > 0 && (
          <div style={styles.logContainer}>
            <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.5, marginBottom: '4px' }}>
              Activity Log
            </span>
            {activityLog.map((entry, i) => (
              <div key={i} style={styles.logEntry}>
                <span style={{ opacity: 0.3, fontSize: '10px', fontFamily: 'monospace' }}>
                  {entry.time}
                </span>
                <span style={{ fontSize: '11px' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recording progress overlay */}
      {recording && (
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${recordProgress}%`,
            }}
          />
        </div>
      )}

      {/* ── Static Canvas Mode ── */}
      {mode === 'static' && (
        <div style={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            style={styles.canvas}
          />
        </div>
      )}

      {/* ── Animated Remotion Mode ── */}
      {mode === 'animated' && storyData && (
        <div style={styles.canvasWrapper}>
          <Player
            component={AnimatedStory}
            inputProps={{
              headline: storyData['Headline'] || '',
              summary: storyData['News Summary'] || '',
              pollQuestion: storyData['Poll Question'] || '',
              pollOptions: storyData['Poll Options'] || '',
              imageUrl: storyData['Image URL'] || '',
              theme: colorTheme,
            }}
            durationInFrames={240}
            compositionWidth={1080}
            compositionHeight={1920}
            fps={30}
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: 1080,
              height: 1920,
              borderRadius: '4px',
            }}
            controls
            loop
            autoPlay
          />
        </div>
      )}
    </div>
  );
}

// ── 8. Inline Styling ──
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'white',
    fontFamily: '"Poppins", sans-serif',
    padding: '20px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '20px',
  },
  button: {
    marginTop: '10px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: '"Poppins", sans-serif',
    color: '#fff',
    backgroundColor: '#007bff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    transition: 'background-color 0.2s',
  },
  canvasWrapper: {
    padding: '10px',
    backgroundColor: '#333',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  },
  canvas: {
    maxWidth: '90vw',
    maxHeight: '80vh',
    height: 'auto',
    display: 'block',
    borderRadius: '4px',
  },
  centerBox: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'white',
    fontFamily: '"Poppins", sans-serif',
    fontSize: '24px',
  },
  toggleRow: {
    display: 'flex',
    gap: '4px',
    marginTop: '12px',
    backgroundColor: '#2a2a2a',
    borderRadius: '10px',
    padding: '4px',
  },
  toggleBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '"Poppins", sans-serif',
    color: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleActive: {
    color: '#fff',
    backgroundColor: '#007bff',
    boxShadow: '0 2px 8px rgba(0,123,255,0.4)',
  },
  progressBar: {
    width: '300px',
    height: '6px',
    backgroundColor: '#333',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #28a745, #20c997)',
    borderRadius: '3px',
    transition: 'width 0.15s ease-out',
  },
  statusPanel: {
    width: '100%',
    maxWidth: '420px',
    marginTop: '16px',
    marginBottom: '12px',
    padding: '14px 16px',
    backgroundColor: '#222',
    borderRadius: '10px',
    border: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  logContainer: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '160px',
    overflowY: 'auto',
    borderTop: '1px solid #333',
    paddingTop: '8px',
    marginTop: '4px',
  },
  logEntry: {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
    padding: '2px 0',
  },
};
