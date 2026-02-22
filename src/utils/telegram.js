// ═══════════════════════════════════════════════════════════════
//  telegram.js — Telegram Bot API client (browser-side)
//
//  Sends photos, videos, and native interactive polls to a
//  Telegram chat/group using the Bot HTTP API.
// ═══════════════════════════════════════════════════════════════

const BOT_TOKEN = '8019167536:AAF_Bv_kwH75FEa-QXGKhs3j-DsQeDxKZ9s';
const CHAT_ID = '-5226724951';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send a photo (PNG blob) to the Telegram chat.
 * @param {Blob} blob - Image blob (image/png)
 * @param {string} caption - Markdown-formatted caption
 * @returns {Promise<object>} Telegram API response
 */
export async function sendPhoto(blob, caption = '') {
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
}

/**
 * Send a video (MP4 blob) to the Telegram chat.
 * @param {Blob} blob - Video blob (video/mp4)
 * @param {string} caption - Markdown-formatted caption
 * @returns {Promise<object>} Telegram API response
 */
export async function sendVideo(blob, caption = '') {
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
}

/**
 * Send a text message to the Telegram chat.
 * @param {string} text - Markdown-formatted message
 * @returns {Promise<object>} Telegram API response
 */
export async function sendMessage(text) {
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
}
