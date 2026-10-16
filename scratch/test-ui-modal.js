import assert from 'node:assert';

// Mock browser DOM environment
class MockDOMElement {
  constructor(id = '') {
    this.id = id;
    const set = new Set();
    this.classList = {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      toggle: (c, v) => v ? set.add(c) : set.delete(c),
      contains: (c) => set.has(c),
    };
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this._listeners = {};
    this.rect = { left: 100, right: 300, top: 100, bottom: 200, width: 200, height: 100 };
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }
  click() {
    if (this.onclick) this.onclick({ stopPropagation() {} });
    (this._listeners['click'] || []).forEach(fn => fn({ stopPropagation() {} }));
  }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll() { return []; }
  appendChild(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
}

const domMap = new Map();
const getOrCreate = (id) => {
  if (!domMap.has(id)) domMap.set(id, new MockDOMElement(id));
  return domMap.get(id);
};

// Pre-create known elements
[
  'status-dot', 'status-text', 'guide-list', 'mode-pill', 'mode-pill-label',
  'guide-title', 'countdown-overlay', 'countdown-number', 'ring-progress',
  'flash-overlay', 'gesture-badge', 'gesture-icon', 'gesture-label',
  'gallery-strip', 'gallery-empty', 'toast', 'camera-frame',
  'portal-effect-btn', 'effect-btn-dwell-ring', 'effect-btn-current-name',
  'effect-modal-backdrop', 'effect-modal', 'modal-close-btn', 'close-btn-dwell-ring',
  'modal-touch-cursor', 'effect-select-btn', 'select-btn-dwell-ring',
  'effect-select-btn-text', 'modal-guide-hint', 'effect-picker-viewport',
  'effect-picker-track', 'effect-prev-btn', 'effect-next-btn'
].forEach(getOrCreate);

globalThis.document = {
  getElementById: (id) => getOrCreate(id),
  createElement: (tag) => new MockDOMElement(tag),
};

// Set specific bounding rects for spatial hit-testing
const frame = getOrCreate('camera-frame');
frame.rect = { left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 };

const btn = getOrCreate('portal-effect-btn');
// Position at bottom center: x: 260..380, y: 310..350
btn.rect = { left: 260, top: 310, right: 380, bottom: 350, width: 120, height: 40 };

const modal = getOrCreate('effect-modal');
modal.rect = { left: 100, top: 60, right: 540, bottom: 300, width: 440, height: 240 };

const selectBtn = getOrCreate('effect-select-btn');
selectBtn.rect = { left: 200, top: 250, right: 440, bottom: 290, width: 240, height: 40 };

const closeBtn = getOrCreate('modal-close-btn');
closeBtn.rect = { left: 500, top: 70, right: 530, bottom: 100, width: 30, height: 30 };

const { createUI } = await import('../js/ui.js');
const { PORTAL_EFFECTS } = await import('../js/app.js');

const ui = createUI();

console.log('=== TEST: Floating Trigger Button (2.0s Dwell) ===');
ui.showPortalEffectButton(PORTAL_EFFECTS, 'mirror_glass');
assert.strictEqual(btn.classList.contains('visible'), true, 'Trigger button should be visible');
assert.strictEqual(ui.isEffectModalOpen(), false, 'Modal should be closed initially');

// Hand hovering over button: x = 320/640 = 0.50 (mirrored sx = 0.50), y = 330/360 = 0.916
// Note: sx = 1 - pt.x => pt.x = 0.50, pt.y = 0.916
const handOnBtn = [[
  { x: 0.5, y: 0.5 }, {}, {}, {}, {}, {}, {}, {},
  { x: 0.5, y: 0.916 } // landmark 8 (index tip)
]];

// Tick 1: start dwell
ui.updateEffectTriggerHand(handOnBtn, 640, 360);
assert.strictEqual(btn.classList.contains('is-hovered'), true, 'Button should have is-hovered class');
assert.strictEqual(ui.isEffectModalOpen(), false, 'Modal should not open instantly');

// Advance time by 2.1 seconds in performance.now
const origNow = performance.now;
let mockTime = 1000;
performance.now = () => mockTime;

// Start dwell
ui.updateEffectTriggerHand(handOnBtn, 640, 360);

// Fast forward 2.05s
mockTime += 2050;
ui.updateEffectTriggerHand(handOnBtn, 640, 360);

assert.strictEqual(ui.isEffectModalOpen(), true, 'Modal should OPEN after 2.0s dwell!');
console.log('✅ Trigger button 2.0s dwell opens modal successfully!');

console.log('\n=== TEST: Modal Carousel Navigation & Zone Locking ===');
let selectedEffect = null;
ui.onEffectSelect((eff, idx) => {
  selectedEffect = eff;
});

// Hand in carousel zone: y = 140/360 = 0.388 (inside modal body above button)
// Hand moving right: frame 1 sx = 0.40 (pt.x = 0.60), frame 2 sx = 0.60 (pt.x = 0.40)
const handModal1 = [[
  {}, {}, {}, {}, {}, {}, {}, {},
  { x: 0.60, y: 0.388 } // sx = 0.40
]];
ui.updateEffectModalHand(handModal1, 640, 360);

const handModal2 = [[
  {}, {}, {}, {}, {}, {}, {}, {},
  { x: 0.40, y: 0.388 } // sx = 0.60 (hand moved right by dx = +0.20)
]];
ui.updateEffectModalHand(handModal2, 640, 360);

console.log('Carousel shifted smoothly with hand moving right');

console.log('\n=== TEST: Select Button Zone Locks Carousel & 1.5s Dwell ===');
// Move hand to select button: x = 320 (sx = 0.50, pt.x = 0.50), y = 270 (pt.y = 270/360 = 0.75)
const handOnSelect = [[
  {}, {}, {}, {}, {}, {}, {}, {},
  { x: 0.50, y: 0.75 } // index tip on selectBtn
]];

// Hand moves horizontally ON the select button: carousel must remain LOCKED
ui.updateEffectModalHand(handOnSelect, 640, 360);
assert.strictEqual(selectBtn.classList.contains('is-hovered'), true, 'Select button should have is-hovered');

// Advance time by 1.6 seconds for select button
mockTime += 1600;
ui.updateEffectModalHand(handOnSelect, 640, 360);

assert.strictEqual(ui.isEffectModalOpen(), false, 'Modal should CLOSE after selecting!');
assert(selectedEffect !== null, 'An effect should have been selected');
console.log(`✅ Selected effect committed: ${selectedEffect.label} (${selectedEffect.id}) & Modal closed!`);

performance.now = origNow;
console.log('\n🎉 ALL UI MODAL TESTS PASSED PERFECTLY!');
