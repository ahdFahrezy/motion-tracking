/**
 * @module app
 * Entry point and orchestrator — v2.6.
 *
 * Capabilities:
 *  - Three distinct modes (photo / draw / portal) via createModeManager()
 *  - Mode Efek is exclusively the 2-Hand TikTok Portal ("tarik-tarik sudut jari")
 *  - Single-hand thumb-to-index pinch-to-zoom:
 *      * Closed → Open (tertutup ke terbuka) = Zoom In (+)
 *      * Open → Closed (terbuka ke tertutup) = Zoom Out (-)
 *  - ✌️ Peace sign / 2 fingers enters Draw Mode
 *  - ✋ 5 fingers enters Photo Mode
 *  - 👍 Thumbs up enters Portal Mode
 *  - 👊 Fist exits any mode back to Idle
 *
 * Interface:
 *   Autonomous ESM module — auto-initializes on DOM ready.
 */

import {
  classifyGesture,
  extractPortalCorners,
  createPinchZoomTracker,
} from './gestures.js';
import { createRenderer }             from './renderer.js';
import { createFxEngine }             from './effects.js';
import { createDrawEngine }           from './draw.js';
import { applyPortalEffect }          from './videoFx.js';
import { createModeManager, MODE }    from './modes.js';
import { createUI }                   from './ui.js';

// ── Gesture hold config ──────────────────────────────────────

/**
 * Creates a sliding-window consensus hold tracker.
 * Requires the SAME gesture to appear in the majority of a 2-second window
 * before confirming it — eliminates accidental triggers from brief poses.
 *
 * @param {number} [windowSize=60] - Window buffer length (~2s at 30fps)
 * @param {number} [threshold=50]  - Required occurrences to confirm (83%)
 */
const createHoldTracker = (windowSize = 60, threshold = 50) => {
  const history = [];
  let lastConfirmed = null;

  return {
    /**
     * @param {string | null} gesture
     * @returns {string | null}
     */
    feed(gesture) {
      if (!gesture) {
        if (history.length > 0) history.shift();
        return null;
      }

      history.push(gesture);
      if (history.length > windowSize) {
        history.shift();
      }

      // Count occurrences
      const counts = {};
      for (const g of history) {
        counts[g] = (counts[g] || 0) + 1;
      }

      let maxG = null;
      let maxCount = 0;
      for (const [g, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count;
          maxG = g;
        }
      }

      // If dominant gesture meets threshold
      if (maxG && maxCount >= threshold) {
        if (maxG !== lastConfirmed) {
          lastConfirmed = maxG;
          history.length = 0; // Clear on confirmation to prevent repeat firing
          return maxG;
        }
      } else if (lastConfirmed && maxCount <= 1) {
        lastConfirmed = null; // Reset lock once hand changes gesture
      }

      return null;
    },

    reset() {
      history.length = 0;
      lastConfirmed = null;
    },
  };
};

// ── Draw mode helpers ────────────────────────────────────────

const BRUSH_BY_FINGERS = Object.freeze({
  '1': 'fine',
  '2': 'medium',
  '3': 'bold',
});

// Landmark index for index finger tip (used for draw tracking)
const INDEX_TIP = 8;

// ── Portal Effects catalogue ───────────────────────────────

/** Effects available in portal mode (10 rich visual filters). */
export const PORTAL_EFFECTS = Object.freeze([
  { id: 'mirror_glass', label: 'Cermin Perak',    icon: '🪞', subtitle: 'Obsidian Chrome // Black Base' },
  { id: 'negative',     label: 'Negatif',        icon: '🔮', subtitle: 'Spectral Color Inversion' },
  { id: 'glitch',       label: 'Glitch RGB',     icon: '⚡', subtitle: 'Chromatic Dispersion' },
  { id: 'pixelate',     label: 'Pikselasi',      icon: '👾', subtitle: 'Matrix Retro Mosaic' },
  { id: 'thermal',      label: 'Thermal Vision', icon: '🔥', subtitle: 'Infrared Heat Vision' },
  { id: 'zoom',         label: 'Zoom Lens 2x',   icon: '🔍', subtitle: 'Hyper Telescopic Lens' },
  { id: 'cyberpunk',    label: 'Cyberpunk Neon', icon: '🌆', subtitle: 'Magenta & Cyan Matrix' },
  { id: 'night_vision', label: 'Night Vision',   icon: '🟢', subtitle: 'Tactical Phosphor Green' },
  { id: 'vintage',      label: 'Sepia Noir',     icon: '🎞️', subtitle: 'Film Noir Classic Grain' },
  { id: 'prism',        label: 'Prisma Kaca',    icon: '🌈', subtitle: 'Optical Dispersion Refract' },
]);

// ── Capture helper ───────────────────────────────────────────

/**
 * Merges render canvas + draw canvas into a single PNG data URL.
 *
 * @param {HTMLCanvasElement} renderCanvas
 * @param {HTMLCanvasElement} drawCanvas
 * @returns {string}
 */
const capturePhoto = (renderCanvas, drawCanvas) => {
  const tmp    = document.createElement('canvas');
  tmp.width    = renderCanvas.width;
  tmp.height   = renderCanvas.height;
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.drawImage(renderCanvas, 0, 0);
  tmpCtx.drawImage(drawCanvas,   0, 0);
  return tmp.toDataURL('image/png');
};

// ── Bootstrap ────────────────────────────────────────────────

const init = async () => {
  // ── DOM elements ───────────────────────────────────────────
  const videoEl        = document.getElementById('webcam');
  const renderCanvasEl = document.getElementById('render-canvas');
  const drawCanvasEl   = document.getElementById('draw-canvas');
  const fxCanvasEl     = document.getElementById('fx-canvas');
  const cameraFrame    = document.getElementById('camera-frame');

  // ── Module instances ───────────────────────────────────────
  const ui           = createUI();
  const renderer     = createRenderer(renderCanvasEl);
  const fx           = createFxEngine(fxCanvasEl);
  const draw         = createDrawEngine(drawCanvasEl);
  const modes        = createModeManager();
  const hold         = createHoldTracker();
  const pinchTracker = createPinchZoomTracker();

  // ── Canvas size sync ───────────────────────────────────────
  const syncCanvasSize = () => {
    const { offsetWidth: w, offsetHeight: h } = cameraFrame;
    renderer.resize(w, h);
    fx.resize(w, h);
    draw.resize(w, h);
  };

  syncCanvasSize();
  new ResizeObserver(syncCanvasSize).observe(cameraFrame);

  // ── App state ──────────────────────────────────────
  let countingDown       = false;
  let countdownTimer     = null;
  let activePortalEffect = 'mirror_glass';


  // ── Zoom UI & Keyboard Controls ────────────────────────────
  ui.bindZoomEvents((action) => {
    const cur = renderer.getZoom();
    if (action === 'in') {
      renderer.setZoom(cur + 0.25);
      ui.toast(`🔍 Zoom: ${renderer.getZoom().toFixed(1)}x`);
    } else if (action === 'out') {
      renderer.setZoom(cur - 0.25);
      ui.toast(`🔍 Zoom: ${renderer.getZoom().toFixed(1)}x`);
    } else if (action === 'reset') {
      renderer.setZoom(1.0);
      ui.toast('🔍 Zoom direset: 1.0x');
    }
    ui.setZoomDisplay(renderer.getZoom());
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === '=' || e.key === '+') {
      renderer.setZoom(renderer.getZoom() + 0.25);
      ui.setZoomDisplay(renderer.getZoom());
    } else if (e.key === '-' || e.key === '_') {
      renderer.setZoom(renderer.getZoom() - 0.25);
      ui.setZoomDisplay(renderer.getZoom());
    } else if (e.key === '0') {
      renderer.setZoom(1.0);
      ui.setZoomDisplay(renderer.getZoom());
    }
  });

  // ── Mode-specific gesture handlers ────────────────────────

  /** Cancels a running countdown and resets to top of photo mode. */
  const cancelCountdown = () => {
    if (countdownTimer !== null) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    countingDown = false;
    ui.hideCountdown();
    ui.setStatus('Mode Foto — tunjukkan 1–4 jari', 'ready');
  };

  /**
   * Starts a countdown in photo mode.
   *
   * @param {number} totalSeconds
   */
  const startCountdown = (totalSeconds) => {
    if (countingDown) return;
    countingDown  = true;
    let remaining = totalSeconds;

    ui.showCountdown(remaining, totalSeconds);
    ui.setStatus(`Foto dalam ${remaining}…`, 'active');

    countdownTimer = setInterval(() => {
      remaining -= 1;

      if (remaining > 0) {
        ui.showCountdown(remaining, totalSeconds);
        ui.setStatus(`Foto dalam ${remaining}…`, 'active');
        return;
      }

      clearInterval(countdownTimer);
      countdownTimer = null;

      ui.flash();
      const dataUrl = capturePhoto(renderCanvasEl, drawCanvasEl);
      ui.addPhoto(dataUrl);
      ui.toast('📸 Foto disimpan!');
      ui.hideCountdown();

      setTimeout(() => {
        countingDown = false;
        ui.setStatus('Mode Foto — tunjukkan 1–4 jari', 'ready');
      }, 1000);
    }, 1000);
  };

  /** Handles a confirmed gesture when in PHOTO mode. */
  const handlePhotoGesture = (gesture) => {
    const seconds = { '1': 1, '2': 2, '3': 3, '4': 4 }[gesture];
    if (seconds) {
      ui.showGestureBadge(['', '☝️', '✌️', '🤟', '🖐'][seconds], `${seconds} detik`);
      startCountdown(seconds);
    }
  };

  /** Handles a confirmed gesture when in DRAW mode. */
  const handleDrawGesture = (gesture) => {
    const preset = BRUSH_BY_FINGERS[gesture];
    if (preset) {
      draw.setBrush(preset);
      const labels = { fine: 'Kuas Putih', medium: 'Kuas Cyan', bold: 'Kuas Pink' };
      const icons  = { fine: '☝️', medium: '✌️', bold: '🤟' };
      ui.showGestureBadge(icons[preset], labels[preset]);
      ui.highlightGuide(['1', '2', '3'].indexOf(gesture));
      return;
    }

    if (gesture === 'thumbsup') {
      draw.clear();
      ui.toast('🗑️ Kanvas dihapus');
    }
  };

  // ── Mode lifecycle hooks ───────────────────────────────────

  const onModeEntered = (modeName) => {
    ui.setMode(modeName);
    hold.reset();
    pinchTracker.reset();

    switch (modeName) {
      case MODE.PHOTO:
        ui.setStatus('Mode Foto — tunjukkan 1–4 jari (jepit untuk zoom)', 'ready');
        ui.toast('📸 Mode Foto aktif — tunjukkan 1–4 jari untuk timer!');
        break;

      case MODE.DRAW:
        ui.setStatus('Mode Gambar — gerakkan jari telunjuk', 'ready');
        ui.toast('🎨 Mode Gambar aktif — gambar dengan ujung jari telunjuk!');
        draw.setBrush('medium');
        break;

      case MODE.EFFECT: {
        ui.setStatus('Mode Portal — buka jari untuk portal, tahan tombol "Efek" 2 detik untuk ubah efek', 'ready');
        ui.toast('✨ Mode Portal aktif! Tahan tombol "Efek" 2 detik untuk membuka menu efek.');
        ui.showPortalEffectButton(PORTAL_EFFECTS, activePortalEffect);
        const curEffIdx = PORTAL_EFFECTS.findIndex((e) => e.id === activePortalEffect);
        const defaultIdx = curEffIdx >= 0 ? curEffIdx : 0;
        ui.highlightGuide(defaultIdx);
        ui.setEffectLabel(`Portal ${PORTAL_EFFECTS[defaultIdx].label}`);
        break;
      }

      default:
        break;
    }
  };

  const onModeExited = (fromMode) => {
    hold.reset();
    pinchTracker.reset();
    ui.setMode(MODE.IDLE);
    ui.hideGestureBadge();
    ui.hideCountdown();
    ui.highlightGuide(null);
    ui.setStatus('Arahkan tangan — pilih mode', 'ready');

    if (fromMode === MODE.PHOTO) {
      cancelCountdown();
    }

    if (fromMode === MODE.DRAW) {
      draw.lift();
    }

    if (fromMode === MODE.EFFECT) {
      ui.closeEffectModal();
      ui.hidePortalEffectButton();
    }

    ui.toast('Kembali ke menu awal');
  };

  // ── Interactive Sidebar Click Handler ─────────────────────
  ui.onGuideClick((currentMode, index) => {
    if (currentMode === MODE.IDLE) {
      if (index === 0) onModeEntered(MODE.PHOTO);
      else if (index === 1) onModeEntered(MODE.DRAW);
      else if (index === 2) onModeEntered(MODE.EFFECT);
    } else if (currentMode === MODE.PHOTO) {
      if (index >= 0 && index <= 3) {
        startCountdown(index + 1);
      } else if (index === 4) {
        onModeExited(MODE.PHOTO);
      }
    } else if (currentMode === MODE.DRAW) {
      if (index === 0) handleDrawGesture('1');
      else if (index === 1) handleDrawGesture('2');
      else if (index === 2) handleDrawGesture('3');
      else if (index === 3) draw.lift();
      else if (index === 4) handleDrawGesture('thumbsup');
      else if (index === 5) onModeExited(MODE.DRAW);
    } else if (currentMode === MODE.EFFECT) {
      if (index >= 0 && index < PORTAL_EFFECTS.length) {
        const item = PORTAL_EFFECTS[index];
        activePortalEffect = item.id;
        ui.highlightGuide(index);
        ui.toast(`✨ Efek Portal: ${item.label}`);
        ui.setEffectLabel(`Portal ${item.label}`);
        ui.showPortalEffectButton(PORTAL_EFFECTS, activePortalEffect);
      } else if (index === PORTAL_EFFECTS.length) {
        onModeExited(MODE.EFFECT);
      }
    }
  });

  // ── In-Camera Effect Selection Callback (From Modal or Click) ──
  ui.onEffectSelect((eff, idx) => {
    activePortalEffect = eff.id;
    ui.highlightGuide(idx);
    ui.toast(`✨ Efek Aktif: ${eff.label}`);
    ui.setEffectLabel(`Portal ${eff.label}`);
    ui.showPortalEffectButton(PORTAL_EFFECTS, activePortalEffect);
  });

  // ── MediaPipe setup ───────────────────────────────────────
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands:             2,
    modelComplexity:         1,
    minDetectionConfidence:  0.75,
    minTrackingConfidence:   0.65,
  });

  /**
   * Per-frame result handler.
   *
   * @param {{ multiHandLandmarks: Array }} results
   */
  hands.onResults((results) => {
    try {
      const { multiHandLandmarks = [] } = results;
      const { width: w, height: h }     = renderCanvasEl;
      const currentMode                 = modes.getMode();

      // ── 1. No hand: reset transient state ────────────────────
      if (multiHandLandmarks.length === 0) {
        hold.reset();
        pinchTracker.reset();
        renderer.draw(videoEl, []);
        if (currentMode === MODE.DRAW) draw.lift();
        if (currentMode === MODE.EFFECT) {
          if (ui.isEffectModalOpen()) {
            ui.updateEffectModalHand([], w, h);
          } else {
            ui.showPortalEffectButton(PORTAL_EFFECTS, activePortalEffect);
            ui.updateEffectTriggerHand([], w, h);
          }
        }
        ui.hideGestureBadge();
        ui.highlightGuide(null);
        ui.setStatus(
          currentMode === MODE.IDLE
            ? 'Arahkan tangan ke kamera'
            : 'Mode aktif — tunjukkan tangan',
          'ready',
        );
        return;
      }

      // ── 2. Pinch Zoom tracking (IDLE & PHOTO modes) ──────────
    // Closed -> Open (tertutup ke terbuka) = Zoom In (+)
    // Open -> Closed (terbuka ke tertutup) = Zoom Out (-)
    let activePinch = null;

    if (currentMode === MODE.IDLE || currentMode === MODE.PHOTO) {
      const primaryHand = multiHandLandmarks[0];
      activePinch = pinchTracker.update(primaryHand);

      if (activePinch && Math.abs(activePinch.delta) > 0.003) {
        const nextZoom = renderer.getZoom() + activePinch.delta;
        renderer.setZoom(nextZoom);
        ui.setZoomDisplay(renderer.getCurrentZoom());
      }
    } else {
      pinchTracker.reset();
    }

    // ── 3. Render video + skeleton (with zoom transform) ─────
    renderer.draw(videoEl, multiHandLandmarks, activePinch);

    // Sync UI zoom badge
    ui.setZoomDisplay(renderer.getCurrentZoom());

    // ── 4. Effect mode: Modal Effect Selector & Multi-corner Portal ─
    if (currentMode === MODE.EFFECT) {
      if (ui.isEffectModalOpen()) {
        ui.renderEffectDeckPreviews(videoEl);
        ui.updateEffectModalHand(multiHandLandmarks, w, h);
        return;
      }

      // Modal is closed:
      // 1. Show & update floating "Efek" trigger button (2-second dwell detection)
      ui.showPortalEffectButton(PORTAL_EFFECTS, activePortalEffect);
      ui.updateEffectTriggerHand(multiHandLandmarks, w, h);

      // 2. Portal mode is active: extract and render portal!
      const currentZoom = renderer.getCurrentZoom();
      const portal = extractPortalCorners(multiHandLandmarks, w, h, currentZoom);

      if (portal) {
        applyPortalEffect(
          renderCanvasEl.getContext('2d'),
          w, h,
          activePortalEffect,
          portal,
          videoEl,
        );
      }

      return;
    }

    // ── 5. Always: tick particle fx ──────────────────────────
    fx.tick();

    const landmarks = multiHandLandmarks[0];

    // ── 6. Draw mode: continuous fingertip tracking ──────────
    if (currentMode === MODE.DRAW) {
      const rawGesture = classifyGesture(landmarks);
      const penDown    = rawGesture === '1' || rawGesture === '2' || rawGesture === '3';

      if (penDown) {
        const tip = landmarks[INDEX_TIP];
        draw.update(tip.x, tip.y);
      } else {
        draw.lift();
      }

      const confirmed = hold.feed(rawGesture);
      if (confirmed) {
        const event = modes.transition(confirmed);
        if (event?.type === 'exited') {
          onModeExited(event.from);
          return;
        }
        if (event?.type === 'action') {
          handleDrawGesture(event.gesture);
        }
      }
      return;
    }

    // ── 7. Classify gesture & live visual feedback ───────────
    const rawGesture = classifyGesture(landmarks);

    // Real-time responsive visual feedback (before hold confirmation)
    if (currentMode === MODE.IDLE) {
      if (rawGesture === '5') {
        ui.highlightGuide(0);
        ui.showGestureBadge('✋', '5 Jari (Open Palm)');
      } else if (rawGesture === '2') {
        ui.highlightGuide(1);
        ui.showGestureBadge('✌️', '2 Jari (Peace Sign)');
      } else if (rawGesture === 'thumbsup') {
        ui.highlightGuide(2);
        ui.showGestureBadge('👍', 'Thumbs Up');
      } else if (rawGesture === 'fist') {
        ui.showGestureBadge('👊', 'Kepalan');
        ui.highlightGuide(null);
      } else {
        ui.highlightGuide(null);
        ui.hideGestureBadge();
      }
    } else if (currentMode === MODE.PHOTO && !countingDown) {
      const sec = { '1': 1, '2': 2, '3': 3, '4': 4 }[rawGesture];
      if (sec) {
        ui.highlightGuide(sec - 1);
        ui.showGestureBadge(['', '☝️', '✌️', '🤟', '🖐'][sec], `${sec} detik`);
      } else if (rawGesture === 'fist') {
        ui.showGestureBadge('👊', 'Keluar');
        ui.highlightGuide(4);
      }
    }

    const confirmed = hold.feed(rawGesture);
    if (!confirmed) return;

    const event = modes.transition(confirmed);
    if (!event) return;

    switch (event.type) {
      case 'entered':
        onModeEntered(event.mode);
        break;

      case 'exited':
        onModeExited(event.from);
        break;

      case 'action':
        if (event.mode === MODE.PHOTO && !countingDown) {
          handlePhotoGesture(event.gesture);
        }
        break;

      default:
        break;
    }
  } catch (err) {
    console.error('hands.onResults error:', err);
  }
});

  // ── Start camera ──────────────────────────────────────────
  ui.setStatus('Memuat MediaPipe…', 'idle');
  ui.setMode(MODE.IDLE);

  const camera = new Camera(videoEl, {
    onFrame: async () => { await hands.send({ image: videoEl }); },
    width:  1280,
    height: 720,
  });

  try {
    await camera.start();
    ui.setStatus('Arahkan tangan — pilih mode', 'ready');
  } catch (err) {
    console.error('Camera error:', err);
    ui.setStatus('Kamera tidak dapat dibuka', 'error');
    ui.toast('❌ Tidak bisa membuka kamera. Cek izin browser kamu.');
  }
};

// Run after DOM ready (ESM top-level await)
try {
  await init();
} catch (err) {
  console.error('MotionSnap init failed:', err);
}
