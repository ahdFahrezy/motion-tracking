/**
 * @module ui
 * Deep module — owns all DOM mutation.
 *
 * New in v2:
 *   - setMode(modeName)       → updates mode pill + re-renders guide list
 *   - highlightGuide(id)      → highlights a specific guide item by index
 *   - setEffectLabel(name)    → shows active effect name in mode pill
 *
 * Interface:
 *   createUI() → UI
 */

import { MODE_META } from './modes.js';
import { applyEffect } from './videoFx.js';

// ── DOM helper ───────────────────────────────────────────────
/** @param {string} id @returns {HTMLElement} */
const el = (id) => document.getElementById(id);

// Ring circumference matches CSS --ring-circumference variable
const RING_CIRC = 339.3;

// ── Private helpers ──────────────────────────────────────────

const setRingProgress = (ringEl, progress) => {
  ringEl.style.strokeDashoffset = String(RING_CIRC * (1 - progress));
};

const triggerFlash = (flashEl) => {
  flashEl.classList.remove('flashing');
  void flashEl.offsetWidth; // force reflow to restart animation
  flashEl.classList.add('flashing');
};

/**
 * Builds a guide list item element.
 *
 * @param {{ icon: string, name: string, desc: string }} item
 * @param {number} index
 * @param {((index: number, item: any) => void)} [onClick]
 * @returns {HTMLLIElement}
 */
const makeGuideItem = (item, index, onClick) => {
  const li = document.createElement('li');
  li.className = 'guide-item';
  li.dataset.idx = String(index);
  li.tabIndex = 0;
  li.role = 'button';
  li.setAttribute('aria-label', `${item.name}: ${item.desc}`);
  li.innerHTML = `
    <span class="guide-emoji" aria-hidden="true">${item.icon}</span>
    <div class="guide-info">
      <strong class="guide-name">${item.name}</strong>
      <span class="guide-desc">${item.desc}</span>
    </div>
    <span class="guide-indicator" aria-hidden="true"></span>`;

  if (onClick) {
    li.addEventListener('click', () => onClick(index, item));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(index, item);
      }
    });
  }
  return li;
};

/**
 * Creates a gallery thumbnail element with download button.
 *
 * @param {string} dataUrl
 * @param {number} index
 * @returns {HTMLElement}
 */
const makeThumb = (dataUrl, index) => {
  const wrap = document.createElement('div');
  wrap.className = 'gallery-thumb';
  wrap.role      = 'listitem';
  wrap.tabIndex  = 0;
  wrap.setAttribute('aria-label', `Foto ${index}`);

  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = `Foto ${index}`;

  const btn = document.createElement('button');
  btn.className = 'gallery-thumb-download';
  btn.setAttribute('aria-label', `Unduh foto ${index}`);
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <polyline points="7,10 12,15 17,10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href     = dataUrl;
    a.download = `motionsnap-${Date.now()}.png`;
    a.click();
  });

  wrap.appendChild(img);
  wrap.appendChild(btn);
  return wrap;
};

// ── Public interface ─────────────────────────────────────────

/**
 * Creates the UI controller.
 * Must be called after DOMContentLoaded.
 *
 * @returns {Object} UI
 */
export const createUI = () => {
  const statusDot        = el('status-dot');
  const statusText       = el('status-text');
  const gestureBadge     = el('gesture-badge');
  const gestureIcon      = el('gesture-icon');
  const gestureLabel     = el('gesture-label');
  const cameraFrame      = el('camera-frame');
  const countdownOverlay = el('countdown-overlay');
  const countdownNumber  = el('countdown-number');
  const ringProgress     = el('ring-progress');
  const flashOverlay     = el('flash-overlay');
  const galleryStrip     = el('gallery-strip');
  const galleryEmpty     = el('gallery-empty');
  const toastEl          = el('toast');
  const modePill         = el('mode-pill');
  const modePillLabel    = el('mode-pill-label');
  const guideTitle       = el('guide-title');
  const guideList        = el('guide-list');

  // Floating Portal Effect Trigger Button (Portal mode)
  const portalEffectBtn      = el('portal-effect-btn');
  const effectBtnDwellRing   = el('effect-btn-dwell-ring');
  const effectBtnCurrentName = el('effect-btn-current-name');

  // In-Camera Centered Effect Modal
  const effectModalBackdrop  = el('effect-modal-backdrop');
  const effectModal          = el('effect-modal');
  const modalCloseBtn        = el('modal-close-btn');
  const closeBtnDwellRing    = el('close-btn-dwell-ring');
  const modalTouchCursor     = el('modal-touch-cursor');
  const effectSelectBtn      = el('effect-select-btn');
  const selectBtnDwellRing   = el('select-btn-dwell-ring');
  const effectSelectBtnText  = el('effect-select-btn-text');
  const modalGuideHint       = el('modal-guide-hint');
  const effectPickerViewport = el('effect-picker-viewport');
  const effectPickerTrack    = el('effect-picker-track');
  const effectPrevBtn        = el('effect-prev-btn');
  const effectNextBtn        = el('effect-next-btn');

  // Zoom controls
  const zoomLevelText    = el('zoom-level-text');
  const zoomInBtn        = el('zoom-in-btn');
  const zoomOutBtn       = el('zoom-out-btn');
  const zoomResetBtn     = el('zoom-reset-btn');

  let photoCount = 0;
  let toastTimer = null;
  let currentModeName = 'idle';
  let guideClickHandler = null;
  let effectSelectHandler = null;
  let pickerEffectsKey = '';

  // 3D Deck Specifications per effect (matching reference image specs!)
  const EFFECT_SPECS = Object.freeze({
    mirror_glass: { spectrum: 95, intensity: 88, distortion: 15, subtitle: 'Obsidian Chrome // Black Base' },
    cyberpunk:    { spectrum: 100, intensity: 94, distortion: 35, subtitle: 'Magenta & Cyan Matrix' },
    glitch:       { spectrum: 85, intensity: 96, distortion: 92, subtitle: 'Chromatic Dispersion' },
    negative:     { spectrum: 90, intensity: 100, distortion: 10, subtitle: 'Spectral Color Inversion' },
    thermal:      { spectrum: 98, intensity: 86, distortion: 20, subtitle: 'Infrared Heat Vision' },
    zoom:         { spectrum: 50, intensity: 75, distortion: 58, subtitle: 'Hyper Telescopic Lens' },
    night_vision: { spectrum: 70, intensity: 82, distortion: 25, subtitle: 'Tactical Phosphor Green' },
    pixelate:     { spectrum: 60, intensity: 90, distortion: 85, subtitle: 'Matrix Retro Mosaic' },
    vintage:      { spectrum: 65, intensity: 70, distortion: 18, subtitle: 'Film Noir Classic Grain' },
    prism:        { spectrum: 100, intensity: 88, distortion: 45, subtitle: 'Optical Dispersion Refract' },
  });

  // Modal & Gesture Interaction State
  let isEffectModalOpen     = false;
  let dwellTriggerStartTime = null;
  let dwellSelectStartTime  = null;
  let dwellCloseStartTime   = null;
  let lastModalHandX        = null;

  const TRIGGER_DWELL_MS    = 1500; // 1.5s dwell to open the full-screen deck
  const SELECT_DEBOUNCE_MS  = 180;  // Instant selection! 180ms anti-jitter filter, NO loading circle
  const CLOSE_DEBOUNCE_MS   = 220;  // Fast clean return
  const RING_TRIGGER_CIRC   = 113.1;
  const RING_SELECT_CIRC    = 113.1;
  const RING_CLOSE_CIRC     = 87.96;

  // 3D Coverflow Deck Motion State
  let carouselTargetScroll  = 0;
  let carouselCurrentScroll = 0;
  let carouselActiveIndex   = 0;
  let carouselEffects       = [];
  let carouselPills         = [];

  /** Sets SVG progress stroke-dashoffset safely. */
  const setDwellRingProgress = (ringEl, circ, progress) => {
    if (!ringEl) return;
    ringEl.style.strokeDashoffset = String(circ * (1 - Math.max(0, Math.min(1, progress))));
  };

  /**
   * Updates 3D Cylindrical Coverflow transformation for each card.
   * Matches reference image: center card faces forward with glowing cyan frame,
   * while adjacent cards rotate in 3D perspective receding into the background.
   */
  const updateCarouselDOM = () => {
    if (!effectPickerTrack || carouselPills.length === 0) return;

    carouselPills.forEach((card, i) => {
      const k = i - carouselCurrentScroll;
      const absK = Math.abs(k);
      const sign = Math.sign(k);

      // 3D Cylindrical coverflow transform:
      const xOffset = sign * (Math.min(absK, 1) * 315 + Math.max(0, absK - 1) * 190);
      const zOffset = 130 - absK * 95;
      const rotY    = -sign * Math.min(58, absK * 32);
      const scale   = Math.max(0.68, 1.05 - absK * 0.16);
      const opacity = Math.max(0, 1 - (absK - 1.35) * 0.75);

      card.style.transform = `translateX(${xOffset.toFixed(1)}px) translateZ(${zOffset.toFixed(1)}px) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      card.style.opacity   = opacity.toFixed(2);
      card.style.zIndex    = String(Math.round(20 - absK * 4));
      card.style.pointerEvents = absK < 2.5 ? 'auto' : 'none';

      const isCenter = absK < 0.48;
      card.classList.toggle('is-center', isCenter);
      card.classList.toggle('selected', isCenter);
    });

    const newCenterIndex = Math.max(0, Math.min(carouselEffects.length - 1, Math.round(carouselCurrentScroll)));
    carouselActiveIndex = newCenterIndex;

    // Dynamically update footer action button label
    if (effectSelectBtnText && carouselEffects[newCenterIndex]) {
      effectSelectBtnText.textContent = `TERAPKAN: ${carouselEffects[newCenterIndex].label}`;
    }
  };

  return {
    // ── Status bar ───────────────────────────────────────────

    /** @param {string} text @param {'idle'|'ready'|'active'|'error'} [state] */
    setStatus(text, state = 'idle') {
      statusText.textContent = text;
      statusDot.className    = `status-dot ${state}`;
    },

    // ── Zoom Controls ────────────────────────────────────────

    /**
     * Updates zoom level display text.
     * @param {number} zoom
     */
    setZoomDisplay(zoom) {
      if (zoomLevelText) {
        zoomLevelText.textContent = `${zoom.toFixed(1)}x`;
      }
    },

    /**
     * Binds zoom button click events.
     * @param {{(action: 'in'|'out'|'reset'): void}} onZoomAction
     */
    bindZoomEvents(onZoomAction) {
      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => onZoomAction('in'));
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => onZoomAction('out'));
      }
      if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => onZoomAction('reset'));
      }
    },

    // ── Mode system ──────────────────────────────────────────

    /**
     * Registers a callback when a guide item is clicked.
     * @param {{(mode: string, index: number, item: any): void}} handler
     */
    onGuideClick(handler) {
      guideClickHandler = handler;
    },

    /**
     * Updates the mode pill colour + label, and re-renders the
     * context-sensitive gesture guide in the sidebar.
     *
     * @param {string} modeName - One of MODE values
     */
    setMode(modeName) {
      currentModeName = modeName;
      const meta = MODE_META[modeName];
      if (!meta) return;

      // Mode pill + camera frame glow (via data-mode CSS selectors)
      modePillLabel.textContent    = meta.label;
      modePill.dataset.mode        = modeName;
      cameraFrame.dataset.mode     = modeName;

      // Guide title
      guideTitle.textContent = modeName === 'idle' ? 'Pilih Mode' : 'Kontrol';

      // Render guide items with click handler
      guideList.innerHTML = '';
      meta.guides.forEach((item, i) => {
        guideList.appendChild(makeGuideItem(item, i, (idx, itm) => {
          if (guideClickHandler) {
            guideClickHandler(currentModeName, idx, itm);
          }
        }));
      });
    },

    /**
     * Highlights a guide list item by index (0-based).
     * Clears previous highlight first.
     *
     * @param {number | null} index
     */
    highlightGuide(index) {
      guideList.querySelectorAll('.guide-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });
    },

    /**
     * Updates the mode pill to show the active effect name.
     *
     * @param {string} effectLabel - Human-readable effect name
     */
    setEffectLabel(effectLabel) {
      modePillLabel.textContent = `✨ ${effectLabel}`;
    },

    // ── Gesture badge ────────────────────────────────────────

    /** @param {string} icon @param {string} label */
    showGestureBadge(icon, label) {
      gestureIcon.textContent  = icon;
      gestureLabel.textContent = label;
      gestureBadge.classList.add('visible');
    },

    hideGestureBadge() {
      gestureBadge.classList.remove('visible');
    },

    // ── Countdown ring ───────────────────────────────────────

    /**
     * @param {number} seconds
     * @param {number} totalSeconds
     */
    showCountdown(seconds, totalSeconds) {
      countdownOverlay.classList.add('visible');
      countdownNumber.textContent = String(seconds);
      // Restart CSS pop animation on digit change
      countdownNumber.style.animation = 'none';
      void countdownNumber.offsetWidth;
      countdownNumber.style.animation = '';
      setRingProgress(ringProgress, seconds / totalSeconds);
    },

    hideCountdown() {
      countdownOverlay.classList.remove('visible');
    },

    // ── Effect Picker: Centered Modal & Floating Button (Portal Mode) ──

    /**
     * Registers a callback when an effect is committed/selected.
     * @param {{(effect: {id: string, label: string, icon: string}, index: number): void}} handler
     */
    onEffectSelect(handler) {
      effectSelectHandler = handler;
    },

    /**
     * Checks if the centered effect modal is currently open.
     * @returns {boolean}
     */
    isEffectModalOpen() {
      return isEffectModalOpen;
    },

    /**
     * Shows the floating "Efek" trigger button on camera frame.
     *
     * @param {Array<{id: string, label: string, icon: string}>} effects
     * @param {string} [activeId]
     */
    showPortalEffectButton(effects, activeId) {
      carouselEffects = effects;
      if (portalEffectBtn) {
        portalEffectBtn.classList.add('visible');
      }
      if (activeId && effectBtnCurrentName) {
        const current = effects.find((e) => e.id === activeId);
        if (current) effectBtnCurrentName.textContent = current.label;
      }
    },

    /** Hides the floating "Efek" trigger button. */
    hidePortalEffectButton() {
      if (portalEffectBtn) {
        portalEffectBtn.classList.remove('visible');
        portalEffectBtn.classList.remove('is-hovered');
      }
      dwellTriggerStartTime = null;
      setDwellRingProgress(effectBtnDwellRing, RING_TRIGGER_CIRC, 0);
    },

    /**
     * Opens the centered effect modal dialog in the middle of the camera.
     *
     * @param {Array<{id: string, label: string, icon: string}>} [effects]
     * @param {string} [activeId]
     */
    openEffectModal(effects, activeId) {
      if (effects) carouselEffects = effects;
      if (!effectPickerTrack || carouselEffects.length === 0) return;

      const commitSelection = (chosenIdx) => {
        const idx = chosenIdx !== undefined ? chosenIdx : carouselActiveIndex;
        const chosenEff = carouselEffects[idx];
        if (chosenEff) {
          if (effectBtnCurrentName) effectBtnCurrentName.textContent = chosenEff.label;
          if (effectSelectHandler) effectSelectHandler(chosenEff, idx);
          this.toast(`⚡ Efek Diaktifkan: ${chosenEff.label}`);
        }
        this.closeEffectModal();
      };

      const key = carouselEffects.map((e) => e.id).join(',');
      if (pickerEffectsKey !== key) {
        pickerEffectsKey = key;
        effectPickerTrack.innerHTML = carouselEffects.map((eff, i) => {
          const modNum = String(i + 1).padStart(2, '0');
          return `
            <div class="deck-card effect-pill" data-idx="${i}" data-id="${eff.id}" role="option" tabindex="0" aria-label="Efek ${eff.label}">
              <div class="card-header">
                <span class="card-tag">FX // ${modNum}</span>
                <h4 class="card-title">${eff.label}</h4>
                <span class="card-subtitle">${eff.subtitle || 'Optical Filter'}</span>
              </div>
              <div class="card-preview-box">
                <canvas class="card-preview-canvas" width="280" height="180" aria-label="Live Preview ${eff.label}"></canvas>
                <div class="preview-hud-corners" aria-hidden="true">
                  <span class="hud-c tl"></span><span class="hud-c tr"></span>
                  <span class="hud-c bl"></span><span class="hud-c br"></span>
                </div>
                <span class="preview-live-tag">● LIVE PREVIEW</span>
              </div>
              <button class="card-select-btn" type="button" aria-label="Pilih Efek ${eff.label}">
                <span class="card-btn-beam" aria-hidden="true"></span>
                <span class="card-btn-icon" aria-hidden="true">⚡</span>
                <span class="card-btn-text">PILIH EFEK INI</span>
              </button>
            </div>`;
        }).join('');

        carouselPills = Array.from(effectPickerTrack.querySelectorAll('.deck-card'));

        carouselPills.forEach((card, idx) => {
          // Direct select on card click OR embedded button click
          card.addEventListener('click', (e) => {
            e.stopPropagation();
            commitSelection(idx);
          });

          const btn = card.querySelector('.card-select-btn');
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              commitSelection(idx);
            });
          }
        });

        if (effectPrevBtn) {
          effectPrevBtn.onclick = (e) => {
            e.stopPropagation();
            const prev = Math.max(0, carouselActiveIndex - 1);
            carouselTargetScroll = prev;
            carouselActiveIndex  = prev;
            updateCarouselDOM();
          };
        }

        if (effectNextBtn) {
          effectNextBtn.onclick = (e) => {
            e.stopPropagation();
            const next = Math.min(carouselEffects.length - 1, carouselActiveIndex + 1);
            carouselTargetScroll = next;
            carouselActiveIndex  = next;
            updateCarouselDOM();
          };
        }

        if (effectPickerViewport) {
          effectPickerViewport.onwheel = (e) => {
            e.preventDefault();
            const delta = Math.sign(e.deltaX || e.deltaY);
            if (delta !== 0) {
              const target = Math.max(0, Math.min(carouselEffects.length - 1, carouselActiveIndex + delta));
              carouselTargetScroll = target;
              carouselActiveIndex  = target;
              updateCarouselDOM();
            }
          };
        }
      }

      // Sync active index
      if (activeId) {
        const initIdx = carouselEffects.findIndex((e) => e.id === activeId);
        if (initIdx >= 0) {
          carouselTargetScroll  = initIdx;
          carouselCurrentScroll = initIdx;
          carouselActiveIndex   = initIdx;
        }
      }

      isEffectModalOpen = true;
      lastModalHandX = null;
      dwellSelectStartTime = null;
      dwellCloseStartTime  = null;
      setDwellRingProgress(selectBtnDwellRing, RING_SELECT_CIRC, 0);
      setDwellRingProgress(closeBtnDwellRing, RING_CLOSE_CIRC, 0);

      if (effectModalBackdrop) {
        effectModalBackdrop.classList.add('visible');
        effectModalBackdrop.setAttribute('aria-hidden', 'false');
      }
      if (portalEffectBtn) {
        portalEffectBtn.classList.remove('visible');
      }

      updateCarouselDOM();

      // Bind instant button click actions (no loading delay!)
      if (effectSelectBtn) {
        effectSelectBtn.onclick = (e) => {
          e.stopPropagation();
          commitSelection(carouselActiveIndex);
        };
      }

      if (modalCloseBtn) {
        modalCloseBtn.onclick = (e) => {
          e.stopPropagation();
          this.closeEffectModal();
        };
      }

      if (effectModalBackdrop) {
        effectModalBackdrop.onclick = (e) => {
          if (e.target === effectModalBackdrop) this.closeEffectModal();
        };
      }
    },

    /**
     * Closes the centered effect modal dialog and restores camera portal gestures.
     */
    closeEffectModal() {
      isEffectModalOpen = false;
      dwellSelectStartTime = null;
      dwellCloseStartTime  = null;
      lastModalHandX = null;

      if (effectModalBackdrop) {
        effectModalBackdrop.classList.remove('visible');
        effectModalBackdrop.setAttribute('aria-hidden', 'true');
      }
      if (modalTouchCursor) {
        modalTouchCursor.classList.remove('visible');
      }
      if (portalEffectBtn && currentModeName === 'effect') {
        portalEffectBtn.classList.add('visible');
      }

      setDwellRingProgress(selectBtnDwellRing, RING_SELECT_CIRC, 0);
      setDwellRingProgress(closeBtnDwellRing, RING_CLOSE_CIRC, 0);
      if (effectSelectBtn) effectSelectBtn.classList.remove('is-hovered');
      if (modalCloseBtn) modalCloseBtn.classList.remove('is-hovered');
    },

    /**
     * Renders real-time webcam video feed with effect filters onto the
     * active center card and its visible neighbor cards inside the 3D coverflow deck.
     *
     * @param {HTMLVideoElement} videoEl
     */
    renderEffectDeckPreviews(videoEl) {
      if (!isEffectModalOpen || !videoEl || videoEl.readyState < 2 || carouselPills.length === 0) return;

      const activeIdx = Math.round(carouselCurrentScroll);
      const toRender = [activeIdx - 1, activeIdx, activeIdx + 1];

      toRender.forEach((idx) => {
        if (idx < 0 || idx >= carouselPills.length || !carouselEffects[idx]) return;
        const card = carouselPills[idx];
        if (!card) return;
        const canvas = card.querySelector('.card-preview-canvas');
        if (!canvas) return;
        const pctx = canvas.getContext('2d');

        // Draw mirrored webcam frame
        pctx.save();
        pctx.translate(canvas.width, 0);
        pctx.scale(-1, 1);
        pctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        pctx.restore();

        // Apply corresponding filter
        applyEffect(pctx, canvas.width, canvas.height, carouselEffects[idx].id);
      });
    },

    /**
     * Checks if hand touches the floating "Pilih Efek" button with dwell.
     * When touched continuously, smoothly opens the full-screen 3D deck.
     *
     * @param {Array<Array<{x:number, y:number, z:number}>>} multiHandLandmarks
     * @param {number} [canvasW]
     * @param {number} [canvasH]
     */
    updateEffectTriggerHand(multiHandLandmarks = [], canvasW = 640, canvasH = 360) {
      if (isEffectModalOpen || !portalEffectBtn || !cameraFrame) return;

      const frameRect = cameraFrame.getBoundingClientRect();
      const btnRect   = portalEffectBtn.getBoundingClientRect();

      // Forgiving touch bounding box (+18px padding)
      const xMin = (btnRect.left - frameRect.left - 18) / frameRect.width;
      const xMax = (btnRect.right - frameRect.left + 18) / frameRect.width;
      const yMin = (btnRect.top - frameRect.top - 18) / frameRect.height;
      const yMax = (btnRect.bottom - frameRect.top + 18) / frameRect.height;

      const touchCandidateIndices = [8, 12, 4, 9, 0];
      let isTouchingBtn = false;

      if (Array.isArray(multiHandLandmarks)) {
        for (const hand of multiHandLandmarks) {
          if (!hand || hand.length < 9) continue;
          for (const idx of touchCandidateIndices) {
            const pt = hand[idx];
            if (!pt) continue;
            const sx = 1 - pt.x; // Mirrored screen X
            const sy = pt.y;     // Screen Y
            if (sx >= xMin && sx <= xMax && sy >= yMin && sy <= yMax) {
              isTouchingBtn = true;
              break;
            }
          }
          if (isTouchingBtn) break;
        }
      }

      if (isTouchingBtn) {
        portalEffectBtn.classList.add('is-hovered');
        if (!dwellTriggerStartTime) dwellTriggerStartTime = performance.now();
        const elapsed = performance.now() - dwellTriggerStartTime;
        const progress = Math.min(1, elapsed / TRIGGER_DWELL_MS);

        setDwellRingProgress(effectBtnDwellRing, RING_TRIGGER_CIRC, progress);

        if (progress >= 1) {
          dwellTriggerStartTime = null;
          setDwellRingProgress(effectBtnDwellRing, RING_TRIGGER_CIRC, 0);
          this.openEffectModal(carouselEffects, carouselEffects[carouselActiveIndex]?.id);
          this.toast('⚡ Tampilan Pilih Efek 3D dibuka!');
        }
      } else {
        portalEffectBtn.classList.remove('is-hovered');
        dwellTriggerStartTime = null;
        setDwellRingProgress(effectBtnDwellRing, RING_TRIGGER_CIRC, 0);
      }
    },

    /**
     * Handles hand touch & sliding interactions inside the full-screen 3D holographic deck:
     * - Zone 1: Close button hover (fast clean return)
     * - Zone 2: Instant Select button hover (immediate commit, NO loading circle!)
     * - Zone 3: 3D Coverflow drag (glides cards horizontally in 3D cylindrical perspective)
     *
     * @param {Array<Array<{x:number, y:number, z:number}>>} multiHandLandmarks
     * @param {number} [canvasW]
     * @param {number} [canvasH]
     */
    updateEffectModalHand(multiHandLandmarks = [], canvasW = 640, canvasH = 360) {
      if (!isEffectModalOpen || !cameraFrame) return;

      const frameRect = cameraFrame.getBoundingClientRect();
      const modalRect = effectModalBackdrop
        ? effectModalBackdrop.getBoundingClientRect()
        : frameRect;

      // Find primary touch point
      let touchPoint = null;
      if (Array.isArray(multiHandLandmarks) && multiHandLandmarks.length > 0) {
        for (const hand of multiHandLandmarks) {
          if (!hand || hand.length < 9) continue;
          const touchCandidateIndices = [8, 12, 4, 9, 0];
          for (const idx of touchCandidateIndices) {
            const pt = hand[idx];
            if (pt) {
              touchPoint = { sx: 1 - pt.x, sy: pt.y };
              break;
            }
          }
          if (touchPoint) break;
        }
      }

      // No hand in view: snap and relax
      if (!touchPoint) {
        if (modalTouchCursor) modalTouchCursor.classList.remove('visible');
        dwellSelectStartTime = null;
        dwellCloseStartTime  = null;
        lastModalHandX       = null;
        if (effectSelectBtn) effectSelectBtn.classList.remove('is-hovered');
        if (modalCloseBtn)   modalCloseBtn.classList.remove('is-hovered');

        // Snap to nearest card
        carouselTargetScroll = Math.max(0, Math.min(carouselEffects.length - 1, Math.round(carouselCurrentScroll)));
        carouselCurrentScroll += (carouselTargetScroll - carouselCurrentScroll) * 0.18;
        updateCarouselDOM();
        return;
      }

      // Position holographic cursor relative to screen
      const screenPixelX = frameRect.left + touchPoint.sx * frameRect.width;
      const screenPixelY = frameRect.top + touchPoint.sy * frameRect.height;

      if (modalTouchCursor) {
        modalTouchCursor.style.left = `${screenPixelX.toFixed(1)}px`;
        modalTouchCursor.style.top  = `${screenPixelY.toFixed(1)}px`;
        modalTouchCursor.classList.add('visible');
      }

      const selectRect = effectSelectBtn ? effectSelectBtn.getBoundingClientRect() : null;
      const closeRect  = modalCloseBtn ? modalCloseBtn.getBoundingClientRect() : null;

      // Active center card and its dedicated select button (centered in camera view)
      const activeCard    = carouselPills[carouselActiveIndex];
      const cardSelectBtn = activeCard ? activeCard.querySelector('.card-select-btn') : null;
      const cardBtnRect   = cardSelectBtn ? cardSelectBtn.getBoundingClientRect() : null;

      // ── ZONE 1: Close Button Hover ──────────────────────────
      const isOverClose = closeRect &&
        screenPixelX >= closeRect.left - 14 && screenPixelX <= closeRect.right + 14 &&
        screenPixelY >= closeRect.top - 14 && screenPixelY <= closeRect.bottom + 14;

      // ── ZONE 2: Instant Select Action Button Hover (ON CARD OR FOOTER) ──
      const isOverCardBtn = cardBtnRect &&
        screenPixelX >= cardBtnRect.left - 20 && screenPixelX <= cardBtnRect.right + 20 &&
        screenPixelY >= cardBtnRect.top - 18 && screenPixelY <= cardBtnRect.bottom + 18;

      const isOverFooterSelect = selectRect &&
        screenPixelX >= selectRect.left - 16 && screenPixelX <= selectRect.right + 16 &&
        screenPixelY >= selectRect.top - 16 && screenPixelY <= selectRect.bottom + 16;

      const isOverSelect = isOverCardBtn || isOverFooterSelect;

      if (isOverClose) {
        lastModalHandX = null;
        modalCloseBtn.classList.add('is-hovered');
        if (cardSelectBtn) cardSelectBtn.classList.remove('is-hovered');
        if (effectSelectBtn) effectSelectBtn.classList.remove('is-hovered');
        dwellSelectStartTime = null;

        if (!dwellCloseStartTime) dwellCloseStartTime = performance.now();
        if (performance.now() - dwellCloseStartTime >= CLOSE_DEBOUNCE_MS) {
          this.closeEffectModal();
          return;
        }
      } else if (isOverSelect) {
        // Instant select on hover/point on the active effect card or footer button!
        lastModalHandX = null;
        if (isOverCardBtn && cardSelectBtn) cardSelectBtn.classList.add('is-hovered');
        if (effectSelectBtn) effectSelectBtn.classList.add('is-hovered');
        if (modalCloseBtn) modalCloseBtn.classList.remove('is-hovered');
        dwellCloseStartTime = null;

        if (!dwellSelectStartTime) dwellSelectStartTime = performance.now();
        if (performance.now() - dwellSelectStartTime >= SELECT_DEBOUNCE_MS) {
          const chosenIdx = Math.max(0, Math.min(carouselEffects.length - 1, Math.round(carouselCurrentScroll)));
          const chosenEff = carouselEffects[chosenIdx];
          if (chosenEff) {
            if (effectBtnCurrentName) effectBtnCurrentName.textContent = chosenEff.label;
            if (effectSelectHandler) effectSelectHandler(chosenEff, chosenIdx);
            this.toast(`⚡ Efek Diaktifkan: ${chosenEff.label}`);
          }
          this.closeEffectModal();
          return;
        }
      } else {
        dwellSelectStartTime = null;
        dwellCloseStartTime  = null;
        if (cardSelectBtn)   cardSelectBtn.classList.remove('is-hovered');
        if (effectSelectBtn) effectSelectBtn.classList.remove('is-hovered');
        if (modalCloseBtn)   modalCloseBtn.classList.remove('is-hovered');

        // ── ZONE 3: 3D Coverflow Drag Zone ─────────────────────
        // Swiping hand horizontally glides cards smoothly in 3D
        const isWithinStage = selectRect
          ? (screenPixelY >= modalRect.top + 50 && screenPixelY <= selectRect.top - 10)
          : (screenPixelY >= modalRect.top + 50 && screenPixelY <= modalRect.bottom - 60);

        if (isWithinStage) {
          if (lastModalHandX === null) {
            lastModalHandX = touchPoint.sx;
          } else {
            const dx = touchPoint.sx - lastModalHandX;
            lastModalHandX = touchPoint.sx;

            // Deadzone to prevent hand tremor from jittering cards
            if (Math.abs(dx) > 0.003) {
              const deltaCards = dx * 5.4;
              carouselTargetScroll = Math.max(0, Math.min(carouselEffects.length - 1, carouselTargetScroll + deltaCards));
            }
          }
        } else {
          lastModalHandX = null;
          carouselTargetScroll = Math.max(0, Math.min(carouselEffects.length - 1, Math.round(carouselCurrentScroll)));
        }
      }

      // Smooth exponential easing (lerp) towards target
      carouselCurrentScroll += (carouselTargetScroll - carouselCurrentScroll) * 0.18;
      if (Math.abs(carouselTargetScroll - carouselCurrentScroll) < 0.003) {
        carouselCurrentScroll = carouselTargetScroll;
      }

      updateCarouselDOM();
    },

    // ── Backward-compatible Aliases ──────────────────────────

    showEffectPicker(effects, activeId) {
      this.showPortalEffectButton(effects, activeId);
    },

    hideEffectPicker() {
      this.hidePortalEffectButton();
      this.closeEffectModal();
    },

    updateEffectPickerHand(multiHandLandmarks, canvasW, canvasH) {
      if (isEffectModalOpen) {
        this.updateEffectModalHand(multiHandLandmarks, canvasW, canvasH);
      } else {
        this.updateEffectTriggerHand(multiHandLandmarks, canvasW, canvasH);
      }
    },

    setEffectPickerIndex(index) {
      if (carouselEffects.length === 0) return;
      const clamped = Math.max(0, Math.min(carouselEffects.length - 1, index));
      carouselTargetScroll  = clamped;
      carouselActiveIndex   = clamped;
      carouselCurrentScroll = clamped;
      updateCarouselDOM();
    },

    setEffectPickerSelected(index) {
      this.setEffectPickerIndex(index);
    },

    setEffectPickerFocus(index) {
      this.setEffectPickerIndex(index);
    },

    setEffectPickerCursor() {},

    // ── Flash ────────────────────────────────────────────────

    flash() {
      triggerFlash(flashOverlay);
    },

    // ── Gallery ──────────────────────────────────────────────

    /** @param {string} dataUrl */
    addPhoto(dataUrl) {
      photoCount += 1;
      galleryEmpty.style.display = 'none';
      galleryStrip.prepend(makeThumb(dataUrl, photoCount));
    },

    // ── Toast ────────────────────────────────────────────────

    /** @param {string} message */
    toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
    },
  };
};
