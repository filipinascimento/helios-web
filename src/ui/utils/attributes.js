export function isPublicAttributeName(name) {
  if (typeof name !== 'string') return false;
  if (name.startsWith('_')) return false;
  return true;
}

