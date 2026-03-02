import { useEffect, useState, useCallback, useRef } from 'react';
import { sendPhoto, sendVideo, sendPoll } from '../utils/telegram';
import { createTheme, DEFAULT_THEME } from '../utils/theme';
import { loadImageForRendering } from '../utils/loadImage';

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
  generatePngBlob,
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

      const caption = `🚀 *${headline}*\n\n📰 ${summary}`;

      try {
        // Step 1: Send PNG
        setSendStep('png');
        addLog('Sending static image to Telegram…');
        await new Promise((r) => setTimeout(r, 500));
        const pngBlob = await generatePngBlob();
        await sendPhoto(pngBlob, caption);
        addLog('✅ Static image sent');

        // Step 2: Send MP4
        setSendStep('mp4');
        addLog('Rendering & sending animated video…');
        setRecording(true);
        setRecordProgress(0);

        const mp4Blob = await generateMp4Blob(
          data, img, crop, theme,
          (p) => setRecordProgress(p)
        );

        setRecording(false);
        setRecordProgress(0);

        await sendVideo(mp4Blob, `🎬 *${headline}* — Animated Story`);
        addLog('✅ Animated video sent');

        // Step 3: Send Poll
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
        localStorage.setItem('hitam-ai-last-headline', headline);
        localStorage.setItem('hitam-ai-last-sent-at', new Date().toLocaleString());
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
    [generatePngBlob, generateMp4Blob, addLog, setRecording, setRecordProgress]
  );

  // Keep ref in sync
  sendToTelegramRef.current = sendToTelegram;

  // ── Manual send with dedup check ──
  const handleManualSend = useCallback(() => {
    if (!storyData || !loadedImage || sending) return;

    const currentHeadline = storyData['Headline'] || '';
    const alreadySent = localStorage.getItem('hitam-ai-last-headline');

    if (currentHeadline && currentHeadline === alreadySent) {
      addLog('⚠️ Already sent — check Telegram!');
      alert(
        `This story was already sent to Telegram!\n\n"${currentHeadline}"\n\nCheck your Telegram group — no need to send again.`
      );
      return;
    }

    sendToTelegram(storyData, loadedImage, smartcropRect, colorTheme);
  }, [storyData, loadedImage, smartcropRect, colorTheme, sending, sendToTelegram, addLog]);

  // ── Auto-polling — check Google Sheets for new data ──
  useEffect(() => {
    if (!autoEnabled || !fontsReady) return;

    const getInterval = () => {
      const now = new Date();
      const hour = now.getHours();
      const min = now.getMinutes();
      if (hour === 7 && min >= 50) return 2 * 60 * 1000;
      if (hour === 8 && min <= 20) return 2 * 60 * 1000;
      return 10 * 60 * 1000;
    };

    let timerId;

    const poll = async () => {
      try {
        const latest = await fetchLatestStory();
        const headline = latest['Headline'] || '';
        const savedHeadline = localStorage.getItem('hitam-ai-last-headline') || '';

        if (headline && headline !== savedHeadline) {
          addLog(`🆕 New story detected: "${headline}"`);
          setStoryData(latest);

          addLog('Waiting for image to load & render…');

          const img = await loadImageForRendering(latest['Image URL']);

          let crop = null;
          try {
            const smartcrop = (await import('smartcrop')).default;
            const result = await smartcrop.crop(img, {
              width: 1080,
              height: 1920,
              minScale: 1.0,
            });
            crop = result.topCrop;
          } catch (e) {
            // fallback to center crop
          }

          let theme = DEFAULT_THEME;
          try {
            const ColorThief = (await import('colorthief')).default;
            const ct = new ColorThief();
            const dominant = ct.getColor(img);
            const palette = ct.getPalette(img, 6);
            theme = createTheme(dominant, palette);
          } catch (e) {
            // fallback
          }

          await new Promise((r) => setTimeout(r, 3000));

          localStorage.setItem('hitam-ai-last-headline', headline);
          setLastSentHeadline(headline);

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
