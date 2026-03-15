// ═══════════════════════════════════════════════════════════════
//  telegram.js — Telegram Bot API client (browser-side)
//
//  All requests are proxied through /api/send-telegram so that
//  the bot token is NEVER exposed in the client bundle.
//  Retry logic lives server-side in the API route.
// ═══════════════════════════════════════════════════════════════

const PROXY = '/api/send-telegram';

async function parseProxyResponse(res, action) {
  const raw = await res.text();

  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const preview = raw ? raw.slice(0, 180) : 'empty response body';
    throw new Error(`${action} failed (HTTP ${res.status}): ${preview}`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `${action} failed (HTTP ${res.status})`);
  }

  return data;
}

/**
 * Send a photo (PNG blob) to Telegram via server proxy.
 */
export async function sendPhoto(blob, caption = '') {
  const form = new FormData();
  form.append('meta', JSON.stringify({ action: 'photo', caption }));
  form.append('file', blob, 'hitam-ai-story.png');

  const res = await fetch(PROXY, { method: 'POST', body: form });
  return parseProxyResponse(res, 'sendPhoto');
}

/**
 * Send a video (MP4 blob) to Telegram via server proxy.
 */
export async function sendVideo(blob, caption = '') {
  const form = new FormData();
  form.append('meta', JSON.stringify({ action: 'video', caption }));
  form.append('file', blob, 'hitam-ai-story.mp4');

  const res = await fetch(PROXY, { method: 'POST', body: form });
  return parseProxyResponse(res, 'sendVideo');
}

/**
 * Send a native interactive poll to Telegram via server proxy.
 */
export async function sendPoll(question, optionsStr) {
  const options = optionsStr
    .split('|')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .slice(0, 10);

  if (options.length < 2) {
    throw new Error(`Poll needs at least 2 options, got: ${options.length}`);
  }

  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'poll', question, options }),
  });
  return parseProxyResponse(res, 'sendPoll');
}

/**
 * Send a text message to Telegram via server proxy.
 */
export async function sendMessage(text) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'message', text }),
  });
  return parseProxyResponse(res, 'sendMessage');
}
