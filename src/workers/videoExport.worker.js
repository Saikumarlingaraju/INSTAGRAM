// ═══════════════════════════════════════════════════════════════
//  videoExport.worker.js — Off-main-thread MP4 rendering
//
//  Uses OffscreenCanvas + WebCodecs VideoEncoder + mp4-muxer.
//  The main thread sends the image bitmap and story data,
//  this worker renders all 240 frames and returns the MP4 blob.
// ═══════════════════════════════════════════════════════════════

import { renderAnimatedFrame } from '../utils/renderAnimatedFrame';

const CODECS = [
  { codec: 'avc1.4d0032', label: 'AVC Main L5.0' },
  { codec: 'avc1.42003e', label: 'AVC Baseline L6.2' },
  { codec: 'avc1.42001f', label: 'AVC Baseline L3.1' },
  { codec: 'avc1.640032', label: 'AVC High L5.0' },
];

async function encodeVideo({ imageBitmap, cropRect, storyData, theme }) {
  const totalFrames = 240;
  const fps = 30;
  const W = 1080;
  const H = 1920;

  // Use OffscreenCanvas (no DOM dependency)
  const offscreen = new OffscreenCanvas(W, H);
  const offCtx = offscreen.getContext('2d');

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  // Find working codec
  let selectedCodec = null;
  for (const c of CODECS) {
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
      img: imageBitmap,
      cropRect,
      storyData,
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

    // Drain encoder queue to prevent backpressure
    while (encoder.encodeQueueSize > 5) {
      await new Promise((r) => setTimeout(r, 1));
    }

    // Report progress every 5 frames
    if (i % 5 === 0) {
      self.postMessage({
        type: 'progress',
        percent: Math.round(((i + 1) / totalFrames) * 100),
      });
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ── Worker message handler ──
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'encode') {
    try {
      const blob = await encodeVideo(payload);
      self.postMessage({ type: 'done', blob });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
