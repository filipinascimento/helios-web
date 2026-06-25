function hexToRgb01(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3,8}$/i.test(raw)) return null;
  const expand = (c) => `${c}${c}`;
  let r; let g; let b;
  if (raw.length === 3) {
    r = parseInt(expand(raw[0]), 16);
    g = parseInt(expand(raw[1]), 16);
    b = parseInt(expand(raw[2]), 16);
  } else if (raw.length >= 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else {
    return null;
  }
  if (![r, g, b].every(Number.isFinite)) return null;
  return [r / 255, g / 255, b / 255];
}

export function toHex8(hex6, alpha01 = 1) {
  const rgb = hexToRgb01(hex6);
  if (!rgb) return '#000000ff';
  const a = Math.round(Math.max(0, Math.min(1, Number(alpha01))) * 255);
  const aa = a.toString(16).padStart(2, '0');
  const raw = String(hex6).trim();
  const base = raw.startsWith('#') ? raw.slice(1) : raw;
  const normalized = base.length === 3
    ? base.split('').map((c) => `${c}${c}`).join('')
    : base.slice(0, 6).padEnd(6, '0');
  return `#${normalized}${aa}`;
}

