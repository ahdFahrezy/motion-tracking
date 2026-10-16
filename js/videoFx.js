/**
 * @module videoFx
 * Deep module — real-time video filter effects and TikTok-style portal lens.
 *
 * Capabilities:
 *  - Full-frame or polygon-clipped portal effects
 *  - Pixel-level filters: negative, glitch, pixelate, grayscale, vintage, thermal, zoom
 *  - High-tech HUD portal frame with corner brackets and floating header
 *
 * Interface (small):
 *   applyPortalEffect(ctx, w, h, effectName, portal?, videoEl?) → void
 *   applyEffect(ctx, w, h, effectName) → void
 *   drawPortalFrame(ctx, portal, effectName) → void
 *   EFFECT_NAMES → readonly string[]
 */

// ── Reusable Offscreen Canvas ────────────────────────────────

let offscreenCanvas = null;
let offscreenCtx    = null;

/**
 * Returns a cached offscreen canvas sized to (w, h).
 * Avoids per-frame canvas allocation.
 *
 * @param {number} w
 * @param {number} h
 * @returns {{ offCanvas: HTMLCanvasElement, offCtx: CanvasRenderingContext2D }}
 */
const getOffscreen = (w, h) => {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx    = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (offscreenCanvas.width !== w || offscreenCanvas.height !== h) {
    offscreenCanvas.width  = w;
    offscreenCanvas.height = h;
  }
  return { offCanvas: offscreenCanvas, offCtx: offscreenCtx };
};

// ── Pixel-level effect implementations ──────────────────────

/**
 * Negative: invert all RGB channels.
 * @param {Uint8ClampedArray} data
 */
const negative = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i];     // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
  }
};

/**
 * Grayscale: luminance-weighted average.
 * @param {Uint8ClampedArray} data
 */
const grayscale = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = luma;
  }
};

/**
 * Vintage / Sepia: colour matrix transform + film grain noise.
 * @param {Uint8ClampedArray} data
 */
const vintage = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const noise = (Math.random() - 0.5) * 16;

    data[i]     = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189) + noise);
    data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168) + noise * 0.7);
    data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
  }
};

/**
 * Thermal: Predator heat-vision color gradient.
 * @param {Uint8ClampedArray} data
 */
const thermal = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    let r = 0, g = 0, b = 0;

    if (luma < 0.25) {
      const t = luma / 0.25;
      r = Math.floor(t * 70);
      g = 0;
      b = Math.floor(t * 240);
    } else if (luma < 0.5) {
      const t = (luma - 0.25) / 0.25;
      r = Math.floor(70 + t * 185);
      g = 0;
      b = Math.floor(240 * (1 - t * 0.75));
    } else if (luma < 0.75) {
      const t = (luma - 0.5) / 0.25;
      r = 255;
      g = Math.floor(t * 230);
      b = 0;
    } else {
      const t = (luma - 0.75) / 0.25;
      r = 255;
      g = Math.floor(230 + t * 25);
      b = Math.floor(t * 240);
    }

    data[i]     = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
};

/**
 * Chromatic aberration (glitch): shifts Red channel right and Blue channel left.
 *
 * @param {Uint8ClampedArray} data
 * @param {Uint8ClampedArray} orig
 * @param {number} w
 * @param {number} shift
 */
const chromaticAberration = (data, orig, w, shift) => {
  for (let i = 0; i < data.length; i += 4) {
    const pixelIdx = i >> 2;
    const x        = pixelIdx % w;
    const row      = ((pixelIdx / w) | 0) * w;

    const redX  = Math.min(w - 1, x + shift);
    data[i]     = orig[(row + redX) * 4];

    const blueX = Math.max(0, x - shift);
    data[i + 2] = orig[(row + blueX) * 4 + 2];
  }
};

/**
 * Pixelate within bounding region using canvas scaling.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} [blockSize=12]
 */
const pixelateRegion = (ctx, x, y, w, h, blockSize = 12) => {
  const offW = Math.max(1, Math.ceil(w / blockSize));
  const offH = Math.max(1, Math.ceil(h / blockSize));

  const tmp    = document.createElement('canvas');
  tmp.width    = offW;
  tmp.height   = offH;
  const tmpCtx = tmp.getContext('2d');

  tmpCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, offW, offH);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, offW, offH, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
};

/**
 * Cyberpunk: neon magenta & electric cyan duotone glow.
 * @param {Uint8ClampedArray} data
 */
const cyberpunk = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    data[i]     = Math.min(255, Math.floor(luma * 240 + 40));     // Vivid hot magenta/pink
    data[i + 1] = Math.min(255, Math.floor(luma * 175));          // Electric cyan green
    data[i + 2] = Math.min(255, Math.floor(140 + luma * 115));    // Intense neon blue
  }
};

/**
 * Night Vision: phosphor tactical green filter + contrast curve.
 * @param {Uint8ClampedArray} data
 */
const nightVision = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i]     = Math.floor(luma * 0.15);                        // Low red
    data[i + 1] = Math.min(255, Math.floor(luma * 1.55 + 32));    // Vivid phosphor green
    data[i + 2] = Math.floor(luma * 0.25);                        // Low blue
  }
};

/**
 * Prism dispersion: chromatic rainbow refraction shift.
 * @param {Uint8ClampedArray} data
 * @param {Uint8ClampedArray} orig
 * @param {number} w
 * @param {number} shift
 */
const prismDispersion = (data, orig, w, shift) => {
  for (let i = 0; i < data.length; i += 4) {
    const pixelIdx = i >> 2;
    const x        = pixelIdx % w;
    const row      = ((pixelIdx / w) | 0) * w;

    const redX   = Math.min(w - 1, x + shift * 2);
    const blueX  = Math.max(0, x - shift * 2);
    const greenX = Math.min(w - 1, Math.max(0, x + shift));

    data[i]     = orig[(row + redX) * 4];
    data[i + 1] = Math.min(255, orig[(row + greenX) * 4 + 1] + 25);
    data[i + 2] = orig[(row + blueX) * 4 + 2];
  }
};

/**
 * Obsidian Silver Chrome Mirror:
 * Deep inky black base with liquid metallic silver curve and platinum chrome sheen.
 * Directly fulfills requirement: "warna yang silver gitu tapi ada hitam untuk base videonya".
 *
 * @param {Uint8ClampedArray} data
 */
const silverChromeMirror = (data) => {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Perceptual luminance
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    let silver = 0;
    if (luma < 75) {
      // Deep black shadow base
      silver = Math.floor(Math.pow(luma / 75, 2.2) * 18);
    } else if (luma < 165) {
      // Polished dark steel to silver midtone
      const t = (luma - 75) / 90;
      silver = Math.floor(18 + Math.pow(t, 1.2) * 142);
    } else {
      // Gleaming silver-white metallic highlights
      const t = (luma - 165) / 90;
      silver = Math.min(255, Math.floor(160 + t * 95));
    }

    // Chrome reflection harmonics
    const chromeRipple = Math.floor(Math.sin(luma * 0.08) * 6);

    data[i]     = Math.max(0, Math.min(255, silver - 2 + chromeRipple));
    data[i + 1] = Math.max(0, Math.min(255, silver + chromeRipple));
    data[i + 2] = Math.max(0, Math.min(255, silver + 7 + chromeRipple));
  }
};

// ── Effect registry ──────────────────────────────────────────

const GLITCH_SHIFT_RATIO = 0.035;

/**
 * Readonly list of available effect names (10 distinct visual filters).
 * @type {readonly string[]}
 */
export const EFFECT_NAMES = Object.freeze([
  'mirror_glass',
  'negative',
  'glitch',
  'pixelate',
  'thermal',
  'zoom',
  'cyberpunk',
  'night_vision',
  'vintage',
  'prism',
]);

// ── HUD & Portal Frame Drawing ───────────────────────────────

/**
 * Draws sleek glowing fingertip anchor nodes.
 * Uses concentric cyber rings instead of protruding crosshair lines,
 * preventing accidental crease lines across the portal.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {string} label
 */
const drawCornerBracket = (ctx, x, y, label) => {
  ctx.save();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = '#06B6D4';
  ctx.shadowBlur  = 6;

  // Concentric cyber node ring
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.stroke();

  // Joint dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
};

/**
 * Draws the cyber/holographic HUD frame connecting the 4 fingertips.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./gestures.js').PortalInfo} portal
 * @param {string} effectName
 */
export const drawPortalFrame = (ctx, portal, effectName) => {
  if (!portal || !portal.corners || portal.corners.length < 3) return;

  const { corners, bounds, center, handCount } = portal;

  ctx.save();

  // 1. Glowing outer perimeter rails (traces boundary ribbon, never cuts through center)
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();

  // Subtle interior scanline/cyan glow
  ctx.fillStyle   = 'rgba(6, 182, 212, 0.05)';
  ctx.fill();

  // Crisp neon cyan stroke with outer blur
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
  ctx.lineWidth   = 2;
  ctx.shadowColor = 'rgba(6, 182, 212, 0.7)';
  ctx.shadowBlur  = 12;
  ctx.stroke();

  // 2. Sleek fingertip target nodes
  corners.forEach((p) => {
    drawCornerBracket(ctx, p.x, p.y, p.label ?? '');
  });

  ctx.restore();
};

/**
 * Draws a futuristic neon laser line when the portal is closed.
 * Displays glowing endpoints, beam core, and floating instruction badge.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./gestures.js').PortalInfo} portal
 * @param {string} effectName
 */
export const drawPortalLine = (ctx, portal, effectName = 'negative') => {
  if (!portal || !portal.line) return;
  const { p1, p2 } = portal.line;
  const cx = portal.center?.x ?? (p1.x + p2.x) / 2;
  const cy = portal.center?.y ?? (p1.y + p2.y) / 2;

  ctx.save();

  // 1. Wide outer neon aura
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
  ctx.lineWidth   = 10;
  ctx.lineCap     = 'round';
  ctx.shadowColor = 'rgba(6, 182, 212, 0.9)';
  ctx.shadowBlur  = 16;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // 2. Cyan energetic beam
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)';
  ctx.lineWidth   = 3.5;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // 3. White-hot laser core
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // 4. Energy endpoints at p1 and p2
  [p1, p2].forEach((p, idx) => {
    // Outer ring
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Center node
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Corner bracket
    drawCornerBracket(ctx, p.x, p.y, idx === 0 ? 'L-LINE' : 'R-LINE');
  });

  ctx.restore();
};

// ── Public Interface ─────────────────────────────────────────

/**
 * Applies a video effect strictly inside a multi-corner (6+ corner) fingertip portal.
 * Outside the portal, the video feed remains 100% untouched.
 * If the portal is closed, renders only a cyber laser line.
 *
 * @param {CanvasRenderingContext2D} ctx - Render canvas context
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {string | import('./gestures.js').PortalInfo} effectNameOrPortal - Name or portal object
 * @param {import('./gestures.js').PortalInfo | string} [portalMaybe]
 * @param {HTMLVideoElement} [videoEl] - Hidden webcam source
 */
export const applyPortalEffect = (ctx, w, h, effectNameOrPortal, portalMaybe, videoEl) => {
  let effectName = 'negative';
  let portal = null;

  if (typeof effectNameOrPortal === 'string') {
    effectName = effectNameOrPortal;
    portal = portalMaybe;
  } else if (effectNameOrPortal && typeof effectNameOrPortal === 'object' && effectNameOrPortal.corners) {
    portal = effectNameOrPortal;
    effectName = typeof portalMaybe === 'string' ? portalMaybe : 'negative';
  } else {
    portal = portalMaybe;
  }

  if (!portal) return;

  // When closed, render only the line
  if (portal.isClosed) {
    drawPortalLine(ctx, portal, effectName);
    return;
  }

  if (!portal.corners || portal.corners.length < 3) return;

  const { bounds, center, corners } = portal;

  // Process the effect at a reduced resolution. Full-resolution getImageData
  // on every camera frame blocks the main thread (especially on 720p+ feeds).
  const renderScale = Math.min(1, 480 / Math.max(bounds.width, bounds.height));
  const effectW = Math.max(1, Math.round(w * renderScale));
  const effectH = Math.max(1, Math.round(h * renderScale));
  const { offCanvas, offCtx } = getOffscreen(effectW, effectH);

  // 1. Prepare effect on offscreen canvas
  if (effectName === 'zoom') {
    // Zoom lens effect: magnify video 2x around portal center
    offCtx.clearRect(0, 0, w, h);
    offCtx.save();
    offCtx.translate(center.x * renderScale, center.y * renderScale);
    offCtx.scale(2.0, 2.0);
    offCtx.translate(-center.x * renderScale, -center.y * renderScale);
    offCtx.drawImage(ctx.canvas, 0, 0, effectW, effectH);
    offCtx.restore();
  } else if (effectName === 'mirror_glass') {
    // Obsidian Silver Mirror: horizontal flip + deep black base + liquid metallic silver chrome
    offCtx.clearRect(0, 0, w, h);
    offCtx.save();
    offCtx.translate(center.x * renderScale, 0);
    offCtx.scale(-1, 1);
    offCtx.translate(-center.x * renderScale, 0);
    offCtx.drawImage(ctx.canvas, 0, 0, effectW, effectH);
    offCtx.restore();

    // Process bounding region with silverChromeMirror (deep black base, metallic silver highlights)
    const bx = Math.max(0, Math.floor(bounds.minX * renderScale));
    const by = Math.max(0, Math.floor(bounds.minY * renderScale));
    const bw = Math.min(effectW - bx, Math.ceil(bounds.width * renderScale));
    const bh = Math.min(effectH - by, Math.ceil(bounds.height * renderScale));

    if (bw > 0 && bh > 0) {
      const imgData = offCtx.getImageData(bx, by, bw, bh);
      silverChromeMirror(imgData.data);
      offCtx.putImageData(imgData, bx, by);
    }

    // Liquid silver specular reflection streak
    const silverGrad = offCtx.createLinearGradient(
      (center.x - bounds.width * 0.6) * renderScale,
      (center.y - bounds.height * 0.6) * renderScale,
      (center.x + bounds.width * 0.6) * renderScale,
      (center.y + bounds.height * 0.6) * renderScale
    );
    silverGrad.addColorStop(0, 'rgba(210, 225, 240, 0.05)');
    silverGrad.addColorStop(0.44, 'rgba(255, 255, 255, 0.32)');
    silverGrad.addColorStop(0.48, 'rgba(255, 255, 255, 0.46)');
    silverGrad.addColorStop(0.56, 'rgba(180, 200, 220, 0.06)');
    silverGrad.addColorStop(1, 'rgba(10, 15, 25, 0.22)');
    offCtx.fillStyle = silverGrad;
    offCtx.fillRect(0, 0, effectW, effectH);
  } else if (effectName === 'pixelate') {
    // Pixelate bounding box on offscreen canvas
    offCtx.clearRect(0, 0, w, h);
    offCtx.drawImage(ctx.canvas, 0, 0, effectW, effectH);
    pixelateRegion(offCtx, bounds.minX * renderScale, bounds.minY * renderScale,
      bounds.width * renderScale, bounds.height * renderScale, 7);
  } else {
    // Pixel-manipulation effects: process only bounding box for 60fps performance
    offCtx.clearRect(0, 0, w, h);
    offCtx.drawImage(ctx.canvas, 0, 0, effectW, effectH);

    const bx = Math.max(0, Math.floor(bounds.minX * renderScale));
    const by = Math.max(0, Math.floor(bounds.minY * renderScale));
    const bw = Math.min(effectW - bx, Math.ceil(bounds.width * renderScale));
    const bh = Math.min(effectH - by, Math.ceil(bounds.height * renderScale));

    if (bw > 0 && bh > 0) {
      const imgData = offCtx.getImageData(bx, by, bw, bh);
      const { data } = imgData;

      switch (effectName) {
        case 'negative':
          negative(data);
          break;

        case 'glitch': {
          const orig = new Uint8ClampedArray(data);
          const shift = Math.max(4, Math.floor(bw * GLITCH_SHIFT_RATIO));
          chromaticAberration(data, orig, bw, shift);
          break;
        }

        case 'grayscale':
          grayscale(data);
          break;

        case 'vintage':
          vintage(data);
          break;

        case 'thermal':
          thermal(data);
          break;

        case 'cyberpunk':
          cyberpunk(data);
          break;

        case 'night_vision':
          nightVision(data);
          break;

        case 'prism': {
          const orig = new Uint8ClampedArray(data);
          const shift = Math.max(3, Math.floor(bw * 0.025));
          prismDispersion(data, orig, bw, shift);
          break;
        }

        default:
          break;
      }

      offCtx.putImageData(imgData, bx, by);
    }
  }

  // 2. Clip main canvas to the fingertip polygon & paint the effect
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(offCanvas, 0, 0, w, h);

  // 3D Twisted Ribbon Shading:
  // Dynamically renders a specular 3D ribbon fold when hands are counter-rotated/twisted.
  // Smoothly blended gradient avoids any harsh middle blue lines on elongated portals!
  if (portal.twist && portal.twist > 0.05) {
    const foldSpan = Math.max(18, Math.min(bounds.width, bounds.height) * 0.35 * portal.twist);
    const foldAngle = (portal.twistAngle ?? 0) + Math.PI / 4;
    const cosA = Math.cos(foldAngle);
    const sinA = Math.sin(foldAngle);
    const fx1 = center.x - foldSpan * cosA;
    const fy1 = center.y - foldSpan * sinA;
    const fx2 = center.x + foldSpan * cosA;
    const fy2 = center.y + foldSpan * sinA;

    const foldGrad = ctx.createLinearGradient(fx1, fy1, fx2, fy2);
    foldGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    foldGrad.addColorStop(0.38, `rgba(2, 6, 18, ${0.5 * portal.twist})`);
    foldGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.35 * portal.twist})`);
    foldGrad.addColorStop(0.62, `rgba(2, 6, 18, ${0.5 * portal.twist})`);
    foldGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = foldGrad;
    ctx.fillRect(bounds.minX - 10, bounds.minY - 10, bounds.width + 20, bounds.height + 20);
  }

  ctx.restore();

  // 3. Draw high-tech HUD border & labels on top
  drawPortalFrame(ctx, portal, effectName);
};

/**
 * Applies a named effect across the entire canvas (fallback or full mode).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {string} effectName
 */
export const applyEffect = (ctx, w, h, effectName) => {
  if (effectName === 'pixelate') {
    pixelateRegion(ctx, 0, 0, w, h, 14);
    return;
  }

  if (effectName === 'mirror_glass') {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tmpCtx = tmp.getContext('2d');
    tmpCtx.drawImage(ctx.canvas, 0, 0);

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();

    const imgData = ctx.getImageData(0, 0, w, h);
    silverChromeMirror(imgData.data);
    ctx.putImageData(imgData, 0, 0);

    const silverGrad = ctx.createLinearGradient(0, 0, w, h);
    silverGrad.addColorStop(0, 'rgba(210, 225, 240, 0.05)');
    silverGrad.addColorStop(0.44, 'rgba(255, 255, 255, 0.32)');
    silverGrad.addColorStop(0.48, 'rgba(255, 255, 255, 0.46)');
    silverGrad.addColorStop(0.56, 'rgba(180, 200, 220, 0.06)');
    silverGrad.addColorStop(1, 'rgba(10, 15, 25, 0.22)');
    ctx.fillStyle = silverGrad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data }  = imageData;

  switch (effectName) {
    case 'negative':
      negative(data);
      break;

    case 'glitch': {
      const orig  = new Uint8ClampedArray(data);
      const shift = Math.floor(w * GLITCH_SHIFT_RATIO);
      chromaticAberration(data, orig, w, shift);
      break;
    }

    case 'grayscale':
      grayscale(data);
      break;

    case 'vintage':
      vintage(data);
      break;

    case 'thermal':
      thermal(data);
      break;

    case 'cyberpunk':
      cyberpunk(data);
      break;

    case 'night_vision':
      nightVision(data);
      break;

    case 'prism': {
      const orig  = new Uint8ClampedArray(data);
      const shift = Math.floor(w * 0.025);
      prismDispersion(data, orig, w, shift);
      break;
    }

    default:
      return;
  }

  ctx.putImageData(imageData, 0, 0);
};
