/**
 * @module modes
 * Deep module — pure state machine for the three application modes.
 *
 * Modes:
 *   idle   → waiting; user picks a mode with a hold gesture
 *   photo  → countdown + photo capture
 *   draw   → draw on canvas with fingertip
 *   effect → real-time video filter effects
 *
 * Mode entry gestures (from idle):
 *   '5'        → photo
 *   'love'     → draw
 *   'thumbsup' → effect
 *
 * Universal exit gesture (from any mode):
 *   'fist'     → back to idle
 *
 * Interface (small):
 *   createModeManager() → ModeManager
 *   manager.getMode()          → Mode
 *   manager.transition(gesture) → ModeEvent | null
 *   manager.reset()
 */

// ── Mode constants ───────────────────────────────────────────

/** @enum {string} */
export const MODE = Object.freeze({
  IDLE:   'idle',
  PHOTO:  'photo',
  DRAW:   'draw',
  EFFECT: 'effect',
});

// ── Mode entry / exit map ────────────────────────────────────

/** Maps gesture → target mode when in IDLE. */
const ENTRY_GESTURE = Object.freeze({
  '5':        MODE.PHOTO,
  '2':        MODE.DRAW,      // ✌️ Peace sign / 2 jari replaces love sign
  'peace':    MODE.DRAW,
  'thumbsup': MODE.EFFECT,
});

/** Gesture that exits any mode back to IDLE. */
const EXIT_GESTURE = 'fist';

// ── Public interface ─────────────────────────────────────────

/**
 * @typedef {'entered'|'exited'|'action'} ModeEventType
 *
 * @typedef {Object} ModeEvent
 * @property {ModeEventType} type
 * @property {string}        mode     - The active mode after transition
 * @property {string}        [from]   - Previous mode (for 'exited')
 * @property {string}        [gesture]- The gesture that caused an 'action'
 */

/**
 * @typedef {Object} ModeManager
 * @property {() => string}                 getMode
 * @property {(gesture: string) => ModeEvent | null} transition
 * @property {() => void}                   reset
 */

/**
 * Creates a mode state machine.
 *
 * @returns {ModeManager}
 */
export const createModeManager = () => {
  let current = MODE.IDLE;

  return {
    /** Returns the active mode string. */
    getMode: () => current,

    /**
     * Processes a confirmed gesture and returns a ModeEvent if
     * a state change or mode-specific action occurred, or null
     * if the gesture is irrelevant to the current state.
     *
     * @param {string} gesture - From classifyGesture()
     * @returns {ModeEvent | null}
     */
    transition(gesture) {
      // Universal exit: any mode → idle
      if (gesture === EXIT_GESTURE && current !== MODE.IDLE) {
        const from = current;
        current = MODE.IDLE;
        return { type: 'exited', mode: MODE.IDLE, from };
      }

      // In IDLE: check for mode-entry gestures
      if (current === MODE.IDLE) {
        const target = ENTRY_GESTURE[gesture];
        if (target) {
          current = target;
          return { type: 'entered', mode: current };
        }
        return null; // gesture not a mode-entry signal
      }

      // Inside a mode: pass gesture as an action for the mode to handle
      return { type: 'action', mode: current, gesture };
    },

    /** Hard-resets to IDLE (e.g. when hand is lost). */
    reset() {
      current = MODE.IDLE;
    },
  };
};

// ── Mode metadata for UI ─────────────────────────────────────

/**
 * Display config for each mode.
 * Used by ui.js to render mode badges and guide items.
 */
export const MODE_META = Object.freeze({
  [MODE.IDLE]: {
    label: 'Pilih Mode',
    color: 'var(--color-fg-muted)',
    guides: [
      { icon: '✋', name: '5 Jari (Open Palm)', desc: 'Masuk Mode Foto' },
      { icon: '✌️', name: '2 Jari (Peace Sign)',desc: 'Masuk Mode Gambar' },
      { icon: '👍', name: 'Thumbs Up',          desc: 'Masuk Mode Efek' },
    ],
  },
  [MODE.PHOTO]: {
    label: '📸 Mode Foto',
    color: 'var(--color-primary)',
    guides: [
      { icon: '☝️', name: '1 Jari',  desc: 'Countdown 1 detik' },
      { icon: '✌️', name: '2 Jari',  desc: 'Countdown 2 detik' },
      { icon: '🤟', name: '3 Jari',  desc: 'Countdown 3 detik' },
      { icon: '✋', name: '4 Jari',  desc: 'Countdown 4 detik' },
      { icon: '👊', name: 'Kepalan', desc: '← Keluar' },
    ],
  },
  [MODE.DRAW]: {
    label: '🎨 Mode Gambar',
    color: 'var(--color-draw)',
    guides: [
      { icon: '☝️', name: '1 Jari',     desc: 'Kuas putih kecil' },
      { icon: '✌️', name: '2 Jari',     desc: 'Kuas cyan medium' },
      { icon: '🤟', name: '3 Jari',     desc: 'Kuas pink besar' },
      { icon: '✋', name: '4–5 Jari',   desc: 'Angkat kuas (berhenti)' },
      { icon: '👍', name: 'Thumbs Up',  desc: 'Hapus kanvas' },
      { icon: '👊', name: 'Kepalan',    desc: '← Keluar' },
    ],
  },
  [MODE.EFFECT]: {
    label: '✨ Mode Portal 4 Titik',
    color: 'var(--color-effect)',
    guides: [
      { icon: '🪞', name: 'Kaca Cermin',    desc: 'Refleksi cermin & kilau kaca kromium' },
      { icon: '🔮', name: 'Negatif',        desc: 'Inversi warna neon cyber' },
      { icon: '⚡', name: 'Glitch RGB',     desc: 'Distorsi sinyal RGB aberration' },
      { icon: '👾', name: 'Pikselasi',      desc: 'Mosaik retro pixel 8-bit' },
      { icon: '🔥', name: 'Thermal Vision', desc: 'Sensor panas inframerah Predator' },
      { icon: '🔍', name: 'Zoom Lens 2x',   desc: 'Lensa telephoto magnifikasi 2x' },
      { icon: '🌆', name: 'Cyberpunk Neon', desc: 'Duotone magenta & cyan futuristik' },
      { icon: '🟢', name: 'Night Vision',   desc: 'Kamera malam taktis fosfor hijau' },
      { icon: '🎞️', name: 'Sepia Vintage',  desc: 'Nuansa film klasik & grain analog' },
      { icon: '🌈', name: 'Prisma Kaca',    desc: 'Dispersi pelangi & spektrum optik' },
      { icon: '🚪', name: 'Kembali',        desc: '← Klik untuk ke Menu Awal' },
    ],
  },
});
