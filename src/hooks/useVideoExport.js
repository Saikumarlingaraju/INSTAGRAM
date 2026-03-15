import { useState, useCallback, useRef } from 'react';
import { renderAnimatedFrame } from '../utils/renderAnimatedFrame';

const FULL_W = 1080;
const FULL_H = 1920;
const DEFAULT_TOTAL_FRAMES = 240;
const DEFAULT_FPS = 30;

const ENCODE_PROFILES = {
  default: {
    outputWidth: FULL_W,
    outputHeight: FULL_H,
    bitrate: 6_000_000,
    fps: DEFAULT_FPS,
    totalFrames: DEFAULT_TOTAL_FRAMES,
  },
  telegram: {
    // Keep under Vercel body limits for /api/send-telegram multipart uploads.
    outputWidth: 540,
    outputHeight: 960,
    bitrate: 2_200_000,
    fps: DEFAULT_FPS,
    totalFrames: DEFAULT_TOTAL_FRAMES,
  },
  telegram_fallback: {
    // Emergency fallback for stricter payload/body limits.
    outputWidth: 432,
    outputHeight: 768,
    bitrate: 1_300_000,
    fps: DEFAULT_FPS,
    totalFrames: DEFAULT_TOTAL_FRAMES,
  },
};

function resolveEncodeOptions(options = {}) {
  const profile = options.profile || 'default';
  const base = ENCODE_PROFILES[profile] || ENCODE_PROFILES.default;
  return {
    outputWidth: options.outputWidth || base.outputWidth,
    outputHeight: options.outputHeight || base.outputHeight,
    bitrate: options.bitrate || base.bitrate,
    fps: options.fps || base.fps,
    totalFrames: options.totalFrames || base.totalFrames,
  };
}

// ═══════════════════════════════════════════════════════
//  useVideoExport — PNG blob, MP4 blob, download handlers
//
//  Prefers Web Worker + OffscreenCanvas for MP4 encoding.
//  Falls back to main-thread encoding if workers unavailable.
// ═══════════════════════════════════════════════════════
export function useVideoExport(canvasRef) {
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const workerRef = useRef(null);

  // ── Generate PNG Blob from canvas ──
  const generatePngBlob = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!canvasRef.current) return reject(new Error('Canvas not ready'));
      canvasRef.current.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/png'
      );
    });
  }, [canvasRef]);

  // ── Generate MP4 via Web Worker (preferred) ──
  const generateMp4ViaWorker = useCallback(
    (data, img, crop, theme, onProgress, encodeOptions = {}) => {
      return new Promise((resolve, reject) => {
        (async () => {
          // Convert HTMLImageElement → ImageBitmap (transferable)
          const bitmap = await createImageBitmap(img);
          const settings = resolveEncodeOptions(encodeOptions);

          const worker = new Worker(
            new URL('../workers/videoExport.worker.js', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;

          worker.onmessage = (e) => {
            const { type, percent, blob, message } = e.data;
            if (type === 'progress') {
              if (onProgress) onProgress(percent);
            } else if (type === 'done') {
              worker.terminate();
              workerRef.current = null;
              resolve(blob);
            } else if (type === 'error') {
              worker.terminate();
              workerRef.current = null;
              reject(new Error(message));
            }
          };

          worker.onerror = (err) => {
            worker.terminate();
            workerRef.current = null;
            reject(new Error(err.message || 'Worker error'));
          };

          worker.postMessage(
            {
              type: 'encode',
              payload: {
                imageBitmap: bitmap,
                cropRect: crop,
                storyData: data,
                theme,
                encodeOptions: settings,
              },
            },
            [bitmap] // Transfer ownership
          );
        })().catch(reject);
      });
    },
    []
  );

  // ── Generate MP4 on main thread (fallback) ──
  const generateMp4Blob = useCallback(
    async (data, img, crop, theme, onProgress, encodeOptions = {}) => {
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('WebCodecs not supported');
      }

      const settings = resolveEncodeOptions(encodeOptions);
      const {
        outputWidth,
        outputHeight,
        bitrate,
        fps,
        totalFrames,
      } = settings;

      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = FULL_W;
      renderCanvas.height = FULL_H;
      const renderCtx = renderCanvas.getContext('2d');

      const encodeCanvas = document.createElement('canvas');
      encodeCanvas.width = outputWidth;
      encodeCanvas.height = outputHeight;
      const encodeCtx = encodeCanvas.getContext('2d');

      // Find working codec
      const codecs = [
        { codec: 'avc1.4d0032', label: 'AVC Main L5.0' },
        { codec: 'avc1.42003e', label: 'AVC Baseline L6.2' },
        { codec: 'avc1.42001f', label: 'AVC Baseline L3.1' },
        { codec: 'avc1.640032', label: 'AVC High L5.0' },
      ];

      let selectedCodec = null;
      for (const c of codecs) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec: c.codec,
            width: outputWidth,
            height: outputHeight,
            bitrate,
            framerate: fps,
            hardwareAcceleration: 'prefer-software',
          });
          if (support.supported) {
            selectedCodec = c;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!selectedCodec) {
        throw new Error('No supported H.264 codec');
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width: outputWidth, height: outputHeight },
        fastStart: 'in-memory',
      });

      let encoderError = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encoderError = e; },
      });

      encoder.configure({
        codec: selectedCodec.codec,
        width: outputWidth,
        height: outputHeight,
        bitrate,
        framerate: fps,
        hardwareAcceleration: 'prefer-software',
      });

      await new Promise((r) => setTimeout(r, 50));
      if (encoder.state === 'closed' || encoderError) {
        throw new Error(encoderError?.message || 'Encoder closed after configure');
      }

      for (let i = 0; i < totalFrames; i++) {
        if (encoder.state === 'closed') {
          throw new Error('Encoder closed at frame ' + i);
        }

        renderAnimatedFrame({
          ctx: renderCtx,
          img,
          cropRect: crop,
          storyData: data,
          theme,
          frame: i,
          fps,
        });

        if (outputWidth !== FULL_W || outputHeight !== FULL_H) {
          encodeCtx.clearRect(0, 0, outputWidth, outputHeight);
          encodeCtx.drawImage(renderCanvas, 0, 0, outputWidth, outputHeight);
        } else {
          encodeCtx.clearRect(0, 0, outputWidth, outputHeight);
          encodeCtx.drawImage(renderCanvas, 0, 0);
        }

        const videoFrame = new VideoFrame(encodeCanvas, {
          timestamp: i * (1_000_000 / fps),
          duration: 1_000_000 / fps,
        });

        encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
        videoFrame.close();

        if (onProgress) onProgress(Math.round(((i + 1) / totalFrames) * 100));

        // Drain encoder queue + yield to UI
        if (i % 5 === 0 || encoder.encodeQueueSize > 5) {
          while (encoder.encodeQueueSize > 5) {
            await new Promise((r) => setTimeout(r, 1));
          }
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();

      return new Blob([target.buffer], { type: 'video/mp4' });
    },
    []
  );

  // ── Smart MP4 generation: prefer worker, fall back to main thread ──
  const generateMp4 = useCallback(
    async (data, img, crop, theme, onProgress, encodeOptions = {}) => {
      // Try Web Worker first (keeps UI responsive)
      const canUseWorker =
        typeof Worker !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined' &&
        typeof VideoEncoder !== 'undefined';

      if (canUseWorker) {
        try {
          return await generateMp4ViaWorker(data, img, crop, theme, onProgress, encodeOptions);
        } catch (err) {
          console.warn('Worker encoding failed, falling back to main thread:', err.message);
          // Fall through to main thread
        }
      }

      return generateMp4Blob(data, img, crop, theme, onProgress, encodeOptions);
    },
    [generateMp4ViaWorker, generateMp4Blob]
  );

  // ── Download PNG ──
  const handleDownloadPng = useCallback(() => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'hitam-ai-story.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [canvasRef]);

  // ── Download MP4 ──
  const handleDownloadVideo = useCallback(
    async (storyData, loadedImage, smartcropRect, colorTheme) => {
      if (!storyData || !loadedImage || recording) return;

      if (typeof VideoEncoder === 'undefined') {
        alert('Your browser does not support WebCodecs (VideoEncoder).\nPlease use Chrome 94+ or Edge 94+.');
        return;
      }

      setRecording(true);
      setRecordProgress(0);

      try {
        const blob = await generateMp4(
          storyData,
          loadedImage,
          smartcropRect,
          colorTheme,
          (p) => setRecordProgress(p)
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hitam-ai-story.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ MP4 exported successfully');
      } catch (err) {
        console.error('Video export failed:', err);
        alert('Video export failed: ' + err.message);
      } finally {
        setRecording(false);
        setRecordProgress(0);
      }
    },
    [recording, generateMp4]
  );

  return {
    recording,
    recordProgress,
    setRecording,
    setRecordProgress,
    generatePngBlob,
    generateMp4Blob: generateMp4, // Smart: worker → main thread fallback
    handleDownloadPng,
    handleDownloadVideo,
  };
}
