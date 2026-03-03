// ═══════════════════════════════════════════════════════════════
//  contentTypes.js
//
//  Registry of all content types produced by the n8n workflow.
//  Each entry carries display metadata used by the canvas renderer
//  and Telegram caption builder.
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ContentTypeConfig
 * @property {string} key           — canonical key (matches normalizeRow output)
 * @property {string} badge         — badge label rendered on the story canvas
 * @property {string} emoji         — prefix emoji for Telegram captions
 * @property {string} sourceText    — attribution line in the summary card
 * @property {string} layoutStyle   — which layout composer to use
 * @property {'warm'|'accent'|'primary'|'cool'} badgeGradientStart
 * @property {'accent'|'warm'|'primary'|'cool'} badgeGradientEnd
 * @property {string} ctaEmoji      — emoji prefix for the CTA section
 */

/** @type {Record<string, ContentTypeConfig>} */
export const CONTENT_TYPES = {
  ai_news: {
    key: 'ai_news',
    badge: '⚡ AI NEWS',
    emoji: '🤖',
    sourceText: 'Source: AI-curated news feed',
    layoutStyle: 'default',
    badgeGradientStart: 'warm',
    badgeGradientEnd: 'accent',
    ctaEmoji: '👉',
  },
  model_battle: {
    key: 'model_battle',
    badge: '⚔️ MODEL BATTLE',
    emoji: '⚔️',
    sourceText: 'Source: AI model comparison',
    layoutStyle: 'comparison',
    badgeGradientStart: 'primary',
    badgeGradientEnd: 'warm',
    ctaEmoji: '🏆',
  },
  tool_spotlight: {
    key: 'tool_spotlight',
    badge: '🔧 TOOL SPOTLIGHT',
    emoji: '🔧',
    sourceText: 'Source: AI tools directory',
    layoutStyle: 'spotlight',
    badgeGradientStart: 'accent',
    badgeGradientEnd: 'primary',
    ctaEmoji: '🚀',
  },
  myth_vs_fact: {
    key: 'myth_vs_fact',
    badge: '🧠 MYTH vs FACT',
    emoji: '🧠',
    sourceText: 'Source: AI knowledge base',
    layoutStyle: 'mythfact',
    badgeGradientStart: 'cool',
    badgeGradientEnd: 'accent',
    ctaEmoji: '💡',
  },
  ai_debate: {
    key: 'ai_debate',
    badge: '💬 AI DEBATE',
    emoji: '💬',
    sourceText: 'Source: AI community debate',
    layoutStyle: 'debate',
    badgeGradientStart: 'warm',
    badgeGradientEnd: 'cool',
    ctaEmoji: '🔥',
  },
};

/** Default fallback for unknown content types */
export const DEFAULT_CONTENT_TYPE = CONTENT_TYPES.ai_news;

/**
 * Look up the content type config for a given type string.
 * Falls back to ai_news for unknown types.
 *
 * @param {string} contentType — normalized content type key
 * @returns {ContentTypeConfig}
 */
export function getContentTypeConfig(contentType) {
  return CONTENT_TYPES[contentType] || DEFAULT_CONTENT_TYPE;
}
