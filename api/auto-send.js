// ═══════════════════════════════════════════════════════════════
//  Vercel Serverless Cron — Auto-Send to Telegram
//
//  Runs daily at 8:05 AM IST (2:35 AM UTC) via Vercel Cron.
//  Fetches the latest row from Google Sheets, sends the
//  Flux-generated image + caption + poll to Telegram.
//
//  No browser needed — runs fully server-side.
// ═══════════════════════════════════════════════════════════════

const BOT_TOKEN = '8019167536:AAF_Bv_kwH75FEa-QXGKhs3j-DsQeDxKZ9s';
const CHAT_ID = '-5226724951';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const GOOGLE_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtDSB1S74HHrypW_cogBnPX51sdHluVtF_eSOqPGslCVUEo-o9k5P2zvNeu4pKjImju_YwaMiCJp9t/pub?gid=0&single=true&output=csv';

// ── Simple CSV parser (no external dependency needed) ──
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// ── Telegram API helpers (server-side, using fetch) ──
async function sendPhotoByUrl(imageUrl, caption) {
  const res = await fetch(`${API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      photo: imageUrl,
      caption,
      parse_mode: 'Markdown',
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`sendPhoto failed: ${data.description}`);
  return data;
}

async function sendPoll(question, optionsStr) {
  const options = optionsStr
    .split('|')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .slice(0, 10);

  if (options.length < 2) {
    console.log('Skipping poll — less than 2 options');
    return null;
  }

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
  if (!data.ok) throw new Error(`sendPoll failed: ${data.description}`);
  return data;
}

async function sendMessage(text) {
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
  if (!data.ok) throw new Error(`sendMessage failed: ${data.description}`);
  return data;
}

// ── Dedup: check last bot message in chat to avoid duplicate sends ──
async function getLastBotMessage() {
  try {
    // Use getUpdates to see recent outgoing messages isn't reliable,
    // so we'll send a "check" by getting chat info.
    // Instead, we'll use a simpler approach: just check if there's
    // a recent message from the bot with the same headline.

    // Telegram doesn't easily let bots read group history.
    // So we'll use a different approach: store last headline
    // in a pinned message or just accept one send per cron run.
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  // For manual testing, also allow direct access
  const isCron = req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`;
  const isManual = req.method === 'GET';

  if (!isCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
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

    const latest = rows[rows.length - 1];
    const headline = latest['Headline'] || '';
    const summary = latest['News Summary'] || '';
    const imageUrl = latest['Image URL'] || '';
    const pollQuestion = latest['Poll Question'] || '';
    const pollOptions = latest['Poll Options'] || '';

    addLog(`Latest story: "${headline}"`);

    if (!headline) {
      addLog('Empty headline — skipping');
      return res.status(200).json({ status: 'empty_headline', log });
    }

    // 2. Send image with caption
    if (imageUrl) {
      addLog('Sending image to Telegram…');
      const caption = `🚀 *${headline}*\n\n📰 ${summary}\n\n_— HITAM AI Club Daily Story_`;
      await sendPhotoByUrl(imageUrl, caption);
      addLog('✅ Image sent');
    } else {
      // No image, send as text
      addLog('No image URL — sending as text message');
      await sendMessage(`🚀 *${headline}*\n\n📰 ${summary}\n\n_— HITAM AI Club Daily Story_`);
      addLog('✅ Text message sent');
    }

    // 3. Send poll
    if (pollQuestion && pollOptions) {
      addLog(`Sending poll: "${pollQuestion}"`);
      await sendPoll(pollQuestion, pollOptions);
      addLog('✅ Poll sent');
    }

    addLog('🎉 All done!');
    return res.status(200).json({ status: 'sent', headline, log });
  } catch (err) {
    addLog(`❌ Error: ${err.message}`);
    console.error(err);

    // Try to notify via Telegram about the error
    try {
      await sendMessage(`⚠️ *Auto-send failed*\n\nError: ${err.message}`);
    } catch {
      // silent
    }

    return res.status(500).json({ status: 'error', error: err.message, log });
  }
}
