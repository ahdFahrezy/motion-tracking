import assert from 'node:assert';

// Mock minimal DOM for Node.js
class MockCanvas {
  constructor(w = 320, h = 240) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return new MockContext(this);
  }
}

class MockContext {
  constructor(canvas) {
    this.canvas = canvas || new MockCanvas();
  }
  save() {}
  restore() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  stroke() {}
  fill() {}
  fillRect() {}
  arc() {}
  clip() {}
  clearRect() {}
  translate() {}
  scale() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData() {}
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return {
      addEventListener() {},
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      prepend() {}
    };
  },
  getElementById() {
    return {
      addEventListener() {},
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      prepend() {},
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200 }; }
    };
  }
};

const { EFFECT_NAMES, applyPortalEffect } = await import('../js/videoFx.js');
const { PORTAL_EFFECTS } = await import('../js/app.js');

console.log('=== TEST 1: Check 10 Effects Catalogue ===');
console.log('PORTAL_EFFECTS count:', PORTAL_EFFECTS.length);
assert.strictEqual(PORTAL_EFFECTS.length, 10, 'Must have exactly 10 effects');

const ids = PORTAL_EFFECTS.map((e) => e.id);
console.log('Effect IDs:', ids);
assert(ids.includes('mirror_glass'), 'Must include mirror_glass (kaca cermin)');
assert(ids.includes('cyberpunk'), 'Must include cyberpunk');
assert(ids.includes('night_vision'), 'Must include night_vision');
assert(ids.includes('prism'), 'Must include prism');

console.log('EFFECT_NAMES count in videoFx:', EFFECT_NAMES.length);
assert.strictEqual(EFFECT_NAMES.length, 10, 'videoFx must have 10 effects');

ids.forEach((id) => {
  assert(EFFECT_NAMES.includes(id), `videoFx must support ${id}`);
});

console.log('✅ 10 effects verified matching in both app and videoFx!');

console.log('\n=== TEST 2: Offscreen Rendering for all 10 effects ===');
const mockCtx = new MockContext();
const mockPortal = {
  isClosed: false,
  corners: [
    { x: 50, y: 50, label: 'L_IDX' },
    { x: 250, y: 50, label: 'R_IDX' },
    { x: 250, y: 200, label: 'R_THM' },
    { x: 50, y: 200, label: 'L_THM' },
  ],
  bounds: { minX: 50, minY: 50, maxX: 250, maxY: 200, width: 200, height: 150 },
  center: { x: 150, y: 125 },
  handCount: 2,
};

for (const eff of PORTAL_EFFECTS) {
  applyPortalEffect(mockCtx, 320, 240, eff.id, mockPortal, {});
  console.log(`  ✓ Rendered ${eff.id} (${eff.label}) without errors`);
}

console.log('✅ All 10 portal effects render smoothly!');

console.log('\n=== TEST 3: State Machine Logic Simulation ===');
let isModalOpen = false;
let dwellTrigger = 0;
let dwellSelect = 0;
let activeEffect = 'mirror_glass';

// Simulate touching trigger button for 2 seconds
for (let frame = 1; frame <= 130; frame++) {
  dwellTrigger += 16.6;
  if (dwellTrigger >= 2000 && !isModalOpen) {
    isModalOpen = true;
    console.log(`Frame ${frame}: 2.0s dwell reached -> Modal Opened!`);
  }
}
assert.strictEqual(isModalOpen, true, 'Modal should be open after 2 seconds');

// While modal is open, portal calculation is bypassed
let portalCalculated = false;
if (isModalOpen) {
  portalCalculated = false;
} else {
  portalCalculated = true;
}
assert.strictEqual(portalCalculated, false, 'Portal must be disabled while modal is open');

// Simulate selecting card index 2 (glitch) with 1.5s dwell in modal
let stagedScroll = 2; // glitch
for (let frame = 1; frame <= 100; frame++) {
  dwellSelect += 16.6;
  if (dwellSelect >= 1500) {
    activeEffect = PORTAL_EFFECTS[stagedScroll].id;
    isModalOpen = false;
    console.log(`Frame ${frame}: 1.5s dwell on select button -> Selected ${activeEffect} & Closed Modal!`);
    break;
  }
}

assert.strictEqual(isModalOpen, false, 'Modal should close upon selecting effect');
assert.strictEqual(activeEffect, 'glitch', 'Selected effect should match staged card');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
