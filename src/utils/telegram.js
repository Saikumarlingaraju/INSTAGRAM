// ═══════════════════════════════════════════════════════════════
//  telegram.js — Telegram Bot API client (browser-side)
//
//  Sends photos, videos, and native interactive polls to a
//  Telegram chat/group using the Bot HTTP API.
//
//  Secrets read from Vite env vars (VITE_ prefix).
//  Includes retry with exponential backoff.
// ═══════════════════════════════════════════════════════════════

const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Retry helper: 3 attempts with exponential backoff ──
async function withRetry(fn, label = 'API call', maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const isRateLimit = err.message?.includes('429');
      const delay = isRateLimit ? 5000 * attempt : 1000 * Math.pow(2, attempt - 1);

      if (isLast) throw err;
      console.warn(`⚠ ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delay}ms…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Send a photo (PNG blob) to the Telegram chat.
 * @param {Blob} blob - Image blob (image/png)
 * @param {string} caption - Markdown-formatted caption
 * @returns {Promise<object>} Telegram API response
 */
export async function sendPhoto(blob, caption = '') {
  return withRetry(async () => {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('photo', blob, 'hitam-ai-story.png');
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'Markdown');
    }

    const res = await fetch(`${API}/sendPhoto`, { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendPhoto failed: ${data.description}`);
    console.log('✅ Telegram: Photo sent');
    return data;
  }, 'sendPhoto');
}

/**
 * Send a video (MP4 blob) to the Telegram chat.
 * @param {Blob} blob - Video blob (video/mp4)
 * @param {string} caption - Markdown-formatted caption
 * @returns {Promise<object>} Telegram API response
 */
export async function sendVideo(blob, caption = '') {
  return withRetry(async () => {
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append('video', blob, 'hitam-ai-story.mp4');
    form.append('supports_streaming', 'true');
    if (caption) {
      form.append('caption', caption);
      form.append('parse_mode', 'Markdown');
    }

    const res = await fetch(`${API}/sendVideo`, { method: 'POST', body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendVideo failed: ${data.description}`);
    console.log('✅ Telegram: Video sent');
    return data;
  }, 'sendVideo');
}

/**
 * Send a native interactive poll to the Telegram chat.
 * @param {string} question - The poll question
 * @param {string} optionsStr - Pipe-separated options: "Option A | Option B | Option C"
 * @returns {Promise<object>} Telegram API response
 */
export async function sendPoll(question, optionsStr) {
  // Parse pipe-separated options → array
  const options = optionsStr
    .split('|')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .slice(0, 10); // Telegram max 10 options

  if (options.length < 2) {
    throw new Error(`Poll needs at least 2 options, got: ${options.length}`);
  }

  // Telegram Bot API expects JSON body for sendPoll
  return withRetry(async () => {
    const res = await fetch(`${API}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        question,
        options: options.map((text) => ({ text })),
        is_anonymous: false,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendPoll failed: ${data.description}`);
    console.log('✅ Telegram: Poll sent with', options.length, 'options');
    return data;
  }, 'sendPoll');
}

/**
 * Send a text message to the Telegram chat.
 * @param {string} text - Markdown-formatted message
 * @returns {Promise<object>} Telegram API response
 */
export async function sendMessage(text) {
  return withRetry(async () => {
    const res = await fetch(`${API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
    return data;
  }, 'sendMessage');
}
