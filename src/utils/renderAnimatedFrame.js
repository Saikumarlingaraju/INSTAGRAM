// ═══════════════════════════════════════════════════════════════
//  renderAnimatedFrame.js
//
//  SINGLE SOURCE OF TRUTH for the Instagram story visual.
//
//  Renders ONE frame of the animated story onto a canvas context.
//  Static preview = render at frame (TOTAL_FRAMES - 1).
//  Video export  = render frames 0 → TOTAL_FRAMES - 1.
//  Remotion      = render via useCurrentFrame().
//
//  Dispatches to content-type-specific layouts (layouts.js).
//  Shared helpers live in renderHelpers.js.
//  Individual sections live in renderSections.js.
// ═══════════════════════════════════════════════════════════════

import { renderWithLayout } from './layouts.js';

// ═══════════════════════════════════════════════════════════════
//  Main render function — thin dispatcher
// ═══════════════════════════════════════════════════════════════

export function renderAnimatedFrame({ ctx, img, cropRect, storyData, theme, frame, fps = 30 }) {
  renderWithLayout({ ctx, img, cropRect, storyData, theme, frame, fps });
}
