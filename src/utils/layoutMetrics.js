// ═══════════════════════════════════════════════════════════════
//  layoutMetrics.js
//
//  Compute adaptive typography metrics for story layouts.
//  The renderer stays at 1080x1920, but long content needs
//  smaller type and tighter spacing so every layout can fit.
// ═══════════════════════════════════════════════════════════════

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countWords(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function length(text) {
  return (text || '').trim().length;
}

function optionLengths(storyData) {
  const raw = storyData?.['Poll Options'] || '';
  return raw
    .split('|')
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => option.length);
}

function typeBias(typeConfig) {
  if (typeConfig?.layoutStyle === 'comparison' || typeConfig?.layoutStyle === 'mythfact') {
    return -0.06;
  }
  if (typeConfig?.layoutStyle === 'debate') {
    return -0.03;
  }
  return 0;
}

export function createLayoutMetrics(storyData = {}, typeConfig = {}) {
  const headline = storyData['Headline'] || '';
  const summary = storyData['News Summary'] || '';
  const cta = storyData['CTA Text'] || '';
  const pollQuestion = storyData['Poll Question'] || '';
  const options = optionLengths(storyData);
  const headlineWords = countWords(headline);
  const headlineLength = length(headline);
  const summaryLength = length(summary);
  const ctaLength = length(cta);
  const pollQuestionLength = length(pollQuestion);
  const longestOption = options.length > 0 ? Math.max(...options) : 0;
  const bias = typeBias(typeConfig);

  const headlineSize = clamp(
    Math.round(80 - Math.max(0, headlineWords - 7) * 2.5 - Math.max(0, headlineLength - 46) * 0.35 + bias * 50),
    56,
    80,
  );

  const headlineLeading = Math.round(headlineSize * 1.06 + 6);

  const summarySize = clamp(
    Math.round(34 - Math.max(0, summaryLength - 220) * 0.045 + bias * 30),
    24,
    34,
  );

  const summaryLineHeight = Math.round(summarySize * 1.34);

  const dualCardSize = clamp(
    Math.round(30 - Math.max(0, summaryLength - 180) * 0.03 + bias * 24),
    22,
    30,
  );

  const dualCardLineHeight = Math.round(dualCardSize * 1.35);

  const ctaSize = clamp(
    Math.round(28 - Math.max(0, ctaLength - 20) * 0.18 + bias * 18),
    20,
    28,
  );

  const ctaPillSize = clamp(
    Math.round(26 - Math.max(0, ctaLength - 18) * 0.14 + bias * 14),
    18,
    26,
  );

  const pollQuestionSize = clamp(
    Math.round(36 - Math.max(0, pollQuestionLength - 68) * 0.08 + bias * 18),
    24,
    36,
  );

  const pollQuestionLineHeight = Math.round(pollQuestionSize * 1.28);

  const pollOptionSize = clamp(
    Math.round(24 - Math.max(0, longestOption - 22) * 0.18 + bias * 12),
    18,
    24,
  );

  const pollOptionChipHeight = clamp(Math.round(pollOptionSize * 2.05), 42, 52);

  const badgeSize = clamp(
    Math.round(22 - Math.max(0, headlineLength - 60) * 0.03),
    18,
    22,
  );

  const dateSize = clamp(
    Math.round(20 - Math.max(0, headlineLength - 70) * 0.02),
    16,
    20,
  );

  const sourceSize = clamp(
    Math.round(20 - Math.max(0, summaryLength - 240) * 0.03),
    16,
    20,
  );

  const sourceLineHeight = Math.round(sourceSize * 1.2);

  return {
    headlineSize,
    headlineLeading,
    summarySize,
    summaryLineHeight,
    dualCardSize,
    dualCardLineHeight,
    ctaSize,
    ctaPillSize,
    pollQuestionSize,
    pollQuestionLineHeight,
    pollOptionSize,
    pollOptionChipHeight,
    badgeSize,
    dateSize,
    sourceSize,
    sourceLineHeight,
  };
}
