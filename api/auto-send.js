// ═══════════════════════════════════════════════════════════════
//  Vercel Serverless Cron — Auto-Send to Telegram
//
//  Runs daily at 7:45 AM IST (2:15 AM UTC) via Vercel Cron.
//  Fetches the latest row from Google Sheets, renders the
//  Instagram story design using @napi-rs/canvas + renderAnimatedFrame,
//  then sends the rendered PNG + caption + poll to Telegram.
//
//  Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CRON_SECRET
//  (set in Vercel Dashboard → Settings → Environment Variables)
// ═══════════════════════════════════════════════════════════════

import { renderStoryOnServer, renderStoryGif } from './lib/serverCanvas.js';
import { normalizeStoryRow } from '../src/utils/normalizeRow.js';
import { getContentTypeConfig } from '../src/utils/contentTypes.js';
import Papa from 'papaparse';

const GOOGLE_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtDSB1S74HHrypW_cogBnPX51sdHluVtF_eSOqPGslCVUEo-o9k5P2zvNeu4pKjImju_YwaMiCJp9t/pub?gid=0&single=true&output=csv';

// ── Read secrets from env ──
function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars');
  }

  return {
    token,
    chatId,
    api: `https://api.telegram.org/bot${token}`,
  };
}

// ── Robust CSV parser (supports quoted commas/newlines) ──
function parseCSV(csvText) {
  const { data } = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return Array.isArray(data) ? data : [];
}

// ── Retry with exponential backoff ──
async function withRetry(fn, label = 'call', maxRetries = 3) {
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

async function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Telegram API helpers ──
async function sendPhotoBuffer(api, chatId, pngBuffer, caption) {
  return withRetry(async () => {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
    formData.append(
      'photo',
      new Blob([pngBuffer], { type: 'image/png' }),
      'hitam-ai-story.png'
    );

    const res = await fetch(`${api}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`sendPhoto failed: ${data.description}`);
    return data;
  }, 'sendPhoto');
}

// Fallback: send by URL if canvas rendering fails
async function sendPhotoByUrl(api, chatId, imageUrl, caption) {
  return withRetry(async () => {
    const res = await fetch(`${api}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        caption,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`sendPhoto failed: ${data.description}`);
    return data;
  }, 'sendPhoto');
}

// Send animated GIF as Telegram animation (auto-loops, looks like video)
async function sendAnimation(api, chatId, gifBuffer, caption) {
  return withRetry(async () => {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'Markdown');
    formData.append(
      'animation',
      new Blob([gifBuffer], { type: 'image/gif' }),
      'hitam-ai-story.gif'
    );

    const res = await fetch(`${api}/sendAnimation`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`sendAnimation failed: ${data.description}`);
    return data;
  }, 'sendAnimation');
}

async function sendPoll(api, chatId, question, optionsStr) {
  const options = optionsStr
    .split('|')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .slice(0, 10);

  if (options.length < 2) {
    console.log('Skipping poll — less than 2 options');
    return null;
  }

  return withRetry(async () => {
    const res = await fetch(`${api}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        question,
        options,
        is_anonymous: false,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`sendPoll failed: ${data.description}`);
    return data;
  }, 'sendPoll');
}

async function sendMessage(api, chatId, text) {
  return withRetry(async () => {
    const res = await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`sendMessage failed: ${data.description}`);
    return data;
  }, 'sendMessage');
}

function normalizeHeadline(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getKvConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_REST_REDIS_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_REDIS_URL;

  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.UPSTASH_REDIS_REST_REDIS_TOKEN ||
    process.env.STORAGE_TOKEN ||
    process.env.STORAGE_REDIS_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

async function kvGet(key) {
  const kv = getKvConfig();
  if (!kv) return null;

  const res = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${kv.token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`KV get failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data?.result ?? null;
}

async function kvSet(key, value, ttlSec = 60 * 60 * 24 * 365) {
  const kv = getKvConfig();
  if (!kv) return false;

  const setUrl = `${kv.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSec}`;
  const res = await fetch(setUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kv.token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`KV set failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  return data?.result === 'OK';
}

// ── Dedup: check recent bot messages for this headline ──
async function wasAlreadySent(api, chatId, headline) {
  try {
    const headlineKey = normalizeHeadline(headline);
    if (!headlineKey) return false;

    // Use a larger window to reduce duplicate resends on later days.
    const res = await fetch(`${api}/getUpdates?limit=100&allowed_updates=["channel_post","message"]`);
    const data = await res.json();

    if (!data.ok || !data.result) return false;

    // Check recent outgoing bot messages in this chat.
    for (const update of data.result) {
      const msg = update.message || update.channel_post;
      if (!msg) continue;
      if (String(msg.chat?.id) !== String(chatId)) continue;
      const isOutgoingBotMsg = msg.from?.is_bot || msg.sender_chat?.id;
      if (!isOutgoingBotMsg) continue;

      const text = msg.text || msg.caption || '';
      const textKey = normalizeHeadline(text);
      if (textKey.includes(headlineKey)) {
        return true;
      }
    }
    return false;
  } catch {
    // If dedup check fails, proceed with send (better to duplicate than miss)
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // ── Authentication ──
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  // Manual trigger requires: ?secret=<CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.headers['authorization'] === `Bearer ${cronSecret}`;
  const isManualAuth = cronSecret && req.query?.secret === cronSecret;

  if (!isCron && !isManualAuth) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: 'Cron jobs are authenticated automatically. For manual trigger, use ?secret=YOUR_CRON_SECRET',
    });
  }

  const log = [];
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    log.push(`[${time}] ${msg}`);
    console.log(`[${time}] ${msg}`);
  };

  let cfg;
  try {
    cfg = getConfig();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  try {
    // 1. Fetch latest row from Google Sheets
    addLog('Fetching Google Sheets…');
    const csvRes = await fetch(GOOGLE_SHEETS_CSV_URL);
    if (!csvRes.ok) throw new Error('Failed to fetch Google Sheets');

    const csvText = await csvRes.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      addLog('No data in spreadsheet');
      return res.status(200).json({ status: 'no_data', log });
    }

    const latest = normalizeStoryRow(rows[rows.length - 1]);
    const headline = latest['Headline'] || '';
    const summary = latest['News Summary'] || '';
    const imageUrl = latest['Image URL'] || '';
    const pollQuestion = latest['Poll Question'] || '';
    const pollOptions = latest['Poll Options'] || '';
    const contentType = latest['Content Type'] || 'ai_news';
    const ctConfig = getContentTypeConfig(contentType);

    addLog(`Latest story: "${headline}"`);

    if (!headline) {
      addLog('Empty headline — skipping');
      return res.status(200).json({ status: 'empty_headline', log });
    }

    const headlineKey = normalizeHeadline(headline);
    const dedupKey = `hitam:sent_story:${contentType}::${headlineKey}`;

    // 2. Dedup check — KV first (persistent), Telegram history fallback
    addLog('Checking for duplicates…');
    let alreadySent = false;

    try {
      const kvValue = await kvGet(dedupKey);
      if (kvValue) {
        alreadySent = true;
        addLog('KV dedup hit — already sent before');
      }
    } catch (err) {
      addLog(`⚠ KV read failed: ${err.message} — falling back to Telegram history`);
    }

    if (!alreadySent) {
      alreadySent = await wasAlreadySent(cfg.api, cfg.chatId, headline);
      if (alreadySent) {
        addLog('Telegram history dedup hit — already sent before');
        try {
          await kvSet(dedupKey, new Date().toISOString());
          addLog('Backfilled dedup key in KV');
        } catch {
          // non-fatal
        }
      }
    }

    if (alreadySent) {
      addLog(`⚠ Already sent: "${headline}" — skipping`);
      return res.status(200).json({ status: 'already_sent', headline, log });
    }

    // 3. Render/send story — animated GIF first, static PNG fallback
    const caption = `${ctConfig.emoji} *${headline}*\n\n📰 ${summary}\n\n_— HITAM AI Club Daily Story_`;
    let sentAnimation = false;

    if (imageUrl) {
      // Try animated GIF first (appears as looping video in Telegram)
      try {
        addLog('Rendering animated story GIF…');
        const gifBuffer = await withTimeout(renderStoryGif(latest), 35000, 'GIF render');
        addLog(`✅ GIF rendered (${(gifBuffer.length / 1024).toFixed(0)} KB) — sending to Telegram…`);
        await sendAnimation(cfg.api, cfg.chatId, gifBuffer, caption);
        addLog('✅ Animated story sent');
        sentAnimation = true;
      } catch (gifErr) {
        addLog(`⚠ GIF render/send failed: ${gifErr.message} — trying static PNG…`);
      }

      // If GIF failed, send static rendered PNG
      if (!sentAnimation) {
        try {
          addLog('Rendering static story PNG…');
          const pngBuffer = await renderStoryOnServer(latest);
          addLog('✅ PNG rendered — sending to Telegram…');
          await sendPhotoBuffer(cfg.api, cfg.chatId, pngBuffer, caption);
          addLog('✅ Rendered story sent');
        } catch (renderErr) {
          addLog(`⚠ Server render failed: ${renderErr.message} — falling back to raw image`);
          await sendPhotoByUrl(cfg.api, cfg.chatId, imageUrl, caption);
          addLog('✅ Raw image sent (fallback)');
        }
      }
    } else {
      addLog('No image URL — sending as text message');
      await sendMessage(cfg.api, cfg.chatId, caption);
      addLog('✅ Text message sent');
    }

    // Mark dedup key after successful primary send.
    try {
      const saved = await kvSet(dedupKey, new Date().toISOString());
      if (saved) {
        addLog('✅ Saved dedup key to KV');
      }
    } catch (err) {
      addLog(`⚠ KV write failed: ${err.message}`);
    }

    // 4. Send poll
    if (pollQuestion && pollOptions) {
      addLog(`Sending poll: "${pollQuestion}"`);
      await sendPoll(cfg.api, cfg.chatId, pollQuestion, pollOptions);
      addLog('✅ Poll sent');
    }

    addLog('🎉 All done!');
    return res.status(200).json({ status: 'sent', headline, log });
  } catch (err) {
    addLog(`❌ Error: ${err.message}`);
    console.error(err);

    // Try to notify via Telegram about the error
    try {
      await sendMessage(cfg.api, cfg.chatId, `⚠️ *Auto-send failed*\n\nError: ${err.message}`);
    } catch {
      // silent
    }

    return res.status(500).json({ status: 'error', error: err.message, log });
  }
}
