export function bumpCounter(current) {
  const value = Number(current);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= Number.MAX_SAFE_INTEGER) return 0;
  return value + 1;
}

