/**
 * @module effects
 * Deep module — owns the FX canvas and all particle animations.
 * Callers trigger named effects; internal simulation is hidden.
 *
 * Interface (small):
 *   createFxEngine(canvasEl)  → FxEngine
 *   engine.trigger(effectName, x?, y?)
 *   engine.tick()   (call every animation frame)
 *   engine.resize(w, h)
 */

// ── Particle factory helpers ─────────────────────────────────

/**
 * Returns a random float between min and max.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const rand = (min, max) => Math.random() * (max - min) + min;

/**
 * Creates a floating heart particle.
 *
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Object} particle state
 */
const makeHeart = (canvasW, canvasH) => ({
  type:     'heart',
  x:        rand(canvasW * 0.2, canvasW * 0.8),
  y:        canvasH,
  vx:       rand(-0.8, 0.8),
  vy:       rand(-3.5, -2),
  size:     rand(18, 38),
  alpha:    1,
  decay:    rand(0.012, 0.02),
  wobble:   rand(0, Math.PI * 2),
  wobbleSpeed: rand(0.03, 0.07),
  hue:      rand(330, 360),   // pink/red range
});

/**
 * Creates a confetti piece.
 *
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {{ x?: number, y?: number }} origin
 * @returns {Object} particle state
 */
const makeConfetti = (canvasW, canvasH, origin = {}) => ({
  type:    'confetti',
  x:       origin.x ?? rand(canvasW * 0.3, canvasW * 0.7),
  y:       origin.y ?? canvasH * 0.4,
  vx:      rand(-6, 6),
  vy:      rand(-10, -4),
  size:    rand(6, 14),
  alpha:   1,
  decay:   rand(0.015, 0.025),
  rotation: rand(0, Math.PI * 2),
  rotSpeed: rand(-0.15, 0.15),
  gravity:  0.3,
  color:   `hsl(${rand(0, 360)}, 90%, 65%)`,
});

// ── Private drawing functions ────────────────────────────────

/**
 * Draws a heart shape centred at (x, y).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
const drawHeart = (ctx, x, y, size) => {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.4);
  ctx.bezierCurveTo(x, y - s * 0.2, x - s, y - s * 0.2, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.5, x, y + s * 0.9, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.9, x + s, y + s * 0.5, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.2, x, y - s * 0.2, x, y + s * 0.4);
  ctx.fill();
};

/**
 * Draws a confetti rectangle.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} p - Particle state
 */
const drawConfetti = (ctx, p) => {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillStyle = p.color;
  ctx.globalAlpha = p.alpha;
  ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  ctx.restore();
};

// ── Particle update functions ────────────────────────────────

/**
 * Advances a heart particle by one frame.
 *
 * @param {Object} p - Mutable particle state
 */
const tickHeart = (p) => {
  p.wobble += p.wobbleSpeed;
  p.x      += p.vx + Math.sin(p.wobble) * 0.8;
  p.y      += p.vy;
  p.alpha  -= p.decay;
  p.vy     *= 0.99;
};

/**
 * Advances a confetti particle by one frame.
 *
 * @param {Object} p - Mutable particle state
 */
const tickConfetti = (p) => {
  p.vy       += p.gravity;
  p.x        += p.vx;
  p.y        += p.vy;
  p.rotation += p.rotSpeed;
  p.alpha    -= p.decay;
};

// ── Effect spawners (burst factories) ────────────────────────

/**
 * Spawns a burst of heart particles.
 *
 * @param {number} w
 * @param {number} h
 * @param {number} count
 * @returns {Array<Object>}
 */
const spawnHearts = (w, h, count = 12) =>
  Array.from({ length: count }, () => makeHeart(w, h));

/**
 * Spawns a confetti explosion.
 *
 * @param {number} w
 * @param {number} h
 * @param {{ x?: number, y?: number }} origin
 * @param {number} count
 * @returns {Array<Object>}
 */
const spawnConfetti = (w, h, origin, count = 60) =>
  Array.from({ length: count }, () => makeConfetti(w, h, origin));

// ── Public interface ─────────────────────────────────────────

/**
 * @typedef {Object} FxEngine
 * @property {(effectName: string, x?: number, y?: number) => void} trigger
 * @property {() => void} tick
 * @property {(w: number, h: number) => void} resize
 */

/**
 * Creates an FX engine bound to a canvas element.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @returns {FxEngine}
 */
export const createFxEngine = (canvasEl) => {
  const ctx = canvasEl.getContext('2d');

  /** @type {Array<Object>} */
  let particles = [];

  return {
    /**
     * Triggers a named visual effect.
     *
     * @param {'love'|'confetti'} effectName
     * @param {number} [x] - Origin X (optional, defaults to centre)
     * @param {number} [y] - Origin Y (optional, defaults to centre)
     */
    trigger(effectName, x, y) {
      const w = canvasEl.width;
      const h = canvasEl.height;

      switch (effectName) {
        case 'love':
          particles.push(...spawnHearts(w, h, 14));
          break;

        case 'confetti':
          particles.push(...spawnConfetti(w, h, { x, y }, 70));
          break;

        default:
          // Unknown effects are silently ignored — no throw in animation loop
          break;
      }
    },

    /**
     * Advances simulation and redraws all particles.
     * Call once per requestAnimationFrame.
     */
    tick() {
      const { width: w, height: h } = canvasEl;
      ctx.clearRect(0, 0, w, h);

      // Remove dead particles (no mutations — filter returns new array)
      particles = particles.filter((p) => p.alpha > 0);

      for (const p of particles) {
        ctx.globalAlpha = Math.max(p.alpha, 0);

        if (p.type === 'heart') {
          tickHeart(p);
          ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
          drawHeart(ctx, p.x, p.y, p.size);

        } else if (p.type === 'confetti') {
          tickConfetti(p);
          drawConfetti(ctx, p);
        }
      }

      // Reset globalAlpha so subsequent canvas ops aren't affected
      ctx.globalAlpha = 1;
    },

    /**
     * Updates canvas resolution.
     *
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
      canvasEl.width  = w;
      canvasEl.height = h;
    },
  };
};
