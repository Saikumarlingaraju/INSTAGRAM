import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { renderAnimatedFrame } from './utils/renderAnimatedFrame';
import { TOTAL_FRAMES, FPS } from './utils/constants';

const BUILD_VERSION = `v5-${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'}`;

import { useStoryData } from './hooks/useStoryData';
import { useVideoExport } from './hooks/useVideoExport';
import { useAutoSend } from './hooks/useAutoSend';

// Lazy-load Remotion Player + AnimatedStory (only needed for animated mode)
const RemotionPlayer = lazy(() =>
  import('@remotion/player').then((m) => ({ default: m.Player }))
);
const AnimatedStory = lazy(() =>
  import('./components/AnimatedStory').then((m) => ({ default: m.AnimatedStory }))
);

// ═══════════════════════════════════════════════════════
//  INSTAGRAM STORY BUILDER — Main Component
//
//  All logic lives in dedicated hooks:
//    useStoryData   — fonts, CSV fetch, image processing
//    useVideoExport — PNG/MP4 generation + downloads
//    useAutoSend    — Telegram pipeline + auto-polling
// ═══════════════════════════════════════════════════════
export default function InstagramStoryBuilder() {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState('static');

  // Log build version on mount so we can verify deployed code
  useEffect(() => {
    console.log(`%c[HITAM AI] Build ${BUILD_VERSION}`, 'color: #0ff; font-weight: bold');
  }, []);

  // ── Hook 1: Data loading ──
  const {
    storyData,
    setStoryData,
    loading,
    error,
    fontsReady,
    colorTheme,
    loadedImage,
    smartcropRect,
    activityLog,
    addLog,
    fetchLatestStory,
  } = useStoryData();

  // ── Hook 2: Video export ──
  const {
    recording,
    recordProgress,
    setRecording,
    setRecordProgress,
    generatePngBlob,
    generateMp4Blob,
    handleDownloadPng,
    handleDownloadVideo,
  } = useVideoExport(canvasRef);

  // ── Hook 3: Telegram + auto-polling ──
  const {
    autoEnabled,
    setAutoEnabled,
    lastSentHeadline,
    lastSentAt,
    sending,
    sendStep,
    nextCheckIn,
    handleManualSend,
  } = useAutoSend({
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
  });

  // ══════════════════════════════════════════
  //  DRAW STATIC CANVAS — single source of truth
  // ══════════════════════════════════════════
  useEffect(() => {
    if (!loadedImage || !canvasRef.current || !fontsReady || !storyData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    renderAnimatedFrame({
      ctx,
      img: loadedImage,
      cropRect: smartcropRect,
      storyData,
      theme: colorTheme,
      frame: TOTAL_FRAMES - 1,
      fps: FPS,
    });
  }, [loadedImage, smartcropRect, storyData, colorTheme, fontsReady]);

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════
  if (loading || !fontsReady)
    return <div style={styles.centerBox}>Loading Fonts & Data…</div>;
  if (error)
    return (
      <div style={styles.centerBox}>
        <p style={{ color: 'red' }}>{error}</p>
      </div>
    );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', letterSpacing: '3px', fontSize: '28px' }}>
          AI Story Generator
        </h2>
        <p style={{ fontFamily: '"Poppins", sans-serif', fontSize: '13px', opacity: 0.5, marginTop: '4px' }}>
          Bebas Neue + Poppins • Color-themed • Smart-cropped • Animated
        </p>

        {/* ── Mode Toggle ── */}
        <div style={styles.toggleRow}>
          <button
            onClick={() => setMode('static')}
            aria-label="Static preview mode"
            aria-pressed={mode === 'static'}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'static' ? styles.toggleActive : {}),
            }}
          >
            📸 Static
          </button>
          <button
            onClick={() => setMode('animated')}
            aria-label="Animated preview mode"
            aria-pressed={mode === 'animated'}
            style={{
              ...styles.toggleBtn,
              ...(mode === 'animated' ? styles.toggleActive : {}),
            }}
          >
            🎬 Animated
          </button>
        </div>

        {/* ── Download Buttons ── */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {mode === 'static' && (
            <button onClick={handleDownloadPng} style={styles.button} aria-label="Download PNG image">
              ⬇️ Download PNG
            </button>
          )}
          {mode === 'animated' && (
            <button
              onClick={() => handleDownloadVideo(storyData, loadedImage, smartcropRect, colorTheme)}
              disabled={recording || !loadedImage}
              aria-label={recording ? `Rendering MP4 ${recordProgress}%` : 'Download MP4 video'}
              style={{
                ...styles.button,
                backgroundColor: recording ? '#555' : '#28a745',
                cursor: recording ? 'not-allowed' : 'pointer',
              }}
            >
              {recording
                ? `🔴 Rendering MP4… ${recordProgress}%`
                : '⬇️ Download MP4'}
            </button>
          )}

          {/* ── Manual Send to Telegram ── */}
          <button
            onClick={handleManualSend}
            disabled={sending || !loadedImage || recording}
            aria-label="Send story to Telegram"
            style={{
              ...styles.button,
              backgroundColor: sending ? '#555' : '#0088cc',
              cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending
              ? `📤 Sending ${sendStep}…`
              : '📤 Send to Telegram'}
          </button>
        </div>
      </div>

      {/* ══════ STATUS PANEL ══════ */}
      <div style={styles.statusPanel} role="status" aria-live="polite">
        <div style={styles.statusRow}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>
            🤖 Auto-mode
          </span>
          <button
            onClick={() => setAutoEnabled(!autoEnabled)}
            style={{
              ...styles.statusBadge,
              backgroundColor: autoEnabled ? '#28a74533' : '#dc354533',
              color: autoEnabled ? '#28a745' : '#dc3545',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {autoEnabled ? '● ACTIVE' : '○ OFF'}
          </button>
        </div>

        {autoEnabled && (
          <div style={styles.statusRow}>
            <span style={{ fontSize: '12px', opacity: 0.6 }}>
              Next check in ~{nextCheckIn} min
            </span>
          </div>
        )}

        {lastSentHeadline && (
          <div style={{ ...styles.statusRow, flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              Last sent: {lastSentAt}
            </span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>
              "{lastSentHeadline}"
            </span>
          </div>
        )}

        {activityLog.length > 0 && (
          <div style={styles.logContainer}>
            <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.5, marginBottom: '4px' }}>
              Activity Log <span style={{ fontFamily: 'monospace', fontSize: '9px', opacity: 0.5 }}>({BUILD_VERSION})</span>
            </span>
            {activityLog.map((entry) => (
              <div key={entry.id} style={styles.logEntry}>
                <span style={{ opacity: 0.3, fontSize: '10px', fontFamily: 'monospace' }}>
                  {entry.time}
                </span>
                <span style={{ fontSize: '11px' }}>{entry.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recording progress overlay */}
      {recording && (
        <div style={styles.progressBar} role="progressbar" aria-valuenow={recordProgress} aria-valuemin={0} aria-valuemax={100}>
          <div
            style={{
              ...styles.progressFill,
              width: `${recordProgress}%`,
            }}
          />
        </div>
      )}

      {/* ── Static Canvas Mode ── */}
      {mode === 'static' && (
        <div style={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            style={styles.canvas}
          />
        </div>
      )}

      {/* ── Animated Remotion Mode ── */}
      {mode === 'animated' && storyData && (
        <div style={styles.canvasWrapper}>
          <Suspense fallback={<div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>Loading player…</div>}>
            <RemotionPlayer
              component={AnimatedStory}
              inputProps={{
                storyData,
                theme: colorTheme,
                img: loadedImage,
                cropRect: smartcropRect,
              }}
              durationInFrames={240}
              compositionWidth={1080}
              compositionHeight={1920}
              fps={30}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                width: 1080,
                height: 1920,
                borderRadius: '4px',
              }}
              controls
              loop
              autoPlay
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'white',
    fontFamily: '"Poppins", sans-serif',
    padding: '20px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '20px',
  },
  button: {
    marginTop: '10px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: '"Poppins", sans-serif',
    color: '#fff',
    backgroundColor: '#007bff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    transition: 'background-color 0.2s',
  },
  canvasWrapper: {
    padding: '10px',
    backgroundColor: '#333',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  },
  canvas: {
    maxWidth: '90vw',
    maxHeight: '80vh',
    height: 'auto',
    display: 'block',
    borderRadius: '4px',
  },
  centerBox: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a1a',
    color: 'white',
    fontFamily: '"Poppins", sans-serif',
    fontSize: '24px',
  },
  toggleRow: {
    display: 'flex',
    gap: '4px',
    marginTop: '12px',
    backgroundColor: '#2a2a2a',
    borderRadius: '10px',
    padding: '4px',
  },
  toggleBtn: {
    padding: '8px 20px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '"Poppins", sans-serif',
    color: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleActive: {
    color: '#fff',
    backgroundColor: '#007bff',
    boxShadow: '0 2px 8px rgba(0,123,255,0.4)',
  },
  progressBar: {
    width: '300px',
    height: '6px',
    backgroundColor: '#333',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #28a745, #20c997)',
    borderRadius: '3px',
    transition: 'width 0.15s ease-out',
  },
  statusPanel: {
    width: '100%',
    maxWidth: '420px',
    marginTop: '16px',
    marginBottom: '12px',
    padding: '14px 16px',
    backgroundColor: '#222',
    borderRadius: '10px',
    border: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  logContainer: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '160px',
    overflowY: 'auto',
    borderTop: '1px solid #333',
    paddingTop: '8px',
    marginTop: '4px',
  },
  logEntry: {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
    padding: '2px 0',
  },
};
