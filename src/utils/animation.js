// ═══════════════════════════════════════════════════════════════
//  Lightweight replacements for Remotion's interpolate & spring.
//
//  These are pure math functions — no DOM, no React, no Remotion.
//  Replaces the entire `remotion` core package (~150KB) with ~60 lines.
// ═══════════════════════════════════════════════════════════════

/**
 * Linear interpolation with clamping (replaces Remotion's interpolate).
 *
 * Maps `value` from `inputRange` to `outputRange` with linear segments.
 * Supports extrapolateLeft/extrapolateRight: 'clamp' | 'extend' (default: 'extend').
 */
export function interpolate(value, inputRange, outputRange, options = {}) {
  const { extrapolateLeft = 'extend', extrapolateRight = 'extend' } = options;

  // Find the segment
  let i = 1;
  while (i < inputRange.length - 1 && inputRange[i] < value) i++;

  const inMin = inputRange[i - 1];
  const inMax = inputRange[i];
  const outMin = outputRange[i - 1];
  const outMax = outputRange[i];

  // Clamp input if requested
  let v = value;
  if (v < inputRange[0]) {
    if (extrapolateLeft === 'clamp') return outputRange[0];
    v = value; // extend
  }
  if (v > inputRange[inputRange.length - 1]) {
    if (extrapolateRight === 'clamp') return outputRange[outputRange.length - 1];
    v = value; // extend
  }

  // Linear map
  if (inMax === inMin) return outMin;
  const t = (v - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/**
 * Spring physics simulation (replaces Remotion's spring).
 *
 * Returns a value from 0 → ~1 that follows a damped spring curve.
 * Config: { damping, mass, stiffness } — same API as Remotion.
 */
export function spring({ frame, fps = 30, config = {} }) {
  const {
    damping = 10,
    mass = 1,
    stiffness = 100,
  } = config;

  if (frame < 0) return 0;

  // Simulate spring with Euler integration
  const dt = 1 / fps;
  let position = 0;
  let velocity = 0;
  const target = 1;

  const steps = Math.ceil(frame);
  for (let i = 0; i < steps; i++) {
    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;

    velocity += acceleration * dt;
    position += velocity * dt;
  }

  // Fractional frame interpolation
  const frac = frame - Math.floor(frame);
  if (frac > 0 && steps > 0) {
    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt * frac;
    position += velocity * dt * frac;
  }

  // Clamp to avoid overshoot past reasonable bounds
  return Math.max(0, position);
}
