/**
 * @module renderer
 * Deep module — owns the render canvas. Draws the mirrored webcam
 * feed and the hand skeleton overlay. Callers pass landmarks in;
 * they never touch canvas context directly.
 *
 * Interface (small):
 *   createRenderer(canvasEl)  → Renderer
 *   renderer.draw(videoEl, handsResultList)
 *   renderer.resize(w, h)
 */

// ── Skeleton drawing config ──────────────────────────────────

/**
 * MediaPipe Hands connection pairs (landmark index pairs).
 * These define the lines drawn between joints.
 */
const CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
];

const STYLE = Object.freeze({
  bone:       '#6366F1',        // accent purple
  boneGlow:   'rgba(99, 102, 241, 0.25)',
  joint:      '#D97706',        // primary amber
  jointGlow:  'rgba(217, 119, 6, 0.4)',
  tip:        '#FFFFFF',
  tipGlow:    'rgba(255, 255, 255, 0.6)',
  lineWidth:   2.5,
  jointRadius: 4,
  tipRadius:   6,
});

// Finger tip indices (drawn larger / brighter)
const TIP_INDICES = new Set([4, 8, 12, 16, 20]);

// ── Private drawing helpers ──────────────────────────────────

/**
 * Draws the skeleton connections (bones) for one hand.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number}>} lm - Normalised landmarks
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 */
const drawBones = (ctx, lm, w, h) => {
  ctx.lineWidth   = STYLE.lineWidth;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  for (const [a, b] of CONNECTIONS) {
    const ax = lm[a].x * w;
    const ay = lm[a].y * h;
    const bx = lm[b].x * w;
    const by = lm[b].y * h;

    // Glowing outer stroke
    ctx.strokeStyle = STYLE.boneGlow;
    ctx.lineWidth   = STYLE.lineWidth * 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Crisp inner stroke
    ctx.strokeStyle = STYLE.bone;
    ctx.lineWidth   = STYLE.lineWidth;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
};

/**
 * Draws landmark dots (joints and tips) for one hand.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number}>} lm
 * @param {number} w
 * @param {number} h
 */
const drawJoints = (ctx, lm, w, h) => {
  lm.forEach((point, i) => {
    const x      = point.x * w;
    const y      = point.y * h;
    const isTip  = TIP_INDICES.has(i);
    const radius = isTip ? STYLE.tipRadius : STYLE.jointRadius;
    const color  = isTip ? STYLE.tip       : STYLE.joint;
    const glow   = isTip ? STYLE.tipGlow   : STYLE.jointGlow;

    // Outer glow
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Inner dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
};

/**
 * Draws dynamic visual feedback when thumb-index pinch zoom is active.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./gestures.js').PinchZoomState} pinchInfo
 * @param {number} w
 * @param {number} h
 * @param {number} currentZoom
 */
const drawPinchFeedback = (ctx, pinchInfo, w, h, currentZoom) => {
  if (!pinchInfo?.thumb || !pinchInfo?.index) return;

  const tx = (1 - pinchInfo.thumb.x) * w;
  const ty = pinchInfo.thumb.y * h;
  const ix = (1 - pinchInfo.index.x) * w;
  const iy = pinchInfo.index.y * h;

  const mx = (tx + ix) / 2;
  const my = (ty + iy) / 2;

  const isZoomIn = pinchInfo.delta > 0;
  const color    = isZoomIn ? '#22C55E' : '#F59E0B';
  const label    = isZoomIn ? '🔍 Zoom In (+)' : '🔍 Zoom Out (−)';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.setLineDash([4, 4]);
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;

  // Connecting laser
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(ix, iy);
  ctx.stroke();

  // Joint rings
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.arc(ix, iy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Floating pill badge
  ctx.font = 'bold 10px Inter, sans-serif';
  const badgeText = `${label} ${currentZoom.toFixed(1)}x`;
  const textW     = ctx.measureText(badgeText).width + 16;
  const textH     = 20;

  ctx.fillStyle   = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(mx - textW / 2, my - 16 - textH / 2, textW, textH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = '#FFFFFF';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, mx, my - 16);

  ctx.restore();
};

// ── Public interface ─────────────────────────────────────────

/**
 * @typedef {Object} Renderer
 * @property {(videoEl: HTMLVideoElement, multiHandLandmarks: Array, pinchInfo?: any) => void} draw
 * @property {(w: number, h: number) => void} resize
 * @property {(zoom: number) => void} setZoom
 * @property {() => number} getZoom
 * @property {() => number} getCurrentZoom
 * @property {(px: number, py: number) => {x:number, y:number}} transformPoint
 */

/**
 * Creates a renderer bound to a canvas element.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @returns {Renderer}
 */
export const createRenderer = (canvasEl) => {
  const ctx = canvasEl.getContext('2d');

  /** Target digital zoom level (1.0 to 3.0) */
  let targetZoom  = 1.0;

  /** Current animated zoom level */
  let currentZoom = 1.0;

  return {
    /**
     * Renders one frame: mirrored video + hand skeleton overlay with smooth zoom.
     *
     * @param {HTMLVideoElement} videoEl
     * @param {Array<Array<{x:number,y:number,z:number}>>} multiHandLandmarks
     * @param {any} [pinchInfo]
     */
    draw(videoEl, multiHandLandmarks = [], pinchInfo = null) {
      const { width: w, height: h } = canvasEl;

      // Smooth zoom lerp
      if (Math.abs(targetZoom - currentZoom) > 0.003) {
        currentZoom += (targetZoom - currentZoom) * 0.18;
      } else {
        currentZoom = targetZoom;
      }

      // Clear frame
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      ctx.save();

      // Apply digital zoom around center
      if (currentZoom !== 1.0) {
        ctx.translate(cx, cy);
        ctx.scale(currentZoom, currentZoom);
        ctx.translate(-cx, -cy);
      }

      // Draw mirrored webcam feed
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, 0, 0, w, h);
      ctx.restore();

      // Draw skeleton for each detected hand inside zoom context
      for (const landmarks of multiHandLandmarks) {
        // Mirror x-coordinates to match the flipped video
        const mirrored = landmarks.map((lm) => ({ ...lm, x: 1 - lm.x }));
        drawBones(ctx, mirrored, w, h);
        drawJoints(ctx, mirrored, w, h);
      }

      // Draw pinch zoom feedback if active
      if (pinchInfo && Math.abs(pinchInfo.delta) > 0.003) {
        drawPinchFeedback(ctx, pinchInfo, w, h, currentZoom);
      }

      ctx.restore();
    },

    /**
     * Sets target zoom level (clamped between 1.0x and 3.0x).
     *
     * @param {number} zoom
     */
    setZoom(zoom) {
      targetZoom = Math.min(3.0, Math.max(1.0, zoom));
    },

    /** Returns target zoom setting. */
    getZoom: () => targetZoom,

    /** Returns current interpolated zoom level. */
    getCurrentZoom: () => currentZoom,

    /**
     * Maps an unzoomed pixel point to zoomed canvas space.
     *
     * @param {number} px
     * @param {number} py
     * @returns {{ x: number, y: number }}
     */
    transformPoint(px, py) {
      const cx = canvasEl.width / 2;
      const cy = canvasEl.height / 2;
      return {
        x: cx + (px - cx) * currentZoom,
        y: cy + (py - cy) * currentZoom,
      };
    },

    /**
     * Updates canvas resolution. Call when the container resizes.
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
