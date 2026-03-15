import { useEffect, useState, useCallback, useRef } from 'react';
import { sendVideo, sendPoll } from '../utils/telegram';
import { createTheme, DEFAULT_THEME } from '../utils/theme';
import { loadImageForRendering } from '../utils/loadImage';
import { getContentTypeConfig } from '../utils/contentTypes';

const normalizeHeadline = (text = '') =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LS_LAST_HEADLINE = 'hitam-ai-last-headline';
const LS_LAST_HEADLINE_KEY = 'hitam-ai-last-headline-key';
const LS_LAST_SENT_AT = 'hitam-ai-last-sent-at';
const LS_SENT_CONFIRMED = 'hitam-ai-last-send-confirmed';
const LS_LAST_STORY_FINGERPRINT = 'hitam-ai-last-story-fingerprint';
const LS_APP_SCHEMA_VERSION = 'hitam-ai-app-schema-version';
const APP_SCHEMA_VERSION = 'v2-force-manual-send';

const normalizeFingerprintText = (text = '') =>
  String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const normalizePollOptionsForFingerprint = (options = '') =>
  String(options)
    .split('|')
    .map((o) => normalizeFingerprintText(o))
    .filter(Boolean)
    .join('|');

const buildStoryFingerprint = (story) => [
  normalizeFingerprintText(story?.['Content Type'] || 'ai_news'),
  normalizeFingerprintText(story?.['Headline'] || ''),
  normalizeFingerprintText(story?.['News Summary'] || ''),
  normalizeFingerprintText(story?.['Poll Question'] || ''),
  normalizePollOptionsForFingerprint(story?.['Poll Options'] || ''),
  normalizeFingerprintText(story?.['Image URL'] || ''),
].join('||');

const getSavedDedupKey = () => {
  const confirmed = localStorage.getItem(LS_SENT_CONFIRMED) === '1';
  if (!confirmed) return '';

  const savedFingerprint = localStorage.getItem(LS_LAST_STORY_FINGERPRINT) || '';
  if (savedFingerprint) return savedFingerprint;

  const savedHeadline = localStorage.getItem(LS_LAST_HEADLINE) || '';
  const savedHeadlineKey =
    localStorage.getItem(LS_LAST_HEADLINE_KEY) || normalizeHeadline(savedHeadline);
  // Support new composite key format: contentType::headlineKey
  const savedContentType = localStorage.getItem('hitam-ai-last-content-type') || '';
  return savedContentType ? `${savedContentType}::${savedHeadlineKey}` : savedHeadlineKey;
};

// ═══════════════════════════════════════════════════════
//  useAutoSend — Telegram send pipeline + auto-polling
// ═══════════════════════════════════════════════════════
export function useAutoSend({
  fontsReady,
  storyData,
  setStoryData,
  loadedImage,
  smartcropRect,
  colorTheme,
  fetchLatestStory,
  addLog,
  generateMp4Blob,
  setRecording,
  setRecordProgress,
}) {
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [lastSentHeadline, setLastSentHeadline] = useState(
    () => localStorage.getItem('hitam-ai-last-headline') || ''
  );
  const [lastSentAt, setLastSentAt] = useState(
    () => localStorage.getItem('hitam-ai-last-sent-at') || ''
  );
  const [sending, setSending] = useState(false);
  const [sendStep, setSendStep] = useState('');
  const [nextCheckIn, setNextCheckIn] = useState(0);
  const sendingRef = useRef(false);
  const sendToTelegramRef = useRef(null);

  // ── One-time migration: ignore legacy dedup values from old builds ──
  useEffect(() => {
    const schemaVersion = localStorage.getItem(LS_APP_SCHEMA_VERSION) || '';
    if (schemaVersion !== APP_SCHEMA_VERSION) {
      localStorage.removeItem(LS_LAST_HEADLINE);
      localStorage.removeItem(LS_LAST_HEADLINE_KEY);
      localStorage.removeItem(LS_LAST_SENT_AT);
      localStorage.removeItem(LS_SENT_CONFIRMED);
      localStorage.removeItem('hitam-ai-last-content-type');
      localStorage.removeItem(LS_LAST_STORY_FINGERPRINT);
      localStorage.setItem(LS_APP_SCHEMA_VERSION, APP_SCHEMA_VERSION);
      return;
    }

    const hasLegacy =
      !!localStorage.getItem(LS_LAST_HEADLINE) ||
      !!localStorage.getItem(LS_LAST_HEADLINE_KEY) ||
      !!localStorage.getItem(LS_LAST_SENT_AT);
    const confirmed = localStorage.getItem(LS_SENT_CONFIRMED) === '1';

    if (hasLegacy && !confirmed) {
      localStorage.removeItem(LS_LAST_HEADLINE);
      localStorage.removeItem(LS_LAST_HEADLINE_KEY);
      localStorage.removeItem(LS_LAST_SENT_AT);
    }
  }, []);

  // ── Send to Telegram pipeline ──
  const sendToTelegram = useCallback(
    async (data, img, crop, theme) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);

      const headline = data['Headline'] || 'AI News';
      const summary = data['News Summary'] || '';
      const pollQ = data['Poll Question'] || '';
      const pollOpts = data['Poll Options'] || '';
      const contentType = data['Content Type'] || 'ai_news';
      const ctConfig = getContentTypeConfig(contentType);

      const caption = `${ctConfig.emoji} *${headline}*\n\n📰 ${summary}`;

      try {
        // Step 1: Send MP4 only
        setSendStep('mp4');
        addLog('Rendering & sending animated video…');
        setRecording(true);
        setRecordProgress(0);

        const mp4Blob = await generateMp4Blob(
          data, img, crop, theme,
          (p) => setRecordProgress(p),
          { profile: 'telegram' }
        );

        setRecording(false);
        setRecordProgress(0);

        await sendVideo(mp4Blob, caption);
        addLog('✅ Animated video sent');

        // Step 2: Send Poll
        if (pollQ && pollOpts) {
          setSendStep('poll');
          addLog(`Sending poll: "${pollQ}"`);
          await sendPoll(pollQ, pollOpts);
          addLog('✅ Poll sent');
        }

        // Mark as sent
        setSendStep('done');
        setLastSentHeadline(headline);
        setLastSentAt(new Date().toLocaleString());
        localStorage.setItem(LS_LAST_HEADLINE, headline);
        localStorage.setItem(LS_LAST_HEADLINE_KEY, normalizeHeadline(headline));
        localStorage.setItem(LS_LAST_SENT_AT, new Date().toLocaleString());
        localStorage.setItem(LS_SENT_CONFIRMED, '1');
        localStorage.setItem('hitam-ai-last-content-type', contentType);
        localStorage.setItem(LS_LAST_STORY_FINGERPRINT, buildStoryFingerprint(data));
        addLog(`✅ All sent! Headline: "${headline}"`);
      } catch (err) {
        setSendStep('error');
        addLog(`❌ Error: ${err.message}`);
        console.error('Telegram send error:', err);
      } finally {
        setSending(false);
        sendingRef.current = false;
        setRecording(false);
        setRecordProgress(0);
      }
    },
    [generateMp4Blob, addLog, setRecording, setRecordProgress]
  );

  // Keep ref in sync
  sendToTelegramRef.current = sendToTelegram;

  // ── Manual send (force-send always) ──
  const handleManualSend = useCallback(() => {
    if (!storyData || !loadedImage || sending) return;
    addLog('Manual send triggered — force sending to Telegram…');
    sendToTelegram(storyData, loadedImage, smartcropRect, colorTheme);
  }, [storyData, loadedImage, smartcropRect, colorTheme, sending, sendToTelegram, addLog]);

  // ── Auto-polling — check Google Sheets for new data ──
  useEffect(() => {
    if (!autoEnabled || !fontsReady) return;

    const getInterval = () => {
      const now = new Date();
      const hour = now.getHours();
      const min = now.getMinutes();
      // Fast-poll around n8n workflow time (7:30-8:30 AM IST)
      if (hour === 7 && min >= 30) return 2 * 60 * 1000;
      if (hour === 8 && min <= 30) return 2 * 60 * 1000;
      return 10 * 60 * 1000;
    };

    let timerId;

    const poll = async () => {
      try {
        const latest = await fetchLatestStory();
        const headline = latest['Headline'] || '';
        const currentDedupKey = buildStoryFingerprint(latest);
        const savedDedupKey = getSavedDedupKey();

        if (headline && currentDedupKey !== savedDedupKey) {
          addLog(`🆕 New story detected: "${headline}"`);
          setStoryData(latest);

          const imgUrl = latest['Image URL'] || '';
          addLog(`Waiting for image to load & render… (${imgUrl.substring(0, 60)}…)`);

          const img = await loadImageForRendering(imgUrl);
          addLog(`✅ Image loaded (${img.naturalWidth}×${img.naturalHeight})`);


          let crop = null;
          try {
            const smartcrop = (await import('smartcrop')).default;
            const result = await smartcrop.crop(img, {
              width: 1080,
              height: 1920,
              minScale: 1.0,
            });
            crop = result.topCrop;
          } catch {
            // fallback to center crop
          }

          let theme = DEFAULT_THEME;
          try {
            const ColorThief = (await import('colorthief')).default;
            const ct = new ColorThief();
            const dominant = ct.getColor(img);
            const palette = ct.getPalette(img, 6);
            theme = createTheme(dominant, palette);
          } catch {
            // fallback
          }

          await new Promise((r) => setTimeout(r, 3000));

          addLog('Auto-sending to Telegram…');
          await sendToTelegramRef.current(latest, img, crop, theme);
        } else {
          addLog('Checked sheet — no new story');
        }
      } catch (err) {
        addLog(`⚠ Poll failed: ${err?.message || 'Unknown error'}`);
      }

      const interval = getInterval();
      setNextCheckIn(Math.round(interval / 60000));
      timerId = setTimeout(poll, interval);
    };

    const startDelay = setTimeout(() => {
      const interval = getInterval();
      setNextCheckIn(Math.round(interval / 60000));
      poll();
    }, 30000);

    return () => {
      clearTimeout(startDelay);
      clearTimeout(timerId);
    };
  }, [autoEnabled, fontsReady, fetchLatestStory, addLog, setStoryData]);

  return {
    autoEnabled,
    setAutoEnabled,
    lastSentHeadline,
    lastSentAt,
    sending,
    sendStep,
    nextCheckIn,
    handleManualSend,
  };
}
