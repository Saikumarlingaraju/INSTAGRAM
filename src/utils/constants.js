// ═══════════════════════════════════════════════════════════════
//  Shared constants used across all renderers
// ═══════════════════════════════════════════════════════════════

// ── Canvas dimensions ──
export const W = 1080;
export const H = 1920;

// ── Instagram Story Safe Zones ──
export const SAFE_TOP = 250;
export const CONTENT_BOTTOM = 1300;
export const POLL_ZONE_TOP = 1310;
export const POLL_ZONE_BOTTOM = 1600;
export const PAD = 70;
export const CONTENT_W = W - PAD * 2; // 940

// ── Fonts ──
export const FONT_DISPLAY = '"Bebas Neue", "Impact", sans-serif';
export const FONT_BODY = '"Poppins", "Segoe UI", sans-serif';

// ── Animation ──
export const TOTAL_FRAMES = 240;
export const FPS = 30;

// ── Google Sheets ──
export const GOOGLE_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtDSB1S74HHrypW_cogBnPX51sdHluVtF_eSOqPGslCVUEo-o9k5P2zvNeu4pKjImju_YwaMiCJp9t/pub?gid=0&single=true&output=csv';
