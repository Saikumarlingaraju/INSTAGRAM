// ═══════════════════════════════════════════════════════════════
//  layouts.js
//
//  Layout composers for each content type.
//  Each function composes renderSections blocks in a unique order
//  to create a visually distinct Instagram story per content type.
//
//  All layouts share the same function signature:
//    layout({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig })
//
//  typeConfig comes from contentTypes.js — badge text, gradients, etc.
// ═══════════════════════════════════════════════════════════════

import { getContentTypeConfig } from './contentTypes.js';
import { splitTextAtBoundary } from './renderHelpers.js';
import { createLayoutMetrics } from './layoutMetrics.js';
import {
  drawBackground,
  drawCornerAccents,
  drawStoryDots,
  drawAccentBar,
  drawBadge,
  drawDate,
  drawHeadline,
  drawDivider,
  drawSummaryCard,
  drawDualCard,
  drawCTA,
  drawDotGrid,
  drawPollSection,
  drawPollZone,
  drawVisualPollOptions,
  drawBranding,
  drawVsSeparator,
} from './renderSections.js';

// ── Shared animation timeline ──
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

// ═══════════════════════════════════════════════════════════════
//  DEFAULT LAYOUT — ai_news
//
//  The original layout: badge → headline → divider → summary card
//  → source → CTA → dot grid → poll → branding
// ═══════════════════════════════════════════════════════════════

function layoutDefault({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig }) {
  const metrics = createLayoutMetrics(storyData, typeConfig);
  drawBackground(ctx, img, cropRect, frame, T);
  drawCornerAccents(ctx, frame, T, theme, fps);
  drawStoryDots(ctx, frame, T);

  let cursorY = drawAccentBar(ctx, frame, T, theme);

  drawBadge(ctx, cursorY, frame, T, theme, fps,
    typeConfig.badge, typeConfig.badgeGradientStart, typeConfig.badgeGradientEnd, metrics);
  drawDate(ctx, cursorY, frame, T, storyData['Date'], metrics);

  cursorY += 36 + 20; // badge height + gap

  cursorY = drawHeadline(ctx, cursorY, storyData['Headline'], frame, T, theme, fps, metrics);
  cursorY = drawDivider(ctx, cursorY, frame, T, theme);
  cursorY = drawSummaryCard(ctx, cursorY, storyData['News Summary'], typeConfig.sourceText, frame, T, theme, metrics);
  cursorY = drawCTA(ctx, cursorY, storyData['CTA Text'], typeConfig.ctaEmoji, frame, T, theme, {}, metrics);

  drawDotGrid(ctx, cursorY, frame, T, theme);
  drawPollSection(ctx, storyData['Poll Question'], frame, T, theme, fps, metrics);
  drawPollZone(ctx, frame, T, theme, metrics);
  drawBranding(ctx, frame, T, theme, metrics);
}

// ═══════════════════════════════════════════════════════════════
//  COMPARISON LAYOUT — model_battle
//
//  Split the summary into two competing sides with a VS separator.
//  Falls back to single card if no natural split point found.
// ═══════════════════════════════════════════════════════════════

function layoutComparison({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig }) {
  const metrics = createLayoutMetrics(storyData, typeConfig);
  drawBackground(ctx, img, cropRect, frame, T);
  drawCornerAccents(ctx, frame, T, theme, fps);
  drawStoryDots(ctx, frame, T);

  let cursorY = drawAccentBar(ctx, frame, T, theme);

  drawBadge(ctx, cursorY, frame, T, theme, fps,
    typeConfig.badge, typeConfig.badgeGradientStart, typeConfig.badgeGradientEnd, metrics);
  drawDate(ctx, cursorY, frame, T, storyData['Date'], metrics);

  cursorY += 36 + 20;

  cursorY = drawHeadline(ctx, cursorY, storyData['Headline'], frame, T, theme, fps, metrics);
  cursorY = drawDivider(ctx, cursorY, frame, T, theme);

  // Try to split summary for comparison view
  const summary = storyData['News Summary'] || '';
  const parts = splitTextAtBoundary(summary, [
    'vs.', 'vs ', 'versus', 'compared to', 'while', 'whereas',
    'on the other hand', 'in contrast', 'meanwhile',
  ]);

  if (parts) {
    // Draw VS separator between the two cards
    const vsY = cursorY; // save for VS circle position
    cursorY = drawDualCard(ctx, cursorY,
      parts[0], parts[1],
      '🏆 CONTENDER A', '🏆 CONTENDER B',
      theme.primaryRgb, theme.warmRgb,
      frame, T, theme, metrics
    );
    // VS circle at the boundary
    const midCardY = vsY + 60; // approximate middle of first card
    drawVsSeparator(ctx, midCardY, frame, T, theme, fps);
  } else {
    // Fallback to single card
    cursorY = drawSummaryCard(ctx, cursorY, summary, typeConfig.sourceText, frame, T, theme, metrics);
  }

  cursorY = drawCTA(ctx, cursorY, storyData['CTA Text'], typeConfig.ctaEmoji, frame, T, theme, {}, metrics);

  drawDotGrid(ctx, cursorY, frame, T, theme);
  drawPollSection(ctx, storyData['Poll Question'], frame, T, theme, fps, metrics);
  drawPollZone(ctx, frame, T, theme, metrics);
  drawBranding(ctx, frame, T, theme, metrics);
}

// ═══════════════════════════════════════════════════════════════
//  SPOTLIGHT LAYOUT — tool_spotlight
//
//  Summary card + prominent CTA banner (full-width accent pill).
// ═══════════════════════════════════════════════════════════════

function layoutSpotlight({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig }) {
  const metrics = createLayoutMetrics(storyData, typeConfig);
  drawBackground(ctx, img, cropRect, frame, T);
  drawCornerAccents(ctx, frame, T, theme, fps);
  drawStoryDots(ctx, frame, T);

  let cursorY = drawAccentBar(ctx, frame, T, theme);

  drawBadge(ctx, cursorY, frame, T, theme, fps,
    typeConfig.badge, typeConfig.badgeGradientStart, typeConfig.badgeGradientEnd, metrics);
  drawDate(ctx, cursorY, frame, T, storyData['Date'], metrics);

  cursorY += 36 + 20;

  cursorY = drawHeadline(ctx, cursorY, storyData['Headline'], frame, T, theme, fps, metrics);
  cursorY = drawDivider(ctx, cursorY, frame, T, theme);
  cursorY = drawSummaryCard(ctx, cursorY, storyData['News Summary'], typeConfig.sourceText, frame, T, theme, metrics);

  // Prominent CTA for tool spotlight
  cursorY = drawCTA(ctx, cursorY, storyData['CTA Text'], typeConfig.ctaEmoji, frame, T, theme, { prominent: true }, metrics);

  drawDotGrid(ctx, cursorY, frame, T, theme);
  drawPollSection(ctx, storyData['Poll Question'], frame, T, theme, fps, metrics);
  drawPollZone(ctx, frame, T, theme, metrics);
  drawBranding(ctx, frame, T, theme, metrics);
}

// ═══════════════════════════════════════════════════════════════
//  MYTH vs FACT LAYOUT — myth_vs_fact
//
//  Split summary into Myth (red-tinted card) and Fact (green-tinted card).
//  Falls back to single card if no natural split found.
// ═══════════════════════════════════════════════════════════════

function layoutMythFact({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig }) {
  const metrics = createLayoutMetrics(storyData, typeConfig);
  drawBackground(ctx, img, cropRect, frame, T);
  drawCornerAccents(ctx, frame, T, theme, fps);
  drawStoryDots(ctx, frame, T);

  let cursorY = drawAccentBar(ctx, frame, T, theme);

  drawBadge(ctx, cursorY, frame, T, theme, fps,
    typeConfig.badge, typeConfig.badgeGradientStart, typeConfig.badgeGradientEnd, metrics);
  drawDate(ctx, cursorY, frame, T, storyData['Date'], metrics);

  cursorY += 36 + 20;

  cursorY = drawHeadline(ctx, cursorY, storyData['Headline'], frame, T, theme, fps, metrics);
  cursorY = drawDivider(ctx, cursorY, frame, T, theme);

  // Try to split summary into myth + fact
  const summary = storyData['News Summary'] || '';
  const parts = splitTextAtBoundary(summary, [
    'However,', 'In reality,', 'The truth is', 'Actually,',
    'But in fact', 'The fact is', 'In truth,', 'Reality:',
    'Fact:', 'The reality is',
  ]);

  if (parts) {
    cursorY = drawDualCard(ctx, cursorY,
      parts[0], parts[1],
      '❌ MYTH', '✅ FACT',
      '255, 80, 80',     // red tint for myth
      '80, 200, 120',    // green tint for fact
      frame, T, theme, metrics
    );
  } else {
    // Fallback to single card
    cursorY = drawSummaryCard(ctx, cursorY, summary, typeConfig.sourceText, frame, T, theme, metrics);
  }

  cursorY = drawCTA(ctx, cursorY, storyData['CTA Text'], typeConfig.ctaEmoji, frame, T, theme, {}, metrics);

  drawDotGrid(ctx, cursorY, frame, T, theme);
  drawPollSection(ctx, storyData['Poll Question'], frame, T, theme, fps, metrics);
  drawPollZone(ctx, frame, T, theme);
  drawBranding(ctx, frame, T, theme, metrics);
}

// ═══════════════════════════════════════════════════════════════
//  DEBATE LAYOUT — ai_debate
//
//  Summary card + visual poll options rendered as styled chips
//  (replacing the dashed "Tap to Vote" zone).
// ═══════════════════════════════════════════════════════════════

function layoutDebate({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig }) {
  const metrics = createLayoutMetrics(storyData, typeConfig);
  drawBackground(ctx, img, cropRect, frame, T);
  drawCornerAccents(ctx, frame, T, theme, fps);
  drawStoryDots(ctx, frame, T);

  let cursorY = drawAccentBar(ctx, frame, T, theme);

  drawBadge(ctx, cursorY, frame, T, theme, fps,
    typeConfig.badge, typeConfig.badgeGradientStart, typeConfig.badgeGradientEnd);
  drawDate(ctx, cursorY, frame, T, storyData['Date']);

  cursorY += 36 + 20;

  cursorY = drawHeadline(ctx, cursorY, storyData['Headline'], frame, T, theme, fps, metrics);
  cursorY = drawDivider(ctx, cursorY, frame, T, theme);
  cursorY = drawSummaryCard(ctx, cursorY, storyData['News Summary'], typeConfig.sourceText, frame, T, theme, metrics);
  cursorY = drawCTA(ctx, cursorY, storyData['CTA Text'], typeConfig.ctaEmoji, frame, T, theme, {}, metrics);

  drawDotGrid(ctx, cursorY, frame, T, theme);
  drawPollSection(ctx, storyData['Poll Question'], frame, T, theme, fps, metrics);

  // Visual poll options instead of dashed zone
  drawVisualPollOptions(ctx, storyData['Poll Options'], frame, T, theme, metrics);

  drawBranding(ctx, frame, T, theme, metrics);
}

// ═══════════════════════════════════════════════════════════════
//  LAYOUT REGISTRY — maps layoutStyle → function
// ═══════════════════════════════════════════════════════════════

const LAYOUT_MAP = {
  default: layoutDefault,
  comparison: layoutComparison,
  spotlight: layoutSpotlight,
  mythfact: layoutMythFact,
  debate: layoutDebate,
};

/**
 * Render one frame of the Instagram story, dispatching to the
 * correct layout based on the Content Type field.
 *
 * @param {object} params — same signature as the old renderAnimatedFrame
 */
export function renderWithLayout({ ctx, img, cropRect, storyData, theme, frame, fps = 30 }) {
  const contentType = storyData['Content Type'] || 'ai_news';
  const typeConfig = getContentTypeConfig(contentType);
  const layoutFn = LAYOUT_MAP[typeConfig.layoutStyle] || layoutDefault;

  layoutFn({ ctx, img, cropRect, storyData, theme, frame, fps, typeConfig });
}
