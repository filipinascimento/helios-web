function toPointerArray(points) {
  if (!points) return [];
  if (Array.isArray(points)) return points.filter(Boolean);
  if (points instanceof Map) return Array.from(points.values()).filter(Boolean);
  return Array.from(points).filter(Boolean);
}

function sortPointers(points) {
  return [...toPointerArray(points)].sort((a, b) => (a.pointerId ?? 0) - (b.pointerId ?? 0));
}

export function computeGestureCentroid(points) {
  const ordered = sortPointers(points);
  if (!ordered.length) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const point of ordered) {
    sumX += point.clientX ?? 0;
    sumY += point.clientY ?? 0;
  }
  return {
    x: sumX / ordered.length,
    y: sumY / ordered.length,
  };
}

export function computePinchDistance(points) {
  const ordered = sortPointers(points);
  if (ordered.length < 2) return 0;
  const [a, b] = ordered;
  return Math.hypot((b.clientX ?? 0) - (a.clientX ?? 0), (b.clientY ?? 0) - (a.clientY ?? 0));
}

export function computeTwistAngle(points) {
  const ordered = sortPointers(points);
  if (ordered.length < 2) return 0;
  const [a, b] = ordered;
  return Math.atan2((b.clientY ?? 0) - (a.clientY ?? 0), (b.clientX ?? 0) - (a.clientX ?? 0));
}

export function snapshotTouchGesture(points) {
  const ordered = sortPointers(points);
  return {
    pointers: ordered,
    count: ordered.length,
    centroid: computeGestureCentroid(ordered),
    distance: computePinchDistance(ordered),
    angle: computeTwistAngle(ordered),
  };
}

export function classifyGestureForSuppression(startPoints, currentPoints, tolerancePx = 4) {
  const orderedStart = sortPointers(startPoints);
  const orderedCurrent = sortPointers(currentPoints);
  const limit = Math.max(0, Number(tolerancePx) || 0);
  const count = Math.min(orderedStart.length, orderedCurrent.length);
  let maxPointerTravel = 0;
  for (let i = 0; i < count; i += 1) {
    const start = orderedStart[i];
    const current = orderedCurrent[i];
    const travel = Math.hypot(
      (current?.clientX ?? 0) - (start?.clientX ?? 0),
      (current?.clientY ?? 0) - (start?.clientY ?? 0),
    );
    if (travel > maxPointerTravel) maxPointerTravel = travel;
  }
  const startGesture = snapshotTouchGesture(orderedStart);
  const currentGesture = snapshotTouchGesture(orderedCurrent);
  const centroidDistance = Math.hypot(
    currentGesture.centroid.x - startGesture.centroid.x,
    currentGesture.centroid.y - startGesture.centroid.y,
  );
  const pinchDelta = currentGesture.distance - startGesture.distance;
  const twistDelta = currentGesture.angle - startGesture.angle;
  return {
    pointerCount: orderedCurrent.length,
    moved: maxPointerTravel > limit || centroidDistance > limit || Math.abs(pinchDelta) > limit,
    maxPointerTravel,
    centroidDistance,
    pinchDelta,
    twistDelta,
  };
}
