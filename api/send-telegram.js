// ═══════════════════════════════════════════════════════════════
//  Vercel API Route — Telegram Send Proxy
//
//  Proxies Telegram API calls from the browser through the server
//  so that BOT_TOKEN and CHAT_ID are never exposed to the client.
//
//  POST /api/send-telegram
//  Body: multipart/form-data  (for photo/video with file upload)
//    OR  application/json      (for poll/message)
//
//  Required JSON fields:
//    action: "photo" | "video" | "poll" | "message"
//    ...action-specific fields (caption, question, options, text)
//
//  For photo/video: send as FormData with a `file` field + JSON `meta` field.
// ═══════════════════════════════════════════════════════════════

// ── Retry with exponential backoff ──
async function withRetry(fn, label = 'call', maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const isRateLimit = err.message?.includes('429');
      const delay = isRateLimit ? 5000 * attempt : 1000 * Math.pow(2, attempt - 1);
      console.warn(`⚠ ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Server misconfigured — missing Telegram env vars' });
  }

  const API = `https://api.telegram.org/bot${token}`;

  try {
    const contentType = req.headers['content-type'] || '';

    // ── Multipart: photo or video file upload ──
    if (contentType.includes('multipart/form-data')) {
      // Parse the incoming FormData
      // Vercel Edge/Serverless supports Request-style parsing
      const chunks = [];
      await new Promise((resolve, reject) => {
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', resolve);
        req.on('error', reject);
      });
      const rawBody = Buffer.concat(chunks);

      // Forward the entire multipart body to Telegram, adding chat_id
      // We need to re-parse and rebuild — simpler to use the Web API
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) {
        return res.status(400).json({ error: 'Missing multipart boundary' });
      }

      // Parse multipart manually to extract parts
      const parts = parseMultipart(rawBody, boundary);
      const metaPart = parts.find((p) => p.name === 'meta');
      const filePart = parts.find((p) => p.name === 'file');

      if (!metaPart) {
        return res.status(400).json({ error: 'Missing meta field in form data' });
      }

      const meta = JSON.parse(metaPart.data.toString('utf-8'));
      const action = meta.action; // "photo" or "video"

      // Build new FormData for Telegram
      const form = new FormData();
      form.append('chat_id', chatId);

      if (meta.caption) {
        form.append('caption', meta.caption);
        form.append('parse_mode', 'Markdown');
      }

      if (action === 'video') {
        form.append('supports_streaming', 'true');
      }

      if (filePart) {
        const fileFieldName = action === 'video' ? 'video' : 'photo';
        const fileName = action === 'video' ? 'hitam-ai-story.mp4' : 'hitam-ai-story.png';
        form.append(fileFieldName, new Blob([filePart.data], { type: filePart.contentType }), fileName);
      }

      const endpoint = action === 'video' ? 'sendVideo' : 'sendPhoto';
      const result = await withRetry(async () => {
        const resp = await fetch(`${API}/${endpoint}`, { method: 'POST', body: form });
        const data = await resp.json();
        if (!data.ok) throw new Error(`Telegram ${endpoint} failed: ${data.description}`);
        return data;
      }, endpoint);

      return res.status(200).json({ ok: true, result: result.result });
    }

    // ── JSON body: poll or message ──
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action } = body;

    if (action === 'poll') {
      const { question, options } = body;
      if (!question || !options || options.length < 2) {
        return res.status(400).json({ error: 'Poll needs question + at least 2 options' });
      }

      const result = await withRetry(async () => {
        const resp = await fetch(`${API}/sendPoll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            question,
            options,
            is_anonymous: false,
          }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(`sendPoll failed: ${data.description}`);
        return data;
      }, 'sendPoll');

      return res.status(200).json({ ok: true, result: result.result });
    }

    if (action === 'message') {
      const { text } = body;
      const result = await withRetry(async () => {
        const resp = await fetch(`${API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
          }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(`sendMessage failed: ${data.description}`);
        return data;
      }, 'sendMessage');

      return res.status(200).json({ ok: true, result: result.result });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('send-telegram error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════
//  Simple multipart/form-data parser
// ═══════════════════════════════════════════════════════
function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundary = Buffer.from(`--${boundary}--`);

  let start = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length;

  while (start < buffer.length) {
    // Skip \r\n after boundary
    if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) start += 2;

    // Find end of this part
    let end = indexOf(buffer, boundaryBuffer, start);
    if (end === -1) break;

    // The part data (minus trailing \r\n before boundary)
    let partData = buffer.subarray(start, end - 2); // -2 for \r\n before boundary

    // Split headers from body
    const headerEnd = indexOf(partData, Buffer.from('\r\n\r\n'), 0);
    if (headerEnd === -1) { start = end + boundaryBuffer.length; continue; }

    const headerStr = partData.subarray(0, headerEnd).toString('utf-8');
    const body = partData.subarray(headerEnd + 4);

    // Parse Content-Disposition
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
      data: body,
    });

    start = end + boundaryBuffer.length;

    // Check if we hit the end boundary
    if (indexOf(buffer, endBoundary, end) === end) break;
  }

  return parts;
}

function indexOf(buf, search, offset) {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}
