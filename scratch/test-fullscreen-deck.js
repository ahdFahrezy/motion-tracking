import assert from 'node:assert';

// Mock minimal DOM for Node.js testing
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
    // Generate mock pixel data
    const data = new Uint8ClampedArray(w * h * 4);
    // Fill with sample gradients: shadows, midtones, highlights
    for (let i = 0; i < data.length; i += 4) {
      const px = (i / 4) % w;
      const py = Math.floor((i / 4) / w);
      const val = Math.floor((px / w) * 255);
      data[i] = val;     // R
      data[i + 1] = val; // G
      data[i + 2] = val; // B
      data[i + 3] = 255; // A
    }
    return { data };
  }
  putImageData(imgData) {
    this.lastPutData = imgData;
  }
}

const elementsMap = new Map();

function createMockElement(tag = 'div') {
  let _html = '';
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); },
      toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    children: [],
    dataset: {},
    appendChild(child) { this.children.push(child); return child; },
    prepend(child) { this.children.unshift(child); return child; },
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k]; },
    addEventListener(evt, fn) { this['on' + evt] = fn; },
    get innerHTML() { return _html; },
    set innerHTML(val) {
      _html = val;
      this.children = [];
      if (typeof val === 'string' && val.includes('deck-card effect-pill')) {
        const matches = val.split(/<div class="deck-card effect-pill"/g).slice(1);
        matches.forEach((chunk, i) => {
          const card = createMockElement('div');
          card.classList.add('deck-card', 'effect-pill');
          card.dataset.idx = String(i);
          const canvas = new MockCanvas(280, 180);
          canvas.classList = {
            contains(c) { return c === 'card-preview-canvas'; }
          };
          card.appendChild(canvas);
          const btn = createMockElement('button');
          btn.classList.add('card-select-btn');
          btn.getBoundingClientRect = () => ({
            left: 280, right: 520, top: 380, bottom: 424, width: 240, height: 44
          });
          card.appendChild(btn);
          this.children.push(card);
        });
      }
    },
    querySelector(sel) {
      if (sel === '.card-preview-canvas') {
        return this.children.find(c => c.tagName === 'CANVAS' || c.classList?.contains('card-preview-canvas'));
      }
      if (sel === '.card-select-btn') {
        return this.children.find(c => c.tagName === 'BUTTON' || c.classList?.contains('card-select-btn'));
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.deck-card' || sel === '.effect-pill') {
        return this.children.filter(c => c.classList?.contains('deck-card'));
      }
      return [];
    },
    getBoundingClientRect() {
      return { left: 100, right: 700, top: 50, bottom: 550, width: 600, height: 500 };
    }
  };
  return el;
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return createMockElement(tag);
  },
  getElementById(id) {
    if (!elementsMap.has(id)) {
      elementsMap.set(id, createMockElement('div'));
    }
    return elementsMap.get(id);
  }
};

const { applyPortalEffect, applyEffect } = await import('../js/videoFx.js');
const { PORTAL_EFFECTS } = await import('../js/app.js');
const { createUI } = await import('../js/ui.js');

console.log('=== TEST 1: Silver Chrome Mirror Effect Math & Inky Base ===');
{
  const w = 100, h = 100;
  const ctx = new MockContext(new MockCanvas(w, h));
  
  // Call applyEffect for mirror_glass
  applyEffect(ctx, w, h, 'mirror_glass');
  assert(ctx.lastPutData, 'Must put processed image data');
  const d = ctx.lastPutData.data;

  // Let's verify shadow range (< 75 luma) is deeply crushed into dark/black
  // Check the first pixel (val = 0)
  assert.strictEqual(d[0] < 10, true, 'Zero-luma input should be deep inky black (< 10)');
  assert.strictEqual(d[1] < 10, true, 'Zero-luma green should be deep inky black (< 10)');
  assert.strictEqual(d[2] < 10, true, 'Zero-luma blue should be deep inky black (< 10)');

  // Check highlight range (val = 220) -> should be bright metallic silver (R ≈ G ≈ B > 180)
  // Pixel at px = 86 => val = 219
  const highlightIdx = (86 * 4);
  const rHigh = d[highlightIdx];
  const gHigh = d[highlightIdx + 1];
  const bHigh = d[highlightIdx + 2];
  console.log(`Highlight pixel RGB: (${rHigh}, ${gHigh}, ${bHigh})`);
  assert(rHigh > 160 && gHigh > 160 && bHigh > 160, 'Highlight should be high-luminance metallic silver');
  assert(Math.abs(rHigh - gHigh) < 25, 'Silver highlights should have balanced monochrome tone, not blue tint');

  console.log('✅ Obsidian Silver Mirror math successfully tested with deep black base & metallic silver reflections!');
}

console.log('\n=== TEST 2: Full-screen 3D Deck Creation & Live Preview Box ===');
{
  const ui = createUI();
  let committedEffect = null;
  ui.onEffectSelect((eff) => {
    committedEffect = eff;
  });

  ui.openEffectModal(PORTAL_EFFECTS, 'mirror_glass');
  
  const track = document.getElementById('effect-picker-track');
  assert.strictEqual(track.children.length, 10, 'Track must contain all 10 effect cards');

  // Verify cards have live preview canvas and specs
  track.children.forEach((card, idx) => {
    assert(card.classList.contains('deck-card'), 'Card must have deck-card class');
    const canvas = card.querySelector('.card-preview-canvas');
    assert(canvas, `Card ${idx} must contain card-preview-canvas`);
  });
  console.log('✅ All 10 3D cards built with live preview boxes and spec meters!');

  // Test live render previews
  const mockVideo = { readyState: 4, videoWidth: 640, videoHeight: 360 };
  ui.renderEffectDeckPreviews(mockVideo);
  console.log('✅ renderEffectDeckPreviews executed without error');
}

console.log('\n=== TEST 3: Instant Selection (NO loading dwell circle) ===');
{
  const ui = createUI();
  let selectedEff = null;
  ui.onEffectSelect((eff) => {
    selectedEff = eff;
  });

  ui.openEffectModal(PORTAL_EFFECTS, 'thermal');

  const selectBtn = document.getElementById('effect-select-btn');
  // Click select button
  selectBtn.onclick({ stopPropagation() {} });

  assert.strictEqual(selectedEff?.id, 'thermal', 'Instant click must commit effect without any loading wait!');
  console.log('✅ Instant selection works immediately on button click!');

  // Also verify clicking directly on the card itself selects it!
  let cardSelectedEff = null;
  ui.onEffectSelect((eff) => { cardSelectedEff = eff; });
  ui.openEffectModal(PORTAL_EFFECTS, 'glitch');
  const track = document.getElementById('effect-picker-track');
  const glitchCard = track.children[2]; // glitch
  glitchCard.onclick({ stopPropagation() {} });
  assert.strictEqual(cardSelectedEff?.id, 'glitch', 'Clicking card directly must select effect!');
  console.log('✅ Direct selection by clicking card verified!');
}

console.log('\n=== TEST 4: Gesture Navigation & On-Card Instant Select Hover ===');
{
  const ui = createUI();
  let selectedEff = null;
  ui.onEffectSelect((eff) => {
    selectedEff = eff;
  });

  ui.openEffectModal(PORTAL_EFFECTS, 'mirror_glass');

  // Set element rects for simulation
  const selectBtn = document.getElementById('effect-select-btn');
  selectBtn.getBoundingClientRect = () => ({ left: 250, right: 450, top: 480, bottom: 530, width: 200, height: 50 });

  const closeBtn = document.getElementById('modal-close-btn');
  closeBtn.getBoundingClientRect = () => ({ left: 740, right: 780, top: 20, bottom: 60, width: 40, height: 40 });

  const cameraFrame = document.getElementById('camera-frame');
  cameraFrame.getBoundingClientRect = () => ({ left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 });

  // Point at active card's select button situated in center of screen: x = 400, y = 400
  // touchPoint: sx = 400/800 = 0.5, sy = 400/600 = 0.6667
  // pt.x = 1 - 0.5 = 0.5, pt.y = 0.6667
  const onCardHandPoint = [];
  while (onCardHandPoint.length < 9) onCardHandPoint.push({ x: 0.5, y: 0.6667, z: 0 });

  // First frame hover
  ui.updateEffectModalHand([onCardHandPoint], 800, 600);
  const track = document.getElementById('effect-picker-track');
  const activeCard = track.children[0];
  const cardBtn = activeCard.querySelector('.card-select-btn');
  assert(cardBtn.classList.contains('is-hovered'), 'On-card select button should be hovered in center of screen');

  // Advance time past SELECT_DEBOUNCE_MS (200ms)
  const now = performance.now();
  globalThis.performance = { now: () => now + 250 };

  ui.updateEffectModalHand([onCardHandPoint], 800, 600);
  assert(selectedEff !== null, 'Effect should be committed instantly upon pointing at on-card button!');
  console.log('✅ Ergonomic on-card hover select in screen center verified!');
}

console.log('\n🎉 ALL FULL-SCREEN DECK & OBSIDIAN SILVER MIRROR TESTS PASSED! 🎉');
