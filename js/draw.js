/**
 * @module draw
 * Deep module — persistent fingertip drawing engine.
 *
 * Owns the draw canvas (separate from render + fx canvases so strokes
 * persist across frames). Callers provide normalised fingertip
 * coordinates; internal brush state and glow rendering are hidden.
 *
 * Interface (small):
 *   createDrawEngine(canvasEl)  → DrawEngine
 *   engine.update(x, y)        — draw stroke to this normalised point
 *   engine.lift()              — pen-up (gap in stroke)
 *   engine.setBrush(preset)    — 'fine' | 'medium' | 'bold'
 *   engine.clear()             — wipe canvas
 *   engine.resize(w, h)        — sync canvas size
 */

// ── Brush presets ────────────────────────────────────────────

/**
 * @typedef {{ color: string, glow: string, size: number, alpha: number }} BrushPreset
 */

/** @type {Record<string, BrushPreset>} */
const BRUSHES = Object.freeze({
  fine:   { color: '#FFFFFF',   glow: 'rgba(255,255,255,0.5)', size: 3,  alpha: 0.9 },
  medium: { color: '#22D3EE',   glow: 'rgba(34,211,238,0.5)',  size: 7,  alpha: 0.85 },
  bold:   { color: '#EC4899',   glow: 'rgba(236,72,153,0.5)',  size: 14, alpha: 0.8 },
});

// ── Private stroke renderer ──────────────────────────────────

/**
 * Renders a single stroke segment from (ax, ay) to (bx, by).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {BrushPreset}             brush
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 */
const renderStroke = (ctx, brush, ax, ay, bx, by) => {
  ctx.globalAlpha        = brush.alpha;
  ctx.lineWidth          = brush.size;
  ctx.lineCap            = 'round';
  ctx.lineJoin           = 'round';
  ctx.shadowColor        = brush.glow;
  ctx.shadowBlur         = brush.size * 2.5;
  ctx.strokeStyle        = brush.color;

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
};

// ── Public interface ─────────────────────────────────────────

/**
 * @typedef {Object} DrawEngine
 * @property {(nx: number, ny: number) => void} update
 * @property {() => void}                       lift
 * @property {(preset: string) => void}         setBrush
 * @property {() => void}                       clear
 * @property {(w: number, h: number) => void}   resize
 */

/**
 * Creates a draw engine bound to a persistent canvas.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @returns {DrawEngine}
 */
export const createDrawEngine = (canvasEl) => {
  const ctx = canvasEl.getContext('2d');

  /** @type {BrushPreset} */
  let brush = BRUSHES.medium;

  /** @type {number | null} Last X in canvas pixels */
  let lastX = null;

  /** @type {number | null} Last Y in canvas pixels */
  let lastY = null;

  return {
    /**
     * Moves the brush to a new normalised (0–1) position and draws
     * a stroke if the pen is already down. Mirrors x to match the
     * flipped video feed.
     *
     * @param {number} nx - Normalised x (0 = left, 1 = right)
     * @param {number} ny - Normalised y (0 = top, 1 = bottom)
     */
    update(nx, ny) {
      // Mirror x to match the canvas rendering in renderer.js
      const px = (1 - nx) * canvasEl.width;
      const py = ny * canvasEl.height;

      if (lastX !== null && lastY !== null) {
        renderStroke(ctx, brush, lastX, lastY, px, py);
      }

      lastX = px;
      lastY = py;
    },

    /**
     * Lifts the pen — next update() starts a new stroke segment.
     */
    lift() {
      lastX = null;
      lastY = null;
    },

    /**
     * Switches the active brush preset.
     *
     * @param {'fine'|'medium'|'bold'} preset
     */
    setBrush(preset) {
      brush = BRUSHES[preset] ?? BRUSHES.medium;
    },

    /** Wipes all strokes from the canvas. */
    clear() {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      lastX = null;
      lastY = null;
    },

    /**
     * Syncs canvas resolution to its new display size.
     * NOTE: resizing clears canvas content — call only when layout changes.
     *
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
      canvasEl.width  = w;
      canvasEl.height = h;
      lastX = null;
      lastY = null;
    },
  };
};
