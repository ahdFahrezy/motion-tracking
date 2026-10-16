/**
 * Test script to simulate 2-hand poses and verify dynamic rail ordering
 * for twisted portals (like in the reference photo).
 */

const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

const segmentsIntersect = (p1, p2, p3, p4) => {
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
};

const polygonArea = (pts) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
};

// Case 1: Reference image pose (Twisted diagonal portal)
// Hand L (bottom-left): index points up-right, thumb points down
const L_IDX_diag = { x: 180, y: 500, label: 'L-IDX' };
const L_THM_diag = { x: 140, y: 560, label: 'L-THM' };

// Hand R (top-right): index points down-left, thumb points up
const R_IDX_diag = { x: 480, y: 260, label: 'R-IDX' };
const R_THM_diag = { x: 520, y: 180, label: 'R-THM' };

console.log('--- TEST CASE 1: Diagonal Twist Pose ---');
const oldCorners1 = [L_IDX_diag, R_IDX_diag, R_THM_diag, L_THM_diag];
const oldArea1 = Math.abs(polygonArea(oldCorners1));
const oldCross1 = segmentsIntersect(L_IDX_diag, R_IDX_diag, R_THM_diag, L_THM_diag);
console.log('Old config [L_IDX, R_IDX, R_THM, L_THM]:');
console.log('  Rails intersect?', oldCross1);
console.log('  Area:', oldArea1);

// New dynamic ordering
function orderPortalBandCorners(L_IDX, L_THM, R_IDX, R_THM) {
  // Option 1: Direct rails (L_IDX -> R_IDX) and (L_THM -> R_THM)
  // Polygon: [L_IDX, R_IDX, R_THM, L_THM]
  const cross1 = segmentsIntersect(L_IDX, R_IDX, L_THM, R_THM);
  const area1  = Math.abs(polygonArea([L_IDX, R_IDX, R_THM, L_THM]));

  // Option 2: Alternate rails (L_IDX -> R_THM) and (L_THM -> R_IDX)
  // Polygon: [L_IDX, R_THM, R_IDX, L_THM]
  const cross2 = segmentsIntersect(L_IDX, R_THM, L_THM, R_IDX);
  const area2  = Math.abs(polygonArea([L_IDX, R_THM, R_IDX, L_THM]));

  if (cross1 && !cross2) {
    return { corners: [L_IDX, R_THM, R_IDX, L_THM], selected: 'alternate', area: area2 };
  } else if (!cross1 && cross2) {
    return { corners: [L_IDX, R_IDX, R_THM, L_THM], selected: 'direct', area: area1 };
  } else {
    // If both or neither intersect mathematically, pick the one with larger unpinched area
    if (area2 > area1) {
      return { corners: [L_IDX, R_THM, R_IDX, L_THM], selected: 'alternate_max_area', area: area2 };
    }
    return { corners: [L_IDX, R_IDX, R_THM, L_THM], selected: 'direct_max_area', area: area1 };
  }
}

const newResult1 = orderPortalBandCorners(L_IDX_diag, L_THM_diag, R_IDX_diag, R_THM_diag);
console.log('New dynamic config:');
console.log('  Selected:', newResult1.selected);
console.log('  Area:', newResult1.area);
console.log('  Corners:', newResult1.corners.map(c => c.label).join(' -> '));

// Case 2: Normal horizontal rectangle pose
console.log('\n--- TEST CASE 2: Normal Horizontal Pose ---');
const L_IDX_norm = { x: 150, y: 200, label: 'L-IDX' };
const L_THM_norm = { x: 150, y: 350, label: 'L-THM' };
const R_IDX_norm = { x: 450, y: 200, label: 'R-IDX' };
const R_THM_norm = { x: 450, y: 350, label: 'R-THM' };

const newResult2 = orderPortalBandCorners(L_IDX_norm, L_THM_norm, R_IDX_norm, R_THM_norm);
console.log('New dynamic config:');
console.log('  Selected:', newResult2.selected);
console.log('  Area:', newResult2.area);
console.log('  Corners:', newResult2.corners.map(c => c.label).join(' -> '));

// Case 3: Inverted / Upside Down pose
console.log('\n--- TEST CASE 3: Inverted / Upside Down Pose ---');
const L_IDX_inv = { x: 150, y: 350, label: 'L-IDX' };
const L_THM_inv = { x: 150, y: 200, label: 'L-THM' };
const R_IDX_inv = { x: 450, y: 200, label: 'R-IDX' };
const R_THM_inv = { x: 450, y: 350, label: 'R-THM' };

// Case 4: Opposite Diagonal Pose (top-left hand to bottom-right hand)
console.log('\n--- TEST CASE 4: Opposite Diagonal Pose ---');
const L_IDX_op = { x: 180, y: 180, label: 'L-IDX' };
const L_THM_op = { x: 140, y: 260, label: 'L-THM' };
const R_IDX_op = { x: 480, y: 500, label: 'R-IDX' };
const R_THM_op = { x: 520, y: 440, label: 'R-THM' };

const newResult4 = orderPortalBandCorners(L_IDX_op, L_THM_op, R_IDX_op, R_THM_op);
console.log('New dynamic config:');
console.log('  Selected:', newResult4.selected);
console.log('  Area:', newResult4.area);
console.log('  Corners:', newResult4.corners.map(c => c.label).join(' -> '));

// Case 5: Elongated / Very Long Portal (span > 500px)
console.log('\n--- TEST CASE 5: Very Long Stretched Portal ---');
const L_IDX_long = { x: 60, y: 520, label: 'L-IDX' };
const L_THM_long = { x: 40, y: 570, label: 'L-THM' };
const R_IDX_long = { x: 600, y: 120, label: 'R-IDX' };
const R_THM_long = { x: 620, y: 70,  label: 'R-THM' };

// Case 6: Vertical Hands (one hand at top, one hand at bottom)
console.log('\n--- TEST CASE 6: Vertical Stacked Hands ---');
const L_IDX_vert = { x: 300, y: 150, label: 'L-IDX' };
const L_THM_vert = { x: 340, y: 150, label: 'L-THM' };
const R_IDX_vert = { x: 300, y: 450, label: 'R-IDX' };
const R_THM_vert = { x: 340, y: 450, label: 'R-THM' };

const newResult6 = orderPortalBandCorners(L_IDX_vert, L_THM_vert, R_IDX_vert, R_THM_vert);
console.log('New dynamic config:');
console.log('  Selected:', newResult6.selected);
console.log('  Area:', newResult6.area);
console.log('  Corners:', newResult6.corners.map(c => c.label).join(' -> '));


