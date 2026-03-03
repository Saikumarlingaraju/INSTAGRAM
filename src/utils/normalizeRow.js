// ═══════════════════════════════════════════════════════════════
//  normalizeRow.js
//
//  Normalizes a Google Sheets CSV row to the canonical schema.
//  Handles whitespace in column headers, missing fields, and
//  backward compatibility with old rows that lack Content Type / CTA Text.
// ═══════════════════════════════════════════════════════════════

const CANONICAL_FIELDS = [
  'Date',
  'Content Type',
  'Headline',
  'News Summary',
  'Poll Question',
  'Poll Options',
  'CTA Text',
  'Image URL',
];

/**
 * Normalize a content-type string to its canonical form.
 * Accepts: "tool_spotlight", "Tool Spotlight", "TOOL_SPOTLIGHT", "tool spotlight", etc.
 * Returns: "tool_spotlight" | "model_battle" | "myth_vs_fact" | "ai_debate" | "ai_news"
 */
function normalizeContentType(raw = '') {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')  // any non-alnum → underscore
    .replace(/_+/g, '_')          // collapse multiple underscores
    .replace(/^_|_$/g, '');       // trim leading/trailing

  // Map known aliases
  const aliases = {
    ai_news: 'ai_news',
    model_battle: 'model_battle',
    tool_spotlight: 'tool_spotlight',
    myth_vs_fact: 'myth_vs_fact',
    ai_debate: 'ai_debate',
    // Common alternate forms
    news: 'ai_news',
    battle: 'model_battle',
    spotlight: 'tool_spotlight',
    myth_fact: 'myth_vs_fact',
    debate: 'ai_debate',
  };

  return aliases[cleaned] || (cleaned || 'ai_news');
}

/**
 * Normalize a single Google Sheets CSV row.
 *
 * - Trims all keys (handles PapaParse whitespace issue)
 * - Defaults Content Type to "ai_news" if missing
 * - Defaults CTA Text to "" if missing
 * - Normalizes Content Type to lowercase_underscore form
 *
 * @param {object} row — raw parsed CSV row (key→value object)
 * @returns {object} — normalized row with canonical field names
 */
export function normalizeStoryRow(row) {
  if (!row || typeof row !== 'object') return null;

  // Build a trimmed-key lookup (handles " Headline " → "Headline")
  const trimmed = {};
  for (const [key, value] of Object.entries(row)) {
    trimmed[key.trim()] = typeof value === 'string' ? value : String(value ?? '');
  }

  // Extract canonical fields with defaults
  const normalized = {};
  for (const field of CANONICAL_FIELDS) {
    normalized[field] = trimmed[field] ?? '';
  }

  // Normalize content type
  normalized['Content Type'] = normalizeContentType(normalized['Content Type']);

  return normalized;
}
