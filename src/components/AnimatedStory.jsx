import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  AbsoluteFill,
  Sequence,
} from 'remotion';

// ═══════════════════════════════════════════════════════
//  ANIMATED INSTAGRAM STORY — Remotion Composition
//
//  This recreates the static canvas story with cinematic
//  motion design: fade-ins, slide-ups, scale reveals,
//  Ken Burns zoom, glitch text, and staggered reveals.
//
//  Duration: 8 seconds @ 30fps = 240 frames
// ═══════════════════════════════════════════════════════

// ── Animation helpers ──
const fadeSlideUp = (frame, delay, duration = 15) => ({
  opacity: interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }),
  transform: `translateY(${interpolate(
    frame - delay,
    [0, duration],
    [40, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )}px)`,
});

const scaleIn = (frame, delay, fps, damping = 12) => {
  const s = spring({ frame: frame - delay, fps, config: { damping } });
  return {
    opacity: s,
    transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`,
  };
};

export const AnimatedStory = ({
  headline = '',
  summary = '',
  pollQuestion = '',
  pollOptions = '',
  imageUrl = '',
  theme = null,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Default theme fallback ──
  const t = theme || {
    primaryRgb: '0, 180, 255',
    accentRgb: '140, 80, 255',
    warmRgb: '255, 80, 60',
    coolRgb: '0, 180, 255',
  };

  // ── Ken Burns zoom ──
  const zoom = interpolate(frame, [0, 240], [1.0, 1.12], {
    extrapolateRight: 'clamp',
  });
  const panX = interpolate(frame, [0, 240], [0, -15], {
    extrapolateRight: 'clamp',
  });
  const panY = interpolate(frame, [0, 240], [0, -10], {
    extrapolateRight: 'clamp',
  });

  // ── Timeline (frame numbers @ 30fps) ──
  const T = {
    bgStart: 0,
    overlayStart: 5,
    cornerFrames: 10,
    accentBar: 15,
    badge: 22,
    date: 25,
    headlineStart: 30,
    headlineGlow: 45,
    divider: 55,
    cardReveal: 60,
    summaryText: 70,
    source: 90,
    dotGrid: 95,
    pollBadge: 110,
    pollQuestion: 118,
    pollZone: 135,
    branding: 150,
  };

  // ── Shared styles ──
  const fontDisplay = '"Bebas Neue", Impact, sans-serif';
  const fontBody = '"Poppins", "Segoe UI", sans-serif';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#050514',
        overflow: 'hidden',
      }}
    >
      {/* ══════════════════════════════════════
          1. BACKGROUND IMAGE — Ken Burns zoom
         ══════════════════════════════════════ */}
      <Sequence from={T.bgStart}>
        <AbsoluteFill
          style={{
            opacity: interpolate(frame, [0, 20], [0, 1], {
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {imageUrl && (
            <Img
              src={imageUrl}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
              }}
            />
          )}
        </AbsoluteFill>
      </Sequence>

      {/* ══════════════════════════════════════
          2. DARK OVERLAY — fades in
         ══════════════════════════════════════ */}
      <Sequence from={T.overlayStart}>
        <AbsoluteFill
          style={{
            background: `linear-gradient(
              to bottom,
              rgba(5, 5, 20, 0.78) 0%,
              rgba(5, 5, 20, 0.50) 22%,
              rgba(5, 5, 20, 0.12) 45%,
              rgba(5, 5, 20, 0.08) 62%,
              rgba(5, 5, 20, 0.40) 78%,
              rgba(5, 5, 20, 0.88) 100%
            )`,
            opacity: interpolate(frame - T.overlayStart, [0, 15], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        />
      </Sequence>

      {/* ══════════════════════════════════════
          3. FILM GRAIN OVERLAY (CSS noise)
         ══════════════════════════════════════ */}
      <AbsoluteFill
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          opacity: 0.5,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />

      {/* ══════════════════════════════════════
          4. CORNER FRAME ACCENTS — scale in
         ══════════════════════════════════════ */}
      <Sequence from={T.cornerFrames}>
        {['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map(
          (corner, i) => {
            const s = spring({
              frame: frame - T.cornerFrames - i * 3,
              fps,
              config: { damping: 15 },
            });
            const pos = {
              topLeft: { top: 45, left: 45, transformOrigin: 'top left' },
              topRight: { top: 45, right: 45, transformOrigin: 'top right' },
              bottomLeft: {
                bottom: 45,
                left: 45,
                transformOrigin: 'bottom left',
              },
              bottomRight: {
                bottom: 45,
                right: 45,
                transformOrigin: 'bottom right',
              },
            }[corner];

            const borderProp = {
              topLeft: {
                borderTop: `2px solid rgba(${t.primaryRgb}, 0.20)`,
                borderLeft: `2px solid rgba(${t.primaryRgb}, 0.20)`,
              },
              topRight: {
                borderTop: `2px solid rgba(${t.primaryRgb}, 0.20)`,
                borderRight: `2px solid rgba(${t.primaryRgb}, 0.20)`,
              },
              bottomLeft: {
                borderBottom: `2px solid rgba(${t.primaryRgb}, 0.20)`,
                borderLeft: `2px solid rgba(${t.primaryRgb}, 0.20)`,
              },
              bottomRight: {
                borderBottom: `2px solid rgba(${t.primaryRgb}, 0.20)`,
                borderRight: `2px solid rgba(${t.primaryRgb}, 0.20)`,
              },
            }[corner];

            return (
              <div
                key={corner}
                style={{
                  position: 'absolute',
                  width: 60,
                  height: 60,
                  ...pos,
                  ...borderProp,
                  opacity: s,
                  transform: `scale(${s})`,
                }}
              />
            );
          }
        )}
      </Sequence>

      {/* ══════════════════════════════════════
          5. STORY DOTS — fade in
         ══════════════════════════════════════ */}
      <Sequence from={T.accentBar - 5}>
        <div
          style={{
            position: 'absolute',
            top: 220,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            ...fadeSlideUp(frame, T.accentBar - 5, 10),
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: i === 0 ? 10 : 6,
                height: i === 0 ? 10 : 6,
                borderRadius: '50%',
                backgroundColor:
                  i === 0
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          6. ACCENT BAR — wipe in from left
         ══════════════════════════════════════ */}
      <Sequence from={T.accentBar}>
        <div
          style={{
            position: 'absolute',
            top: 250,
            left: 70,
            right: 70,
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(90deg, rgba(${t.primaryRgb}, 0.9), rgba(${t.accentRgb}, 0.9), rgba(${t.warmRgb}, 0.9))`,
            transformOrigin: 'left',
            transform: `scaleX(${interpolate(
              frame - T.accentBar,
              [0, 20],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )})`,
            boxShadow: `0 0 12px rgba(${t.primaryRgb}, 0.5)`,
          }}
        />
      </Sequence>

      {/* ══════════════════════════════════════
          7. TRENDING BADGE — spring in
         ══════════════════════════════════════ */}
      <Sequence from={T.badge}>
        <div
          style={{
            position: 'absolute',
            top: 268,
            left: 70,
            ...scaleIn(frame, T.badge, fps),
          }}
        >
          <div
            style={{
              background: `linear-gradient(90deg, rgba(${t.warmRgb}, 0.9), rgba(${t.accentRgb}, 0.9))`,
              borderRadius: 8,
              padding: '6px 14px',
              fontFamily: fontBody,
              fontWeight: 600,
              fontSize: 22,
              color: '#fff',
              boxShadow: `0 0 15px rgba(${t.warmRgb}, 0.3)`,
              whiteSpace: 'nowrap',
            }}
          >
            ⚡ TRENDING NEWS
          </div>
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          8. DATE — fade in right
         ══════════════════════════════════════ */}
      <Sequence from={T.date}>
        <div
          style={{
            position: 'absolute',
            top: 276,
            right: 70,
            fontFamily: fontBody,
            fontSize: 20,
            color: 'rgba(255,255,255,0.5)',
            ...fadeSlideUp(frame, T.date, 10),
          }}
        >
          {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          9. HEADLINE — word-by-word reveal
         ══════════════════════════════════════ */}
      <Sequence from={T.headlineStart}>
        <div
          style={{
            position: 'absolute',
            top: 324,
            left: 70,
            right: 70,
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 80,
              color: '#fff',
              letterSpacing: 3,
              lineHeight: 1.05,
              textTransform: 'uppercase',
              textShadow: `0 0 25px rgba(${t.primaryRgb}, 0.4)`,
            }}
          >
            {headline.split(' ').map((word, i) => {
              const wordDelay = T.headlineStart + i * 4;
              const s = spring({
                frame: frame - wordDelay,
                fps,
                config: { damping: 14 },
              });
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    opacity: s,
                    transform: `translateY(${interpolate(
                      s,
                      [0, 1],
                      [30, 0]
                    )}px)`,
                    marginRight: '0.25em',
                    // First word gets extra glow
                    textShadow:
                      i === 0
                        ? `0 0 30px rgba(${t.primaryRgb}, 0.7), 0 2px 10px rgba(0,0,0,0.7)`
                        : '0 2px 10px rgba(0,0,0,0.7)',
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          10. GRADIENT DIVIDER — wipe in
         ══════════════════════════════════════ */}
      <Sequence from={T.divider}>
        <div
          style={{
            position: 'absolute',
            top: 540,
            left: 70,
            width: 250,
            height: 3,
            background: `linear-gradient(90deg, rgba(${t.primaryRgb}, 0.8), rgba(${t.primaryRgb}, 0))`,
            transformOrigin: 'left',
            transform: `scaleX(${interpolate(
              frame - T.divider,
              [0, 15],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
            )})`,
            boxShadow: `0 0 8px rgba(${t.primaryRgb}, 0.4)`,
          }}
        />
      </Sequence>

      {/* ══════════════════════════════════════
          11. GLASSMORPHISM SUMMARY CARD — slide up
         ══════════════════════════════════════ */}
      <Sequence from={T.cardReveal}>
        <div
          style={{
            position: 'absolute',
            top: 560,
            left: 65,
            right: 65,
            ...fadeSlideUp(frame, T.cardReveal, 20),
          }}
        >
          <div
            style={{
              background: `rgba(${t.primaryRgb}, 0.08)`,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 16,
              border: `1.5px solid rgba(${t.primaryRgb}, 0.20)`,
              padding: '20px 22px 20px 22px',
              position: 'relative',
              boxShadow: `0 0 6px rgba(${t.primaryRgb}, 0.15)`,
            }}
          >
            {/* Left accent bar */}
            <div
              style={{
                position: 'absolute',
                left: 3,
                top: 10,
                bottom: 10,
                width: 4,
                borderRadius: 2,
                background: `rgba(${t.primaryRgb}, 0.7)`,
                boxShadow: `0 0 6px rgba(${t.primaryRgb}, 0.4)`,
              }}
            />

            {/* Summary text — line by line reveal */}
            <div
              style={{
                marginLeft: 15,
                fontFamily: fontBody,
                fontSize: 34,
                lineHeight: 1.42,
                color: 'rgba(230, 235, 245, 0.95)',
                textShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              {summary.split('. ').map((sentence, i) => {
                const sentenceDelay = T.summaryText + i * 8;
                return (
                  <span
                    key={i}
                    style={{
                      display: 'inline',
                      opacity: interpolate(
                        frame - sentenceDelay,
                        [0, 12],
                        [0, 1],
                        {
                          extrapolateLeft: 'clamp',
                          extrapolateRight: 'clamp',
                        }
                      ),
                    }}
                  >
                    {sentence}
                    {i < summary.split('. ').length - 1 ? '. ' : ''}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Source attribution */}
          <div
            style={{
              marginTop: 10,
              marginLeft: 22,
              fontFamily: fontBody,
              fontStyle: 'italic',
              fontSize: 20,
              color: 'rgba(255,255,255,0.3)',
              ...fadeSlideUp(frame, T.source, 10),
            }}
          >
            Source: AI-curated news feed
          </div>
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          12. DECORATIVE DOT GRID — fade in
         ══════════════════════════════════════ */}
      <Sequence from={T.dotGrid}>
        <div
          style={{
            position: 'absolute',
            top: 980,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity: interpolate(frame - T.dotGrid, [0, 20], [0, 0.5], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 35px)',
              gap: 0,
            }}
          >
            {Array.from({ length: 30 }).map((_, i) => {
              const row = Math.floor(i / 6);
              const col = i % 6;
              const dist = Math.sqrt(
                Math.pow((col - 2.5) / 6, 2) +
                  Math.pow((row - 2) / 5, 2)
              );
              const alpha = Math.max(0.03, 0.12 - dist * 0.15);
              const dotDelay = T.dotGrid + i * 0.5;
              return (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: `rgba(${t.primaryRgb}, ${alpha})`,
                    margin: '15px auto',
                    opacity: interpolate(
                      frame - dotDelay,
                      [0, 10],
                      [0, 1],
                      {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      }
                    ),
                    transform: `scale(${interpolate(
                      frame - dotDelay,
                      [0, 10],
                      [0, 1],
                      {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      }
                    )})`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          13. POLL SECTION — badge + question
         ══════════════════════════════════════ */}
      {pollQuestion && (
        <>
          {/* Dark band behind poll */}
          <Sequence from={T.pollBadge - 5}>
            <div
              style={{
                position: 'absolute',
                top: 1140,
                left: 0,
                right: 0,
                height: 120,
                background: 'rgba(0,0,0,0.25)',
                opacity: interpolate(
                  frame - (T.pollBadge - 5),
                  [0, 10],
                  [0, 1],
                  {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }
                ),
              }}
            />
          </Sequence>

          {/* Poll badge */}
          <Sequence from={T.pollBadge}>
            <div
              style={{
                position: 'absolute',
                top: 1148,
                left: 70,
                ...scaleIn(frame, T.pollBadge, fps),
              }}
            >
              <div
                style={{
                  background: `rgba(${t.accentRgb}, 0.85)`,
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontFamily: fontBody,
                  fontWeight: 700,
                  fontSize: 18,
                  color: '#fff',
                  boxShadow: `0 0 10px rgba(${t.accentRgb}, 0.3)`,
                }}
              >
                📊 POLL
              </div>
            </div>
          </Sequence>

          {/* Poll question */}
          <Sequence from={T.pollQuestion}>
            <div
              style={{
                position: 'absolute',
                top: 1192,
                left: 70,
                right: 70,
                fontFamily: fontBody,
                fontWeight: 600,
                fontSize: 36,
                lineHeight: 1.28,
                color: '#fff',
                textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                ...fadeSlideUp(frame, T.pollQuestion, 15),
              }}
            >
              {pollQuestion}
            </div>
          </Sequence>
        </>
      )}

      {/* ══════════════════════════════════════
          14. POLL ZONE — dashed outline + label
         ══════════════════════════════════════ */}
      <Sequence from={T.pollZone}>
        <div
          style={{
            position: 'absolute',
            top: 1325,
            left: 130,
            right: 130,
            height: 260,
            border: `1.5px dashed rgba(${t.primaryRgb}, 0.10)`,
            borderRadius: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: interpolate(frame - T.pollZone, [0, 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {/* Pulsing hand icon */}
          <div
            style={{
              fontFamily: fontBody,
              fontWeight: 700,
              fontSize: 28,
              color: 'rgba(255,255,255,0.12)',
              transform: `scale(${interpolate(
                frame % 30,
                [0, 15, 30],
                [1, 1.1, 1]
              )})`,
            }}
          >
            👆 Tap to Vote
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 22,
              color: 'rgba(255,255,255,0.07)',
            }}
          >
            Add Instagram Poll Sticker Here
          </div>
        </div>
      </Sequence>

      {/* ══════════════════════════════════════
          15. BOTTOM BRANDING — fade in
         ══════════════════════════════════════ */}
      <Sequence from={T.branding}>
        <div
          style={{
            position: 'absolute',
            bottom: 292,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            ...fadeSlideUp(frame, T.branding, 15),
          }}
        >
          <div
            style={{
              width: 160,
              height: 1,
              background: `linear-gradient(90deg, transparent, rgba(${t.primaryRgb}, 0.20), transparent)`,
            }}
          />
          <div
            style={{
              fontFamily: fontBody,
              fontWeight: 500,
              fontSize: 18,
              color: 'rgba(255,255,255,0.20)',
            }}
          >
            HITAM AI &nbsp;•&nbsp; Powered by AI
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
