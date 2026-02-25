import React, { useRef, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { renderAnimatedFrame } from '../utils/renderAnimatedFrame';
import { DEFAULT_THEME } from '../utils/theme';

// ═══════════════════════════════════════════════════════
//  ANIMATED INSTAGRAM STORY — Remotion Composition
//
//  Canvas-based: delegates ALL rendering to the single
//  source of truth — renderAnimatedFrame.js.
//
//  The same function powers:
//    • This Remotion Player preview
//    • The static canvas (at frame = TOTAL_FRAMES - 1)
//    • The MP4 video export pipeline
//
//  Duration: 8 seconds @ 30fps = 240 frames
// ═══════════════════════════════════════════════════════

export const AnimatedStory = ({
  storyData,
  theme,
  img,        // HTMLImageElement (pre-loaded by parent)
  cropRect,   // smartcrop result from parent
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !img) return;
    const ctx = canvasRef.current.getContext('2d');
    renderAnimatedFrame({
      ctx,
      img,
      cropRect,
      storyData,
      theme: theme || DEFAULT_THEME,
      frame,
      fps,
    });
  }, [frame, img, cropRect, storyData, theme, fps]);

  return (
    <canvas
      ref={canvasRef}
      width={1080}
      height={1920}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
