import { useState, useCallback, useRef } from 'react';
import { renderAnimatedFrame } from '../utils/renderAnimatedFrame';

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
    (data, img, crop, theme, onProgress) => {
      return new Promise(async (resolve, reject) => {
        try {
          // Convert HTMLImageElement → ImageBitmap (transferable)
          const bitmap = await createImageBitmap(img);

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
              },
            },
            [bitmap] // Transfer ownership
          );
        } catch (err) {
          reject(err);
        }
      });
    },
    []
  );

  // ── Generate MP4 on main thread (fallback) ──
  const generateMp4Blob = useCallback(
    async (data, img, crop, theme, onProgress) => {
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('WebCodecs not supported');
      }

      const totalFrames = 240;
      const fps = 30;
      const W = 1080;
      const H = 1920;

      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d');

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
            width: W,
            height: H,
            bitrate: 6_000_000,
            framerate: fps,
            hardwareAcceleration: 'prefer-software',
          });
          if (support.supported) {
            selectedCodec = c;
            break;
          }
        } catch (e) {
          // try next
        }
      }

      if (!selectedCodec) {
        throw new Error('No supported H.264 codec');
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory',
      });

      let encoderError = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encoderError = e; },
      });

      encoder.configure({
        codec: selectedCodec.codec,
        width: W,
        height: H,
        bitrate: 6_000_000,
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
          ctx: offCtx,
          img,
          cropRect: crop,
          storyData: data,
          theme,
          frame: i,
          fps,
        });

        const videoFrame = new VideoFrame(offscreen, {
          timestamp: i * (1_000_000 / fps),
          duration: 1_000_000 / fps,
        });

        encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
        videoFrame.close();

        if (onProgress) onProgress(Math.round(((i + 1) / totalFrames) * 100));

        if (i % 5 === 0) {
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
    async (data, img, crop, theme, onProgress) => {
      // Try Web Worker first (keeps UI responsive)
      const canUseWorker =
        typeof Worker !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined' &&
        typeof VideoEncoder !== 'undefined';

      if (canUseWorker) {
        try {
          return await generateMp4ViaWorker(data, img, crop, theme, onProgress);
        } catch (err) {
          console.warn('Worker encoding failed, falling back to main thread:', err.message);
          // Fall through to main thread
        }
      }

      return generateMp4Blob(data, img, crop, theme, onProgress);
    },
    [generateMp4ViaWorker, generateMp4Blob]
  );

  // ── Download PNG ──
  const handleDownloadPng = useCallback(() => {
    if (!canvasRef.current) return;
    const dataURL = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'hitam-ai-story.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
