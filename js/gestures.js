/**
 * @module gestures
 * Deep module — sole owner of MediaPipe landmark math.
 * Returns plain gesture strings; callers never see raw coordinates.
 *
 * Accuracy improvements over v1:
 *  - Thumb: distance-ratio test (scale-invariant, avoids x-axis drift)
 *  - Fingers: margin threshold (0.025) eliminates borderline false-positives
 *  - Love sign: stricter — requires BOTH middle AND ring to be deeply curled
 *  - Priority ordering prevents ambiguous overlaps
 *
 * Interface (small):
 *   classifyGesture(landmarks) → GestureResult | null
 */

// ── Landmark indices ─────────────────────────────────────────
const LM = Object.freeze({
  WRIST:        0,
  THUMB_CMC:    1,
  THUMB_MCP:    2,
  THUMB_IP:     3,
  THUMB_TIP:    4,
  INDEX_MCP:    5,
  INDEX_PIP:    6,
  INDEX_DIP:    7,
  INDEX_TIP:    8,
  MIDDLE_MCP:   9,
  MIDDLE_PIP:  10,
  MIDDLE_DIP:  11,
  MIDDLE_TIP:  12,
  RING_MCP:    13,
  RING_PIP:    14,
  RING_DIP:    15,
  RING_TIP:    16,
  PINKY_MCP:   17,
  PINKY_PIP:   18,
  PINKY_DIP:   19,
  PINKY_TIP:   20,
});

/** Finger descriptor: { tip, pip, mcp } for each non-thumb finger. */
const FINGERS = Object.freeze({
  index:  { tip: LM.INDEX_TIP,  pip: LM.INDEX_PIP,  mcp: LM.INDEX_MCP  },
  middle: { tip: LM.MIDDLE_TIP, pip: LM.MIDDLE_PIP, mcp: LM.MIDDLE_MCP },
  ring:   { tip: LM.RING_TIP,   pip: LM.RING_PIP,   mcp: LM.RING_MCP   },
  pinky:  { tip: LM.PINKY_TIP,  pip: LM.PINKY_PIP,  mcp: LM.PINKY_MCP  },
});

// ── Euclidean distance helper ────────────────────────────────

/**
 * @param {{ x:number, y:number }} a
 * @param {{ x:number, y:number }} b
 * @returns {number}
 */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── Thumb extension ──────────────────────────────────────────

/**
 * Scale-invariant thumb extension test.
 *
 * Checks if thumb is outstretched away from index knuckle, pinky knuckle,
 * or wrist. Far more robust across varied hand angles and camera perspectives.
 *
 * @param {Array<{x:number, y:number, z:number}>} lm
 * @returns {boolean}
 */
const isThumbExtended = (lm) => {
  const tipToIndex = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]);
  const mcpToIndex = dist(lm[LM.THUMB_MCP], lm[LM.INDEX_MCP]);

  const tipToPinky = dist(lm[LM.THUMB_TIP], lm[LM.PINKY_MCP]);
  const mcpToPinky = dist(lm[LM.THUMB_MCP], lm[LM.PINKY_MCP]);

  const tipToWrist = dist(lm[LM.THUMB_TIP], lm[LM.WRIST]);
  const mcpToWrist = dist(lm[LM.THUMB_MCP], lm[LM.WRIST]);

  return (
    tipToIndex > mcpToIndex * 1.15 ||
    tipToPinky > mcpToPinky * 1.05 ||
    tipToWrist > mcpToWrist * 1.15
  );
};

// ── Non-thumb finger extension ───────────────────────────────

/**
 * Rotation- and tilt-invariant finger extension test.
 *
 * A finger is extended if its fingertip is clearly farther from
 * the wrist than its PIP joint, or if its tip is vertically above
 * the PIP joint. This avoids false negatives when fingers spread outward
 * diagonally (e.g. pinky finger at a 45° angle in an open palm).
 *
 * @param {Array<{x:number, y:number, z:number}>} lm
 * @param {{ tip:number, pip:number, mcp:number }} finger
 * @returns {boolean}
 */
const isExtended = (lm, finger) => {
  // Check 1: Distance from wrist (rotation & tilt invariant)
  const tipToWrist = dist(lm[finger.tip], lm[LM.WRIST]);
  const pipToWrist = dist(lm[finger.pip], lm[LM.WRIST]);
  const isFarFromWrist = tipToWrist > pipToWrist * 1.08;

  // Check 2: Vertical orientation (for upright hands)
  const isUpright = lm[finger.pip].y - lm[finger.tip].y > 0.015;

  // Check 3: Distance from knuckle MCP
  const tipToMcp = dist(lm[finger.tip], lm[finger.mcp]);
  const pipToMcp = dist(lm[finger.pip], lm[finger.mcp]);
  const isFarFromMcp = tipToMcp > pipToMcp * 1.15;

  return (isFarFromWrist && isFarFromMcp) || isUpright;
};

/**
 * A finger is DEEPLY curled when the tip is below the MCP knuckle.
 * Used for stricter gesture checks (e.g., love sign).
 *
 * @param {Array<{x:number, y:number, z:number}>} lm
 * @param {{ tip:number, mcp:number }} finger
 * @returns {boolean}
 */
const isCurled = (lm, finger) =>
  lm[finger.tip].y > lm[finger.mcp].y ||
  dist(lm[finger.tip], lm[LM.WRIST]) < dist(lm[finger.pip], lm[LM.WRIST]);

/**
 * Count how many of the four non-thumb fingers are extended.
 *
 * @param {Array<{x,y,z}>} lm
 * @returns {number} 0–4
 */
const countExtended = (lm) =>
  Object.values(FINGERS).filter((f) => isExtended(lm, f)).length;

// ── Named gesture detectors ──────────────────────────────────

/**
 * Fist: all four fingers curled below their MCPs AND thumb not extended.
 */
const isFist = (lm) =>
  !isThumbExtended(lm) &&
  Object.values(FINGERS).every((f) => isCurled(lm, f));

/**
 * Thumbs-up: thumb extended, index and middle strictly curled, at least 3 fingers curled.
 * Tolerates natural pinky position so users don't fail detection.
 */
export const isThumbsUp = (lm) => {
  if (!isThumbExtended(lm)) return false;

  const indexCurled  = isCurled(lm, FINGERS.index);
  const middleCurled = isCurled(lm, FINGERS.middle);
  const ringCurled   = isCurled(lm, FINGERS.ring);
  const pinkyCurled  = isCurled(lm, FINGERS.pinky);

  if (!indexCurled || !middleCurled) return false;

  const curledCount = (indexCurled ? 1 : 0) + (middleCurled ? 1 : 0) +
                      (ringCurled ? 1 : 0) + (pinkyCurled ? 1 : 0);

  return curledCount >= 3;
};

/**
 * Open Palm (5 fingers / Palm Mode):
 * Dedicated detector for full open palm.
 * Recognizes when all 4 non-thumb fingers are extended and the thumb
 * is open or relaxed (not folded across the palm).
 *
 * @param {Array<{x:number, y:number, z:number}>} lm
 * @returns {boolean}
 */
export const isOpenPalm = (lm) => {
  const fIndex  = isExtended(lm, FINGERS.index);
  const fMiddle = isExtended(lm, FINGERS.middle);
  const fRing   = isExtended(lm, FINGERS.ring);
  const fPinky  = isExtended(lm, FINGERS.pinky);

  const extCount = (fIndex ? 1 : 0) + (fMiddle ? 1 : 0) + (fRing ? 1 : 0) + (fPinky ? 1 : 0);

  // When all 4 fingers (index, middle, ring, pinky) are extended
  if (extCount === 4) {
    // If thumb is extended, it's 100% open palm
    if (isThumbExtended(lm)) return true;

    // Even if thumb ratio is borderline, check if thumb is not tucked into pinky base
    const thumbTucked = dist(lm[LM.THUMB_TIP], lm[LM.PINKY_MCP]) < dist(lm[LM.THUMB_MCP], lm[LM.PINKY_MCP]) * 0.75;
    return !thumbTucked;
  }

  // If 3 of 4 fingers are extended and thumb is extended, check if no finger is curled
  if (extCount === 3 && isThumbExtended(lm)) {
    const noneCurled = Object.values(FINGERS).every((f) => !isCurled(lm, f));
    if (noneCurled) return true;
  }

  return false;
};

/**
 * Love / ILY sign: thumb + index + pinky extended; middle + ring
 * must be DEEPLY curled (not just slightly bent).
 */
const isLoveSign = (lm) =>
  isThumbExtended(lm) &&
  isExtended(lm, FINGERS.index) &&
  isCurled(lm, FINGERS.middle) &&
  isCurled(lm, FINGERS.ring) &&
  isExtended(lm, FINGERS.pinky);

/**
 * Peace sign: index and middle extended, ring and pinky deeply curled.
 */
const isPeaceSign = (lm) =>
  isExtended(lm, FINGERS.index) &&
  isExtended(lm, FINGERS.middle) &&
  isCurled(lm, FINGERS.ring) &&
  isCurled(lm, FINGERS.pinky);

// ── Public interface ─────────────────────────────────────────

/**
 * @typedef {'fist'|'thumbsup'|'love'|'2'|'1'|'3'|'4'|'5'} GestureResult
 */

/**
 * Classifies a single hand's 21 MediaPipe landmarks into a named gesture.
 *
 * Priority (high → low):
 *   1. fist        — prevents overlap with "0 fingers" count
 *   2. thumbsup    — thumb out + all fingers curled
 *   3. open palm   — full 5-finger open hand
 *   4. peace       — index + middle extended (very reliable)
 *   5. love / ILY  — specific combination
 *   6. N fingers   — 1–5 open fingers
 *
 * Returns null when no meaningful gesture matches.
 *
 * @param {Array<{x:number, y:number, z:number}>} landmarks  21 points
 * @returns {GestureResult | null}
 */
export const classifyGesture = (landmarks) => {
  if (!landmarks || landmarks.length < 21) return null;

  // Priority 1 — fist
  if (isFist(landmarks)) return 'fist';

  // Priority 2 — thumbs-up
  if (isThumbsUp(landmarks)) return 'thumbsup';

  // Priority 3 — open palm (5 fingers)
  if (isOpenPalm(landmarks)) return '5';

  // Priority 4 — peace sign (✌️ easy to read, enters Draw Mode)
  if (isPeaceSign(landmarks)) return '2';

  // Priority 5 — love sign
  if (isLoveSign(landmarks)) return 'love';

  // Priority 6 — finger count (1–5)
  const count = countExtended(landmarks);
  const thumb = isThumbExtended(landmarks);

  if (count === 4 && thumb) return '5';
  if (count >= 1 && count <= 4) return String(count);

  return null;
};

// ── Two-Hand Portal & Zoom Helpers ───────────────────────────

/**
 * Converts a MediaPipe normalized landmark { x, y } to mirrored canvas pixels,
 * accounting for canvas zoom transform around center.
 *
 * @param {{ x: number, y: number }} lm
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {number} zoom - Zoom factor
 * @returns {{ x: number, y: number }}
 */
const toScreenCoords = (lm, w, h, zoom = 1) => {
  // Mirror X because video is horizontally flipped
  let x = (1 - lm.x) * w;
  let y = lm.y * h;

  if (zoom !== 1) {
    const cx = w / 2;
    const cy = h / 2;
    x = cx + (x - cx) * zoom;
    y = cy + (y - cy) * zoom;
  }

  return { x, y };
};

/**
 * Calculates polygon area using Shoelace formula.
 * @param {Array<{x:number, y:number}>} pts
 * @returns {number}
 */
const polygonArea = (pts) => {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
};

// Portal twist is relative to the initial two-hand pose, not the hands'
// absolute orientation (which varies naturally between users).
let portalTwistReference = null;
let portalTwistSmoothed = 0;
let portalHandAngleReference = null;
let portalLeftWrist = null;
let portalRightWrist = null;

/**
 * Sorts points in angular order around their centroid to prevent
 * self-intersecting polygon (hourglass) artifacts.
 *
 * @param {Array<{x:number, y:number, label?:string}>} pts
 * @returns {Array<{x:number, y:number, label?:string}>}
 */
const sortPointsClockwise = (pts) => {
  if (pts.length < 3) return pts;
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;

  return [...pts].sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });
};

/**
 * @typedef {Object} PortalInfo
 * @property {Array<{x:number, y:number, label?:string}>} corners - 4 cyclic corner points
 * @property {{x:number, y:number}} center - Centroid
 * @property {{minX:number, minY:number, maxX:number, maxY:number, width:number, height:number}} bounds
 * @property {number} area - Polygon area in square pixels
 * @property {number} handCount - 1 or 2
 */

/**
 * Filters out duplicate or nearly identical points to avoid clutter.
 * @param {Array<{x:number, y:number, label?:string}>} pts
 * @param {number} [minDist=16]
 */
const dedupeNearbyPoints = (pts, minDist = 16) => {
  const result = [];
  for (const p of pts) {
    if (!result.some((existing) => Math.hypot(existing.x - p.x, existing.y - p.y) < minDist)) {
      result.push(p);
    }
  }
  return result.length >= 3 ? result : pts;
};

/**
 * Extracts ONLY extended fingertips from a hand landmarks array.
 * Fingers curled into palm/fist are strictly excluded.
 *
 * @param {Array<{x:number, y:number, z:number}>} lm - 21 MediaPipe points
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} zoom
 * @param {string} prefix - 'L' or 'R' or ''
 * @returns {Array<{x:number, y:number, label:string, id:string}>}
 */
const getExtendedFingertips = (lm, canvasW, canvasH, zoom = 1, prefix = '') => {
  if (!lm || lm.length < 21) return [];

  const points = [];
  const tag = prefix ? `${prefix}-` : '';

  // 1. Thumb (only if extended outward)
  if (isThumbExtended(lm)) {
    points.push({
      ...toScreenCoords(lm[LM.THUMB_TIP], canvasW, canvasH, zoom),
      label: `${tag}THM`,
      id: 'thumb',
    });
  }

  // 2. Index finger (only if extended outward)
  if (isExtended(lm, FINGERS.index)) {
    points.push({
      ...toScreenCoords(lm[LM.INDEX_TIP], canvasW, canvasH, zoom),
      label: `${tag}IDX`,
      id: 'index',
    });
  }

  // 3. Middle finger (only if extended outward)
  if (isExtended(lm, FINGERS.middle)) {
    points.push({
      ...toScreenCoords(lm[LM.MIDDLE_TIP], canvasW, canvasH, zoom),
      label: `${tag}MID`,
      id: 'middle',
    });
  }

  // 4. Ring finger (only if extended outward)
  if (isExtended(lm, FINGERS.ring)) {
    points.push({
      ...toScreenCoords(lm[LM.RING_TIP], canvasW, canvasH, zoom),
      label: `${tag}RNG`,
      id: 'ring',
    });
  }

  // 5. Pinky finger (only if extended outward)
  if (isExtended(lm, FINGERS.pinky)) {
    points.push({
      ...toScreenCoords(lm[LM.PINKY_TIP], canvasW, canvasH, zoom),
      label: `${tag}PNK`,
      id: 'pinky',
    });
  }

  return points;
};

/**
 * Extracts 6-corner (or dynamic multi-corner) portal coordinates formed between fingertips.
 *
 * Rules:
 *  - ONLY extended fingertips are read. Curled/fist fingers are ignored.
 *  - When hands are closed or curled, collapses into a line (isClosed: true)
 *    so the user can navigate/switch effects inside the camera frame.
 *  - When fingers are stretched open, expands into a multi-corner cyber portal.
 *
 * @param {Array<Array<{x:number, y:number, z:number}>>} multiHandLandmarks
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {number} [zoom=1]
 * @returns {PortalInfo | null}
 */
export const extractPortalCorners = (multiHandLandmarks, canvasW, canvasH, zoom = 1) => {
  if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

/**
 * 2D Counter-Clockwise test for 3 points.
 * @param {{x:number, y:number}} a
 * @param {{x:number, y:number}} b
 * @param {{x:number, y:number}} c
 * @returns {boolean}
 */
const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

/**
 * Returns true if segment p1-p2 intersects segment p3-p4 in 2D space.
 * @param {{x:number, y:number}} p1
 * @param {{x:number, y:number}} p2
 * @param {{x:number, y:number}} p3
 * @param {{x:number, y:number}} p4
 * @returns {boolean}
 */
const segmentsIntersect = (p1, p2, p3, p4) => {
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
};

/**
 * Computes the signed polygon area using the Shoelace formula.
 * @param {Array<{x:number, y:number}>} pts
 * @returns {number}
 */
const polygonArea = (pts) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
};

/**
 * Orders 4 anchors from 2 hands into a non-self-intersecting diagonal ribbon/band.
 * Evaluates all candidate quadrilateral pairings between the two hands and selects
 * the simple (non-crossing) configuration that maximizes the portal aperture.
 *
 * @param {{x:number, y:number, label?:string}} L_IDX
 * @param {{x:number, y:number, label?:string}} L_THM
 * @param {{x:number, y:number, label?:string}} R_IDX
 * @param {{x:number, y:number, label?:string}} R_THM
 * @returns {Array<{x:number, y:number, label?:string}>}
 */
const orderPortalBandCorners = (L_IDX, L_THM, R_IDX, R_THM) => {
  // Candidate 1: Direct rails (L_IDX <-> R_IDX, L_THM <-> R_THM)
  // Loop: L_IDX -> R_IDX -> R_THM -> L_THM
  const cross1A = segmentsIntersect(L_IDX, R_IDX, L_THM, R_THM);
  const cross1B = segmentsIntersect(R_IDX, R_THM, L_THM, L_IDX);
  const isSimple1 = !cross1A && !cross1B;
  const area1 = isSimple1 ? Math.abs(polygonArea([L_IDX, R_IDX, R_THM, L_THM])) : 0;

  // Candidate 2: Alternate rails (L_IDX <-> R_THM, L_THM <-> R_IDX)
  // Loop: L_IDX -> R_THM -> R_IDX -> L_THM
  const cross2A = segmentsIntersect(L_IDX, R_THM, L_THM, R_IDX);
  const cross2B = segmentsIntersect(R_THM, R_IDX, L_THM, L_IDX);
  const isSimple2 = !cross2A && !cross2B;
  const area2 = isSimple2 ? Math.abs(polygonArea([L_IDX, R_THM, R_IDX, L_THM])) : 0;

  // Candidate 3: Inverted rails (L_THM <-> R_IDX, L_IDX <-> R_THM)
  // Loop: L_THM -> R_IDX -> R_THM -> L_IDX
  const cross3A = segmentsIntersect(L_THM, R_IDX, L_IDX, R_THM);
  const cross3B = segmentsIntersect(R_IDX, R_THM, L_IDX, L_THM);
  const isSimple3 = !cross3A && !cross3B;
  const area3 = isSimple3 ? Math.abs(polygonArea([L_THM, R_IDX, R_THM, L_IDX])) : 0;

  if (isSimple1 && area1 >= area2 && area1 >= area3) {
    return [L_IDX, R_IDX, R_THM, L_THM];
  }
  if (isSimple2 && area2 >= area1 && area2 >= area3) {
    return [L_IDX, R_THM, R_IDX, L_THM];
  }
  if (isSimple3 && area3 >= area1 && area3 >= area2) {
    return [L_THM, R_IDX, R_THM, L_IDX];
  }

  // Fallback: Polar sort around centroid guarantees simple non-self-intersecting quad
  return sortPointsClockwise([L_IDX, L_THM, R_IDX, R_THM]);
};

  const handCount = multiHandLandmarks.length;

  if (handCount >= 2) {
    // Stable left/right hand assignment
    const h0ScreenX = (1 - multiHandLandmarks[0][LM.WRIST].x) * canvasW;
    const h0ScreenY = multiHandLandmarks[0][LM.WRIST].y * canvasH;
    const h1ScreenX = (1 - multiHandLandmarks[1][LM.WRIST].x) * canvasW;
    const h1ScreenY = multiHandLandmarks[1][LM.WRIST].y * canvasH;

    let leftHand = multiHandLandmarks[0];
    let rightHand = multiHandLandmarks[1];

    if (portalLeftWrist && portalRightWrist) {
      const d0L = Math.hypot(h0ScreenX - portalLeftWrist.x, h0ScreenY - portalLeftWrist.y);
      const d1L = Math.hypot(h1ScreenX - portalLeftWrist.x, h1ScreenY - portalLeftWrist.y);
      if (Math.min(d0L, d1L) < 250) {
        if (d1L < d0L) {
          leftHand  = multiHandLandmarks[1];
          rightHand = multiHandLandmarks[0];
        }
      } else {
        if (h0ScreenX > h1ScreenX) {
          leftHand  = multiHandLandmarks[1];
          rightHand = multiHandLandmarks[0];
        }
      }
    } else {
      if (h0ScreenX > h1ScreenX) {
        leftHand  = multiHandLandmarks[1];
        rightHand = multiHandLandmarks[0];
      }
    }

    portalLeftWrist  = { x: (1 - leftHand[LM.WRIST].x) * canvasW, y: leftHand[LM.WRIST].y * canvasH };
    portalRightWrist = { x: (1 - rightHand[LM.WRIST].x) * canvasW, y: rightHand[LM.WRIST].y * canvasH };

    // ── 3D Twist Counter-Rotation Calculation ────────────────
    // Measures the relative rotational tilt of the two hands in 3D
    const leftAngle = Math.atan2(
      leftHand[LM.MIDDLE_MCP].y - leftHand[LM.WRIST].y,
      (1 - leftHand[LM.MIDDLE_MCP].x) - (1 - leftHand[LM.WRIST].x),
    );
    const rightAngle = Math.atan2(
      rightHand[LM.MIDDLE_MCP].y - rightHand[LM.WRIST].y,
      (1 - rightHand[LM.MIDDLE_MCP].x) - (1 - rightHand[LM.WRIST].x),
    );

    // Z-depth tilt difference between hands
    const leftZDiff = (leftHand[LM.INDEX_TIP].z - leftHand[LM.WRIST].z);
    const rightZDiff = (rightHand[LM.INDEX_TIP].z - rightHand[LM.WRIST].z);
    const zCounterTilt = Math.abs(leftZDiff - rightZDiff) * 3.2;

    let diffAngle = rightAngle - leftAngle;
    while (diffAngle > Math.PI) diffAngle -= 2 * Math.PI;
    while (diffAngle < -Math.PI) diffAngle += 2 * Math.PI;

    if (portalTwistReference === null) {
      portalTwistReference = diffAngle;
    }
    let relativeTwist = diffAngle - portalTwistReference;
    while (relativeTwist > Math.PI) relativeTwist -= 2 * Math.PI;
    while (relativeTwist < -Math.PI) relativeTwist += 2 * Math.PI;

    // Twist magnitude (0 to 1) combining counter-rotation angle and 3D Z tilt
    const twistMag = Math.max(
      Math.min(1, Math.abs(relativeTwist) / (Math.PI * 0.45)),
      Math.min(1, zCounterTilt)
    );
    const twistTarget = twistMag < 0.08 ? 0 : twistMag;
    portalTwistSmoothed += (twistTarget - portalTwistSmoothed) * 0.25;
    const twist = Math.round(portalTwistSmoothed * 100) / 100;

    // 4 topological anchors for the 2-hand portal:
    // Left hand: Index (L_IDX) and Thumb (L_THM)
    // Right hand: Index (R_IDX) and Thumb (R_THM)
    const L_IDX = { ...toScreenCoords(leftHand[LM.INDEX_TIP], canvasW, canvasH, zoom), label: 'L-IDX' };
    const L_THM = { ...toScreenCoords(leftHand[LM.THUMB_TIP], canvasW, canvasH, zoom), label: 'L-THM' };
    const R_IDX = { ...toScreenCoords(rightHand[LM.INDEX_TIP], canvasW, canvasH, zoom), label: 'R-IDX' };
    const R_THM = { ...toScreenCoords(rightHand[LM.THUMB_TIP], canvasW, canvasH, zoom), label: 'R-THM' };

    const corners = orderPortalBandCorners(L_IDX, L_THM, R_IDX, R_THM);

    const leftAnchor  = L_IDX;
    const rightAnchor = R_IDX;
    const anchorDist = Math.hypot(leftAnchor.x - rightAnchor.x, leftAnchor.y - rightAnchor.y);
    const wristDist  = Math.hypot(portalLeftWrist.x - portalRightWrist.x, portalLeftWrist.y - portalRightWrist.y);

    // Only close if hands are literally touching together
    const isClosed = anchorDist < 20 && wristDist < 40;

    const cx = (leftAnchor.x + rightAnchor.x) / 2;
    const cy = (leftAnchor.y + rightAnchor.y) / 2;

    if (isClosed) {
      return {
        isClosed: true,
        line: { p1: leftAnchor, p2: rightAnchor },
        corners: [leftAnchor, rightAnchor],
        center: { x: cx, y: cy },
        bounds: {
          minX: Math.min(leftAnchor.x, rightAnchor.x),
          maxX: Math.max(leftAnchor.x, rightAnchor.x),
          minY: Math.min(leftAnchor.y, rightAnchor.y),
          maxY: Math.max(leftAnchor.y, rightAnchor.y),
          width: Math.abs(rightAnchor.x - leftAnchor.x),
          height: Math.abs(rightAnchor.y - leftAnchor.y),
        },
        area: 0,
        handCount,
        extendedCount: 4,
        twist,
        twistAngle: relativeTwist,
      };
    }

    // OPEN portal (supports full 3D twisting!)
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(canvasW, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(canvasH, Math.max(...ys));

    return {
      isClosed: false,
      corners,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      bounds: {
        minX,
        minY,
        maxX,
        maxY,
        width:  Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      area: Math.max(1, (maxX - minX) * (maxY - minY)),
      handCount,
      extendedCount: 4,
      twist,
      twistAngle: relativeTwist,
    };
  } else {
    // 1 Hand: 4-Point Quad Portal (Thumb, Index, Pinky, Wrist)
    portalLeftWrist = null;
    portalRightWrist = null;
    const hand = multiHandLandmarks[0];
    const wrist    = toScreenCoords(hand[LM.WRIST], canvasW, canvasH, zoom);
    const indexTip = toScreenCoords(hand[LM.INDEX_TIP], canvasW, canvasH, zoom);
    const thumbTip = toScreenCoords(hand[LM.THUMB_TIP], canvasW, canvasH, zoom);
    const pinkyTip = toScreenCoords(hand[LM.PINKY_TIP], canvasW, canvasH, zoom);

    // Sort around hand centroid by polar angle to prevent self-intersection
    const rawCorners = [
      { ...thumbTip, label: 'THM' },
      { ...indexTip, label: 'IDX' },
      { ...pinkyTip, label: 'PNK' },
      { ...wrist,    label: 'WRS' },
    ];
    const hcx = (wrist.x + indexTip.x + thumbTip.x + pinkyTip.x) / 4;
    const hcy = (wrist.y + indexTip.y + thumbTip.y + pinkyTip.y) / 4;
    const corners = [...rawCorners].sort((a, b) =>
      Math.atan2(a.y - hcy, a.x - hcx) - Math.atan2(b.y - hcy, b.x - hcx)
    );

    const isClenched = isFist(hand);
    if (isClenched) {
      return {
        isClosed: true,
        line: { p1: wrist, p2: indexTip },
        corners: [wrist, indexTip],
        center: { x: (wrist.x + indexTip.x) / 2, y: (wrist.y + indexTip.y) / 2 },
        bounds: {
          minX: Math.min(wrist.x, indexTip.x),
          maxX: Math.max(wrist.x, indexTip.x),
          minY: Math.min(wrist.y, indexTip.y),
          maxY: Math.max(wrist.y, indexTip.y),
          width: Math.abs(indexTip.x - wrist.x),
          height: Math.abs(indexTip.y - wrist.y),
        },
        area: 0,
        handCount,
        extendedCount: 1,
        twist: 0,
        twistAngle: 0,
      };
    }

    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(canvasW, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(canvasH, Math.max(...ys));

    return {
      isClosed: false,
      corners,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      bounds: {
        minX,
        minY,
        maxX,
        maxY,
        width:  Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      area: Math.max(1, (maxX - minX) * (maxY - minY)),
      handCount,
      extendedCount: 4,
      twist: 0,
      twistAngle: 0,
    };
  }
};

/**
 * Calculates normalized distance between two hands' wrists.
 * Useful for pinch-to-zoom using two hands.
 *
 * @param {Array<Array<{x:number, y:number, z:number}>>} multiHandLandmarks
 * @returns {number | null} Normalized distance (approx 0.1 to 1.0)
 */
export const getTwoHandDistance = (multiHandLandmarks) => {
  if (!multiHandLandmarks || multiHandLandmarks.length < 2) return null;
  const w0 = multiHandLandmarks[0][LM.WRIST];
  const w1 = multiHandLandmarks[1][LM.WRIST];
  return dist(w0, w1);
};

/**
 * Returns pinch distance between thumb and index finger on a single hand.
 *
 * @param {Array<{x:number, y:number}>} lm
 * @returns {number} Normalized distance
 */
export const getPinchDistance = (lm) => {
  if (!lm || lm.length < 21) return 1;
  return dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]);
};

/**
 * @typedef {Object} PinchZoomState
 * @property {number} delta - Signed zoom delta (+ for open/zoom in, - for closed/zoom out)
 * @property {number} ratio - Normalized pinch ratio (distance / handScale)
 * @property {boolean} isPinching - True when fingers are close (< 0.42)
 * @property {{x:number, y:number}} thumb - Thumb tip normalized position
 * @property {{x:number, y:number}} index - Index tip normalized position
 */

/**
 * Creates an intelligent tracker for thumb-to-index finger pinch zoom gesture.
 *
 * Mechanics:
 *   - From closed to open (tertutup → terbuka): Zoom In (+)
 *   - From open to closed (terbuka → tertutup): Zoom Out (-)
 *
 * @returns {{ update: (lm: Array<{x:number,y:number,z:number}>) => PinchZoomState | null, reset: () => void }}
 */
export const createPinchZoomTracker = () => {
  let prevSmoothedRatio = null;
  let smoothedRatio     = null;

  return {
    /**
     * Updates the pinch tracker with current hand landmarks.
     *
     * @param {Array<{x:number, y:number, z:number}>} lm
     * @returns {PinchZoomState | null}
     */
    update(lm) {
      if (!lm || lm.length < 21) {
        prevSmoothedRatio = null;
        smoothedRatio     = null;
        return null;
      }

      // CRITICAL GUARD: Reject non-pinch poses
      // 1. Thumbs-up: index is curled into a fist while thumb is extended
      if (isThumbsUp(lm) || isCurled(lm, FINGERS.index)) {
        prevSmoothedRatio = null;
        smoothedRatio     = null;
        return null;
      }

      // 2. Open palm: all fingers spread open (not a pinch)
      if (isOpenPalm(lm)) {
        prevSmoothedRatio = null;
        smoothedRatio     = null;
        return null;
      }

      // 3. Fist: all fingers curled
      if (isFist(lm)) {
        prevSmoothedRatio = null;
        smoothedRatio     = null;
        return null;
      }

      // 4. Peace sign: index + middle extended in V-shape
      if (isPeaceSign(lm)) {
        prevSmoothedRatio = null;
        smoothedRatio     = null;
        return null;
      }

      // Hand scale reference (wrist to middle MCP joint)
      const handScale = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.3;
      const rawDist   = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
      const ratio     = rawDist / handScale;

      if (smoothedRatio === null) {
        smoothedRatio     = ratio;
        prevSmoothedRatio = ratio;
        return {
          delta: 0,
          ratio,
          isPinching: ratio < 0.42,
          thumb: { x: lm[4].x, y: lm[4].y },
          index: { x: lm[8].x, y: lm[8].y },
        };
      }

      // Low-pass filter to eliminate sensor tremor
      smoothedRatio = smoothedRatio * 0.70 + ratio * 0.30;
      const diff    = smoothedRatio - prevSmoothedRatio;
      prevSmoothedRatio = smoothedRatio;

      // Deadband threshold to eliminate static jitter
      const deadband = 0.006;
      let delta = 0;

      if (Math.abs(diff) > deadband) {
        // Gain: smooth scaling across typical pinch-spread range
        delta = diff * 2.8;
      }

      return {
        delta,
        ratio: smoothedRatio,
        isPinching: smoothedRatio < 0.42,
        thumb: { x: lm[4].x, y: lm[4].y },
        index: { x: lm[8].x, y: lm[8].y },
      };
    },

    reset() {
      prevSmoothedRatio = null;
      smoothedRatio     = null;
    },
  };
};
