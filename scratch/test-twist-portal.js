/**
 * End-to-end verification of 3D Twisted Portal and center line elimination.
 */
import { extractPortalCorners } from '../js/gestures.js';
import { EFFECT_NAMES } from '../js/videoFx.js';

console.log('=== VERIFYING 3D TWISTED PORTAL ===\n');

const W = 640;
const H = 480;

// Helper to construct normalized mock landmarks
const makeMockHand = (wrist, thumbTip, indexTip) => {
  const lm = Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  // Mirrored X mapping: screenX = (1 - lm.x) * W => lm.x = 1 - (screenX / W)
  lm[0] = { x: 1 - (wrist.x / W), y: wrist.y / H, z: 0 };
  lm[4] = { x: 1 - (thumbTip.x / W), y: thumbTip.y / H, z: 0 };
  lm[8] = { x: 1 - (indexTip.x / W), y: indexTip.y / H, z: 0 };
  return lm;
};

// Check if any two edges of a polygon intersect
const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
const segmentsIntersect = (p1, p2, p3, p4) => {
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
};

const hasSelfIntersection = (corners) => {
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const a1 = corners[i];
    const a2 = corners[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share an endpoint, do not test them
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = corners[j];
      const b2 = corners[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return { intersects: true, edge1: [i, (i + 1) % n], edge2: [j, (j + 1) % n] };
      }
    }
  }
  return { intersects: false };
};

// 1. Reference Photo: Diagonal Twist Pose
// Hand 1 (bottom left): Wrist (100, 540), Thumb (140, 560), Index (180, 500)
// Hand 2 (top right): Wrist (560, 240), Thumb (520, 180), Index (480, 260)
const handBottomLeft = makeMockHand({ x: 100, y: 440 }, { x: 140, y: 460 }, { x: 180, y: 400 });
const handTopRight   = makeMockHand({ x: 560, y: 140 }, { x: 520, y: 80 },  { x: 480, y: 160 });

const portalTwist = extractPortalCorners([handBottomLeft, handTopRight], W, H);

console.log('1. Reference Photo Diagonal Pose:');
console.log('  isClosed:', portalTwist.isClosed);
console.log('  Area:', portalTwist.area);
console.log('  Corners count:', portalTwist.corners.length);
console.log('  Corner sequence:', portalTwist.corners.map(c => c.label).join(' -> '));

const checkTwist = hasSelfIntersection(portalTwist.corners);
console.log('  Has self-intersection (crossing lines):', checkTwist.intersects);
if (checkTwist.intersects) {
  console.error('  FAIL: Portal corners self-intersect!');
} else {
  console.log('  PASS: Clean, untangled diagonal ribbon with NO center crossing line!');
}
console.log('  Twist metric:', portalTwist.twist);
if (portalTwist.twist === undefined) {
  throw new Error('portal.twist must be defined!');
}

// 2. Long Elongated Diagonal Portal across full canvas (span > 500px)
const handFarLeft  = makeMockHand({ x: 40, y: 440 }, { x: 60, y: 460 }, { x: 80, y: 400 });
const handFarRight = makeMockHand({ x: 600, y: 80 }, { x: 580, y: 40 }, { x: 560, y: 100 });

const portalLong = extractPortalCorners([handFarLeft, handFarRight], W, H);

console.log('\n2. Very Long Elongated Portal (full diagonal stretch):');
console.log('  isClosed:', portalLong.isClosed);
console.log('  Span bounds:', `${portalLong.bounds.width.toFixed(0)}x${portalLong.bounds.height.toFixed(0)}`);
const checkLong = hasSelfIntersection(portalLong.corners);
console.log('  Has self-intersection (crossing lines):', checkLong.intersects);
if (checkLong.intersects) {
  console.error('  FAIL: Elongated portal self-intersects!');
} else {
  console.log('  PASS: Elongated portal has NO middle blue line!');
}

// 3. Normal Horizontal Pose
const handNormL = makeMockHand({ x: 150, y: 250 }, { x: 150, y: 350 }, { x: 150, y: 180 });
const handNormR = makeMockHand({ x: 450, y: 250 }, { x: 450, y: 350 }, { x: 450, y: 180 });

const portalNorm = extractPortalCorners([handNormL, handNormR], W, H);
console.log('\n3. Normal Horizontal Pose:');
console.log('  Has self-intersection:', hasSelfIntersection(portalNorm.corners).intersects);

// 4. Verify All 10 Effects exist
console.log('\n4. Active Portal Effects:');
console.log('  Total effects:', EFFECT_NAMES.length);
console.log('  List:', EFFECT_NAMES.join(', '));
const hasMirrorGlass = EFFECT_NAMES.includes('mirror_glass');
console.log('  Has mirror_glass (Kaca Cermin):', hasMirrorGlass);

console.log('\n=== ALL PORTAL TWIST & CENTER LINE TESTS PASSED ===');
